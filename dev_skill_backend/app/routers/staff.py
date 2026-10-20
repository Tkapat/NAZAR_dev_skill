from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.audit import audit
from app.core.deps import require
from app.core.limiter import limiter
from app.db.mongo import db, oid, ser
from app.services.credentials import create_login, gen_password
from app.services.face import enrol_embedding, verify, health as face_health, FaceError, decode

router = APIRouter()


@router.get("/my/staff")
@limiter.limit("100/minute")
def list_staff(
    request: Request,
    active_only: bool = True,
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user=Depends(require("centre_admin")),
):
    cid = user["centre_id"]
    q = {"centre_id": cid}
    if active_only:
        q["active"] = True
    if cursor:
        q["_id"] = {"$lt": oid(cursor)}
    items = list(db.staff.find(q).sort("_id", -1).limit(limit + 1))
    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = str(items[-1]["_id"])
    return {"items": ser(items), "next_cursor": next_cursor}


@router.post("/my/staff")
@limiter.limit("30/minute")
def create_staff(request: Request, body: dict, user=Depends(require("centre_admin"))):
    cid = user["centre_id"]
    centre = db.centres.find_one({"_id": cid})
    if not centre or centre["status"] in ("suspended", "terminated"):
        raise HTTPException(403, detail={"detail": "Centre not active", "code": "CENTRE_INACTIVE"})

    login_id_code = f"trainer:{centre['code']}"
    counter = db.counters.find_one_and_update(
        {"_id": login_id_code}, {"$inc": {"n": 1}}, upsert=True, return_document=True
    )["n"]
    login_id = f"{centre['code']}-T{counter:02d}"
    if db.users.find_one({"login_id": login_id.lower()}):
        raise HTTPException(409, detail={"detail": "Login exists", "code": "LOGIN_EXISTS"})

    pwd = gen_password()
    staff_doc = {
        "centre_id": cid,
        "full_name": body["full_name"],
        "staff_role": body["staff_role"],
        "phone": body.get("phone"),
        "face_consent": False,
        "face_enrolled": False,
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    staff_id = db.staff.insert_one(staff_doc).inserted_id

    try:
        create_login(login_id, pwd, "trainer", cid, body["full_name"], body.get("phone"))
    except Exception:
        db.staff.delete_one({"_id": staff_id})
        raise

    db.staff.update_one(
        {"_id": staff_id},
        {"$set": {"user_id": db.users.find_one({"login_id": login_id.lower()})["_id"]}},
    )
    audit(user, "staff.create", "staff", str(staff_id), {"login_id": login_id})
    return {
        "login_id": login_id,
        "temporary_password": pwd,
        "expires_in_hours": 72,
        "note": "Shown once.",
    }


@router.post("/my/staff/{sid}/deactivate")
@limiter.limit("30/minute")
def deactivate_staff(request: Request, sid: str, user=Depends(require("centre_admin"))):
    s = db.staff.find_one({"_id": oid(sid), "centre_id": user["centre_id"]})
    if not s:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    db.staff.update_one({"_id": s["_id"]}, {"$set": {"active": False, "face_enrolled": False}})
    db.staff_faces.delete_one({"_id": s["_id"]})
    if s.get("user_id"):
        db.users.update_one({"_id": s["user_id"]}, {"$set": {"active": False}})
    audit(user, "staff.deactivate", "staff", sid, {})
    return {"ok": True}


@router.post("/my/staff/{sid}/face-enrol")
@limiter.limit("30/minute")
def enrol_face(
    request: Request, sid: str, body: dict, user=Depends(require("centre_admin", "trainer"))
):
    s = db.staff.find_one({"_id": oid(sid), "centre_id": user["centre_id"]})
    if not s:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if not s.get("face_consent"):
        raise HTTPException(422, detail={"detail": "Consent required", "code": "NO_CONSENT"})
    if user["role"] == "trainer" and str(s.get("user_id")) != user["id"]:
        raise HTTPException(403, detail={"detail": "Can only enrol own face", "code": "FORBIDDEN"})

    frames = body.get("frames_b64")
    if not frames or not isinstance(frames, list) or len(frames) < 1:
        raise HTTPException(422, detail={"detail": "Provide 1-5 frames", "code": "NO_FACE"})

    try:
        emb, backend = enrol_embedding(frames)
    except FaceError as fe:
        raise HTTPException(fe.status, detail={"detail": fe.msg, "code": fe.code, "advice": fe.advice})

    db.staff_faces.update_one(
        {"_id": s["_id"]},
        {
            "$set": {
                "embedding_enc": encrypt(emb),
                "model": "buffalo_s",
                "backend": backend,
                "n_frames": len(frames),
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    db.staff.update_one(
        {"_id": s["_id"]},
        {
            "$set": {
                "face_consent": True,
                "face_consent_at": datetime.now(timezone.utc),
                "face_enrolled": True,
            }
        },
    )
    audit(user, "staff.face_enrol", "staff", sid, {})
    return {"face_enrolled": True}


@router.delete("/my/staff/{sid}/face")
@limiter.limit("30/minute")
def delete_face(request: Request, sid: str, user=Depends(require("centre_admin"))):
    s = db.staff.find_one({"_id": oid(sid), "centre_id": user["centre_id"]})
    if not s:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    db.staff_faces.delete_one({"_id": s["_id"]})
    db.staff.update_one({"_id": s["_id"]}, {"$set": {"face_enrolled": False}})
    audit(user, "staff.face_delete", "staff", sid, {})
    return {"ok": True}


@router.post("/my/staff/me-official")
@limiter.limit("10/minute")
def add_self_as_official(request: Request, user=Depends(require("centre_admin"))):
    cid = user["centre_id"]
    centre = db.centres.find_one({"_id": cid})
    if not centre or centre["status"] in ("suspended", "terminated"):
        raise HTTPException(403, detail={"detail": "Centre not active", "code": "CENTRE_INACTIVE"})

    if db.staff.find_one({"centre_id": cid, "user_id": user["id"]}):
        raise HTTPException(409, detail={"detail": "Already exists", "code": "ALREADY_EXISTS"})

    staff_doc = {
        "centre_id": cid,
        "full_name": user["full_name"],
        "staff_role": "official",
        "phone": None,
        "face_consent": False,
        "face_enrolled": False,
        "active": True,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    staff_id = db.staff.insert_one(staff_doc).inserted_id
    audit(user, "staff.create", "staff", str(staff_id), {"role": "official", "self_added": True})
    return {"id": str(staff_id), "full_name": user["full_name"], "staff_role": "official"}
