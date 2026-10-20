from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.audit import audit
from app.core.deps import require
from app.core.limiter import limiter
from app.db.mongo import db, oid, ser, sign_file_url
from app.services.files_store import save_blob
from app.services.vision.privacy import blurred_thumbnail
from app.services.vision.quality import dhash

router = APIRouter()
GOVT_WRITE = ("super_admin", "scheme_officer")
GOVT_READ = (*GOVT_WRITE, "auditor")


def _validate_polygon(poly: list[list[float]]) -> None:
    if len(poly) < 3:
        raise HTTPException(
            422, detail={"detail": "Polygon needs >=3 points", "code": "BAD_POLYGON"}
        )
    for pt in poly:
        if not (0 <= pt[0] <= 1 and 0 <= pt[1] <= 1):
            raise HTTPException(
                422, detail={"detail": "Coordinates must be 0..1", "code": "BAD_COORD"}
            )


@router.get("/cameras")
@limiter.limit("100/minute")
def list_cameras(
    request: Request,
    status: str | None = None,
    setup_status: str | None = None,
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user=Depends(require(*GOVT_READ)),
):
    q = {}
    if status:
        q["status"] = status
    if setup_status:
        q["setup_status"] = setup_status
    if cursor:
        q["_id"] = {"$lt": oid(cursor)}
    items = list(db.cameras.find(q).sort("_id", -1).limit(limit + 1))
    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = str(items[-1]["_id"])
    return {"items": ser(items), "next_cursor": next_cursor}


def _source_kind(uri: str) -> str:
    u = (uri or "").strip()
    if u.startswith("rtsp://") or u.startswith("rtmp://"):
        return "rtsp"
    if u.startswith("webcam:"):
        return "webcam"
    if u.startswith("file:"):
        return "file"
    return "browser"


@router.post("/my/cameras")
@limiter.limit("30/minute")
def create_camera(request: Request, body: dict, user=Depends(require("centre_admin"))):
    cid = user["centre_id"]
    now = datetime.now(timezone.utc)
    uri = body["source_uri"]
    kind = _source_kind(uri)
    n = db.cameras.count_documents({"centre_id": cid})
    interval = int(body.get("interval_s", 10))
    if not 5 <= interval <= 120:
        raise HTTPException(422, detail={"detail": "interval_s must be 5..120", "code": "BAD_INTERVAL"})
    name = body["name"].strip()
    name_lower = name.lower()
    existing = db.cameras.find_one({"centre_id": cid, "name_lower": name_lower})
    if existing:
        raise HTTPException(409, detail={"detail": "A camera with this name already exists", "code": "CAMERA_EXISTS"})
    doc = {
        "centre_id": cid,
        "name": name,
        "name_lower": name_lower,
        "source_uri": uri,
        "source_kind": kind,
        "live": {"enabled": True, "interval_s": interval, "tiling": False},
        "subtract_staff": n == 0,
        "zone_label": body.get("zone_label"),
        "resolution": body.get("resolution"),
        "roi_polygon": None,
        "zones": None,
        "reference_phash": None,
        "setup_status": "draft",
        "status": "unknown",
        "created_at": now,
    }
    doc["_id"] = db.cameras.insert_one(doc).inserted_id
    audit(user, "camera.create", "camera", str(doc["_id"]), {"name": doc["name"], "source_kind": kind})
    return ser(doc)


@router.put("/my/cameras/{cam_id}/live")
@limiter.limit("60/minute")
def update_camera_live(
    request: Request, cam_id: str, body: dict, user=Depends(require("centre_admin"))
):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c or str(c["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    live = c.get("live") or {}
    if "enabled" in body:
        live["enabled"] = bool(body["enabled"])
    if "tiling" in body:
        live["tiling"] = bool(body["tiling"])
    if "interval_s" in body:
        interval = int(body["interval_s"])
        if not 5 <= interval <= 120:
            raise HTTPException(
                422, detail={"detail": "interval_s must be 5..120", "code": "BAD_INTERVAL"}
            )
        live["interval_s"] = interval
    db.cameras.update_one({"_id": c["_id"]}, {"$set": {"live": live}})
    audit(user, "camera.live", "camera", cam_id, {"live": live})
    return ser({**c, "live": live})


@router.get("/my/cameras")
@limiter.limit("100/minute")
def list_my_cameras(request: Request, user=Depends(require("centre_admin", "trainer"))):
    cid = user["centre_id"]
    return ser(list(db.cameras.find({"centre_id": cid}).sort("created_at", -1)))


@router.get("/my/cameras/{cam_id}")
@limiter.limit("100/minute")
def get_camera(request: Request, cam_id: str, user=Depends(require("centre_admin", "trainer"))):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c or str(c["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    return ser(c)


@router.put("/my/cameras/{cam_id}/setup")
@limiter.limit("30/minute")
def update_camera_setup(
    request: Request, cam_id: str, body: dict, user=Depends(require("centre_admin"))
):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c or str(c["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if c["setup_status"] in ("approved", "submitted"):
        raise HTTPException(
            409, detail={"detail": "Cannot edit after submission", "code": "BAD_STATE"}
        )

    roi = body.get("roi_polygon")
    zones = body.get("zones")
    if roi:
        _validate_polygon(roi)
    if zones:
        for z in zones:
            _validate_polygon(z["polygon"])

    now = datetime.now(timezone.utc)
    db.cameras.update_one(
        {"_id": c["_id"]},
        {"$set": {"roi_polygon": roi, "zones": zones, "updated_at": now}},
    )
    audit(user, "camera.setup", "camera", cam_id, {"roi": bool(roi), "zones": bool(zones)})
    return ser({**c, "roi_polygon": roi, "zones": zones, "updated_at": now})


@router.get("/my/cameras/{cam_id}/reference-frame")
@limiter.limit("100/minute")
def get_reference_frame(
    request: Request, cam_id: str, user=Depends(require("centre_admin", "trainer"))
):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c or str(c["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if not c.get("reference_blob_id"):
        # webcam/rtsp/file: grab a frame ourselves on first request
        if c.get("source_kind") in ("webcam", "rtsp", "file"):
            frame = _grab_source_frame(c)
            if frame is not None:
                row = _store_reference(c, frame, user)
                return row
        raise HTTPException(404, detail={"detail": "No reference frame", "code": "NOT_FOUND"})

    url = sign_file_url("evidence", c["reference_blob_id"])
    return {
        "url": url,
        "width": c.get("reference_width"),
        "height": c.get("reference_height"),
        "quality": c.get("reference_quality"),
    }


def _grab_source_frame(c) -> "np.ndarray | None":
    """webcam/rtsp/file sources: grab one frame server-side."""
    uri = c.get("source_uri") or ""
    if c.get("source_kind") == "webcam" and uri.startswith("webcam:"):
        cap = cv2.VideoCapture(int(uri.split(":", 1)[1]))
    elif c.get("source_kind") == "file" and uri.startswith("file:"):
        cap = cv2.VideoCapture(uri.split(":", 1)[1])
    elif c.get("source_kind") == "rtsp":
        cap = cv2.VideoCapture(uri)
    else:
        return None
    ok, frame = cap.read()
    cap.release()
    return frame if ok else None


@router.post("/my/cameras/{cam_id}/reference-frame")
@limiter.limit("30/minute")
async def upload_reference_frame(
    request: Request,
    cam_id: str,
    file: UploadFile,
    user=Depends(require("centre_admin")),
):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c or str(c["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    data = await file.read(4_000_001)
    if len(data) > 4_000_000:
        raise HTTPException(
            422, detail={"detail": "File too large", "code": "FILE_TOO_LARGE"}
        )
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(422, detail={"detail": "Unreadable image", "code": "BAD_FILE"})
    row = await run_in_threadpool(_store_reference, c, frame, user)
    return row


def _store_reference(c, frame, user) -> dict:
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mask = np.zeros(gray.shape, np.uint8)
    roi = c.get("roi_polygon") or []
    if len(roi) >= 3:
        cv2.fillPoly(
            mask,
            [np.array([[int(x * w), int(y * h)] for x, y in roi], np.int32)],
            255,
        )
    quality = {
        "brightness": round(float(gray.mean()), 1),
        "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
        "coverage": round(float(mask.mean() / 255), 3),
    }
    thumb = blurred_thumbnail(frame, [], [], width=min(640, w))
    eid = f"ref_{c['_id']}"
    save_blob(eid, c["centre_id"], thumb, "reference", camera_id=c["_id"])
    db.cameras.update_one(
        {"_id": c["_id"]},
        {
            "$set": {
                "reference_blob_id": eid,
                "reference_width": w,
                "reference_height": h,
                "reference_quality": quality,
                "reference_phash": dhash(frame),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    audit(user, "camera.reference", "camera", str(c["_id"]), {"w": w, "h": h})
    return {
        "url": sign_file_url("evidence", eid),
        "width": w,
        "height": h,
        "quality": quality,
    }


@router.post("/my/cameras/{cam_id}/submit")
@limiter.limit("30/minute")
def submit_camera(request: Request, cam_id: str, user=Depends(require("centre_admin"))):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c or str(c["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if not c.get("roi_polygon"):
        raise HTTPException(409, detail={"detail": "ROI not set", "code": "NO_ROI"})
    now = datetime.now(timezone.utc)
    db.cameras.update_one(
        {"_id": c["_id"]},
        {"$set": {"setup_status": "submitted", "submitted_at": now}},
    )
    total = db.cameras.count_documents({"centre_id": c["centre_id"]})
    done = db.cameras.count_documents(
        {"centre_id": c["centre_id"], "setup_status": {"$in": ["submitted", "approved"]}}
    )
    if total and done == total:
        db.centres.update_one(
            {"_id": c["centre_id"], "status": "pending_setup"},
            {"$set": {"status": "awaiting_camera_approval", "submitted_at": now}},
        )
    audit(user, "camera.submit", "camera", cam_id, {})
    return {"setup_status": "submitted"}


@router.post("/cameras/{cam_id}/approve")
@limiter.limit("30/minute")
def approve_camera(request: Request, cam_id: str, user=Depends(require(*GOVT_WRITE))):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if c["setup_status"] != "submitted":
        raise HTTPException(409, detail={"detail": "Not submitted", "code": "BAD_STATE"})
    now = datetime.now(timezone.utc)
    db.cameras.update_one(
        {"_id": c["_id"]},
        {"$set": {"setup_status": "approved", "decided_by": oid(user["id"]), "decided_at": now}},
    )
    centre = db.centres.find_one({"_id": c["centre_id"]})
    if centre and centre["status"] == "awaiting_camera_approval":
        total = db.cameras.count_documents({"centre_id": c["centre_id"]})
        approved = db.cameras.count_documents(
            {"centre_id": c["centre_id"], "setup_status": "approved"}
        )
        if total and approved == total:
            db.centres.update_one(
                {"_id": c["centre_id"]}, {"$set": {"status": "live", "live_since": now}}
            )
    audit(user, "camera.approve", "camera", cam_id, {})
    return {"setup_status": "approved"}


@router.post("/cameras/{cam_id}/reject")
@limiter.limit("30/minute")
def reject_camera(request: Request, cam_id: str, body: dict, user=Depends(require(*GOVT_WRITE))):
    c = db.cameras.find_one({"_id": oid(cam_id)})
    if not c:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if c["setup_status"] != "submitted":
        raise HTTPException(409, detail={"detail": "Not submitted", "code": "BAD_STATE"})
    reason = body.get("reason", "")
    if not reason:
        raise HTTPException(422, detail={"detail": "Reason required", "code": "NO_REASON"})
    now = datetime.now(timezone.utc)
    db.cameras.update_one(
        {"_id": c["_id"]},
        {
            "$set": {
                "setup_status": "rejected",
                "reject_reason": reason,
                "decided_by": oid(user["id"]),
                "decided_at": now,
            }
        },
    )
    centre = db.centres.find_one({"_id": c["centre_id"]})
    if centre and centre["status"] == "awaiting_camera_approval":
        db.centres.update_one(
            {"_id": c["centre_id"]},
            {"$set": {"status": "pending_setup"}, "$unset": {"submitted_at": ""}},
        )
    audit(user, "camera.reject", "camera", cam_id, {"reason": reason})
    return {"setup_status": "rejected"}
