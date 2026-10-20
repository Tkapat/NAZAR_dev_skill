from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request

from app.core.deps import require
from app.core.limiter import limiter
from app.db.mongo import db, ser

router = APIRouter()
OPEN = ["open", "acknowledged", "centre_responded", "under_review", "escalated"]


@router.get("/my/centre")
@limiter.limit("100/minute")
def my_centre(request: Request, user=Depends(require("centre_admin", "trainer"))):
    cid = user["centre_id"]
    centre = db.centres.find_one({"_id": cid})
    if not centre:
        return {
            "centre": None,
            "checklist": None,
            "status": None,
            "submitted_at": None,
            "stats": None,
        }

    cams = list(db.cameras.find({"centre_id": cid}))
    checklist = {
        "camera": any(c.get("roi_polygon") for c in cams),
        "batches": db.batches.count_documents({"centre_id": cid, "active": True}) > 0,
        "staff": db.staff.count_documents({"centre_id": cid, "active": True}) > 0,
        "equipment": bool(centre.get("equipment"))
        and all(e.get("declared_qty", 0) > 0 for e in centre["equipment"]),
        "submitted": centre["status"] != "pending_setup",
    }

    today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    statuses = {c.get("status", "unknown") for c in cams}
    if not cams:
        camera_status = "none"
    elif "tampered" in statuses:
        camera_status = "tampered"
    elif statuses == {"offline"}:
        camera_status = "offline"
    elif "online" in statuses:
        camera_status = "online"
    else:
        camera_status = "unknown"

    stats = {
        "open_flags": db.flags.count_documents({"centre_id": cid, "status": {"$in": OPEN}}),
        "unread_notices": db.notices.count_documents({"centre_id": cid, "read_at": None}),
        "sessions_today": db.sessions.count_documents({"centre_id": cid, "session_date": today}),
        "camera_status": camera_status,
        "camera_count": len(cams),
    }

    return {
        "centre": ser(centre),
        "checklist": checklist,
        "status": centre["status"],
        "submitted_at": centre.get("submitted_at"),
        "stats": stats,
        "live_summary": _live_summary(cid, cams),
    }


def _live_summary(cid, cams):
    from app.services import live as live_svc

    rows, counts = live_svc.live_rows(centre_ids=[cid])
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    summ = db.daily_summaries.find_one({"centre_id": cid, "date": today})
    return {
        "counts": counts,
        "cameras": rows,
        "today": {
            "snapshots": (summ or {}).get("snapshots", 0),
            "people_max": (summ or {}).get("people_max"),
        },
    }
