from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.audit import audit
from app.core.deps import require
from app.db.mongo import db, oid
from app.services import ledger
from app.services.face import verify, FaceError

router = APIRouter()


@router.post("/my/sessions/{sid}/claim")
def claim(sid: str, body: dict, user=Depends(require("trainer", "centre_admin"))):
    s = db.sessions.find_one({"_id": oid(sid)})
    if not s or str(s["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(403, detail={"detail": "Wrong centre", "code": "WRONG_CENTRE"})
    ids = body["present_trainee_ids"]
    existing = db.attendance_claims.find_one({"session_id": oid(sid)})
    if existing and not body.get("edit_reason"):
        raise HTTPException(
            409,
            detail={"detail": "Already submitted. Provide edit_reason.", "code": "CLAIM_LOCKED"},
        )
    row = {
        "session_id": oid(sid),
        "centre_id": s["centre_id"],
        "claimed_count": len(ids),
        "present_trainee_ids": [oid(i) for i in ids],
        "marked_by": oid(user["id"]),
        "edit_reason": body.get("edit_reason"),
    }
    db.attendance_claims.update_one({"session_id": oid(sid)}, {"$set": row}, upsert=True)
    ledger.append(
        "claim", {"centre_id": str(s["centre_id"]), "session_id": str(sid), "claimed": len(ids)}
    )
    audit(user, "attendance.claim", "session", sid, {"claimed": len(ids)})

    # Immediately run consolidation for this session so flags and summary update
    try:
        from app.core.config import settings
        from app.services.live import consolidate_session
        centre = db.centres.find_one({"_id": s["centre_id"]})
        tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]}) if centre else None
        if tpl:
            cam_query = {"centre_id": s["centre_id"]}
            if not settings.record_provisional:
                cam_query["setup_status"] = "approved"
            for cam in db.cameras.find(cam_query):
                consolidate_session(s["_id"], cam, tpl, final=False)
    except Exception:
        pass

    return {"claimed_count": len(ids)}


@router.post("/my/sessions/{sid}/staff-scan")
def staff_scan(sid: str, body: dict, user=Depends(require("trainer"))):
    s = db.sessions.find_one({"_id": oid(sid)})
    if not s or str(s["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(403, detail={"detail": "Wrong centre", "code": "WRONG_CENTRE"})
    staff = db.staff.find_one({"user_id": oid(user["id"])})
    if not staff:
        raise HTTPException(404, detail={"detail": "Staff record not found", "code": "NO_STAFF_RECORD"})
    if not staff.get("face_enrolled"):
        raise HTTPException(
            403, detail={"detail": "Face not enrolled", "code": "FACE_NOT_ENROLLED"}
        )
    now = datetime.now(timezone.utc)
    if now < s["start_ts"] - timedelta(minutes=15) or now > s["end_ts"]:
        raise HTTPException(403, detail={"detail": "Outside scan window", "code": "OUTSIDE_WINDOW"})

    frames = body.get("frames_b64") or body.get("image_b64")
    if not frames:
        raise HTTPException(422, detail={"detail": "Provide frames_b64 array", "code": "NO_FACE"})
    if isinstance(frames, str):
        frames = [frames]

    face = db.staff_faces.find_one({"_id": staff["_id"]})
    if not face:
        raise HTTPException(403, detail={"detail": "No face enrolled", "code": "NOT_ENROLLED"})

    try:
        verified, score = verify(frames, face)
    except FaceError as fe:
        raise HTTPException(fe.status, detail={"detail": fe.msg, "code": fe.code, "advice": fe.advice})

    db.staff_attendance.update_one(
        {"session_id": oid(sid), "staff_id": staff["_id"]},
        {"$set": {"method": "face", "verified": verified, "score": score}},
        upsert=True,
    )
    return {"verified": verified, "score": score}
