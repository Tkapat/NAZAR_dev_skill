from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.audit import audit
from app.core.deps import require
from app.db.mongo import db, oid, ser

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")


def _e(s, code, msg):
    raise HTTPException(s, detail={"detail": msg, "code": code})


@router.post("/my/sessions")
def create_oneoff_session(body: dict, user=Depends(require("centre_admin"))):
    """Create a one-off session. date >= today, start >= 5 min future, duration 15..480 min, no overlap."""
    cid = user["centre_id"]
    centre = db.centres.find_one({"_id": cid})
    if not centre or centre["status"] in ("suspended", "terminated"):
        _e(403, "CENTRE_INACTIVE", "Centre not active")

    date_str = body.get("date")
    start_str = body.get("start_time")
    end_str = body.get("end_time")
    label = body.get("label", "Extra session")
    batch_id = body.get("batch_id")

    if not (date_str and start_str and end_str):
        _e(422, "BAD_TIME", "date, start_time, end_time required")

    try:
        start_dt = datetime.fromisoformat(f"{date_str}T{start_str}").replace(tzinfo=IST).astimezone(timezone.utc)
        end_dt = datetime.fromisoformat(f"{date_str}T{end_str}").replace(tzinfo=IST).astimezone(timezone.utc)
    except Exception:
        _e(422, "BAD_TIME", "Invalid date/time format")

    now = datetime.now(timezone.utc)
    if start_dt < now + timedelta(minutes=5):
        _e(422, "BAD_TIME", "Start must be >= 5 min in future")
    if end_dt <= start_dt:
        _e(422, "BAD_TIME", "End must be after start")
    duration_min = (end_dt - start_dt).total_seconds() / 60
    if duration_min < 15 or duration_min > 480:
        _e(422, "BAD_TIME", "Duration must be 15-480 minutes")
    if (end_dt - datetime.now(timezone.utc)).days > 60:
        _e(422, "BAD_TIME", "Beyond schedule horizon")

    # check overlap
    overlap = db.sessions.find_one({
        "centre_id": cid,
        "status": {"$in": ["scheduled", "active"]},
        "$or": [
            {"start_ts": {"$lt": end_dt}, "end_ts": {"$gt": start_dt}},
        ],
    })
    if overlap:
        _e(409, "SESSION_OVERLAP", "Overlaps with existing session")

    doc = {
        "centre_id": cid,
        "batch_id": oid(batch_id) if batch_id else None,
        "kind": "oneoff",
        "label": label,
        "session_date": date_str,
        "start_ts": start_dt,
        "end_ts": end_dt,
        "status": "scheduled",
        "planned_captures": 0,
        "done_captures": 0,
        "summary": None,
        "created_by": user["id"],
    }
    doc["_id"] = db.sessions.insert_one(doc).inserted_id
    audit(user, "session.create", "session", str(doc["_id"]), {"kind": "oneoff", "label": label})
    return ser(doc)


@router.put("/my/sessions/{sid}")
def edit_oneoff_session(sid: str, body: dict, user=Depends(require("centre_admin"))):
    cid = user["centre_id"]
    s = db.sessions.find_one({"_id": oid(sid), "centre_id": cid})
    if not s:
        _e(404, "NOT_FOUND", "Session not found")
    if s["status"] != "scheduled":
        _e(403, "BAD_STATE", "Only scheduled sessions can be edited")
    if s["start_ts"] <= datetime.now(timezone.utc) + timedelta(minutes=5):
        _e(403, "BAD_STATE", "Cannot edit: session starts too soon")

    start_dt = s["start_ts"]
    end_dt = s["end_ts"]
    if "date" in body and "start_time" in body:
        start_dt = datetime.fromisoformat(f"{body['date']}T{body['start_time']}").replace(tzinfo=IST).astimezone(timezone.utc)
    if "date" in body and "end_time" in body:
        end_dt = datetime.fromisoformat(f"{body['date']}T{body['end_time']}").replace(tzinfo=IST).astimezone(timezone.utc)
    elif "start_time" in body:
        end_dt = datetime.fromisoformat(f"{s['session_date']}T{body['start_time']}").replace(tzinfo=IST).astimezone(timezone.utc)

    if end_dt <= start_dt:
        _e(422, "BAD_TIME", "End must be after start")
    if (end_dt - start_dt).total_seconds() / 60 > 480:
        _e(422, "BAD_TIME", "Duration max 480 minutes")

    # check overlap excluding self
    overlap = db.sessions.find_one({
        "centre_id": cid,
        "_id": {"$ne": oid(sid)},
        "status": {"$in": ["scheduled", "active"]},
        "$or": [
            {"start_ts": {"$lt": end_dt}, "end_ts": {"$gt": start_dt}},
        ],
    })
    if overlap:
        _e(409, "SESSION_OVERLAP", "Overlaps with existing session")

    update = {}
    if "label" in body:
        update["label"] = body["label"]
    if "date" in body:
        update["session_date"] = body["date"]
    if "start_time" in body or "date" in body:
        update["start_ts"] = start_dt
    if "end_time" in body or "date" in body:
        update["end_ts"] = end_dt

    db.sessions.update_one({"_id": s["_id"]}, {"$set": update})
    audit(user, "session.edit", "session", sid, update)
    return ser(db.sessions.find_one({"_id": s["_id"]}))


@router.post("/my/sessions/{sid}/cancel")
def cancel_session(sid: str, body: dict, user=Depends(require("centre_admin"))):
    cid = user["centre_id"]
    s = db.sessions.find_one({"_id": oid(sid), "centre_id": cid})
    if not s:
        _e(404, "NOT_FOUND", "Session not found")
    if s["status"] != "scheduled":
        _e(403, "BAD_STATE", "Only scheduled sessions can be cancelled")
    reason = body.get("reason", "").strip()
    if not reason:
        _e(422, "MISSING_FIELD", "Reason required")
    db.sessions.update_one({"_id": oid(sid)}, {"$set": {"status": "cancelled", "cancel_reason": reason}})
    audit(user, "session.cancel", "session", sid, {"reason": reason})
    return {"ok": True}


@router.get("/my/sessions/today")
def my_sessions_today(user=Depends(require("centre_admin", "trainer"))):
    cid = user["centre_id"]
    today = datetime.now(timezone.utc).astimezone(IST).date().isoformat()
    items = list(db.sessions.find({"centre_id": cid, "session_date": today}).sort("start_ts", 1))
    return {"items": ser(items)}


@router.get("/my/sessions")
def my_sessions_range(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    user=Depends(require("centre_admin", "trainer")),
):
    cid = user["centre_id"]
    items = list(db.sessions.find({"centre_id": cid, "session_date": {"$gte": from_date, "$lte": to_date}}).sort("start_ts", 1))
    return {"items": ser(items)}


# GOVT ENDPOINTS
@router.get("/sessions")
def govt_sessions(
    date: str | None = None,
    status: str | None = None,
    district: str | None = None,
    q: str | None = None,
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user=Depends(require("super_admin", "scheme_officer", "auditor")),
):
    qry = {}
    if date:
        qry["session_date"] = date
    if status:
        qry["status"] = status
    if district:
        cids = [c["_id"] for c in db.centres.find({"district": district}, {"_id": 1})]
        qry["centre_id"] = {"$in": cids}
    if q:
        qry["$or"] = [
            {"label": {"$regex": q, "$options": "i"}},
            {"centre_code": {"$regex": q, "$options": "i"}},
        ]
    if cursor:
        qry["_id"] = {"$lt": oid(cursor)}

    items = list(db.sessions.find(qry).sort("_id", -1).limit(limit + 1))
    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = str(items[-1]["_id"])

    # enrich with centre info
    centre_ids = list({s["centre_id"] for s in items})
    centres = {c["_id"]: c for c in db.centres.find({"_id": {"$in": centre_ids}})}
    out = []
    for s in items:
        c = centres.get(s["centre_id"])
        run = db.monitor_runs.find_one({"session_id": s["_id"], "status": "running"})
        status_display = s["status"]
        if s["status"] == "active" and run:
            status_display = "running"
        out.append({
            "id": str(s["_id"]),
            "centre_id": str(s["centre_id"]),
            "centre_code": c.get("code") if c else None,
            "centre_name": c.get("name") if c else None,
            "district": c.get("district") if c else None,
            "label": s.get("label"),
            "batch": str(s.get("batch_id")) if s.get("batch_id") else None,
            "kind": s.get("kind"),
            "session_date": s.get("session_date"),
            "start_ts": s.get("start_ts"),
            "end_ts": s.get("end_ts"),
            "scheduled_s": int((s["end_ts"] - s["start_ts"]).total_seconds()),
            "status": status_display,
            "cancel_reason": s.get("cancel_reason"),
            "actual_start_ts": s.get("actual_start_ts"),
            "actual_end_ts": s.get("actual_end_ts"),
            "monitored_s": s.get("monitored_s"),
            "late_start_s": s.get("late_start_s"),
            "early_end_s": s.get("early_end_s"),
            "coverage_pct": s.get("coverage_pct"),
            "claimed": (s.get("summary") or {}).get("claimed"),
            "observed": (s.get("summary") or {}).get("observed"),
            "delta": (s.get("summary") or {}).get("delta"),
            "equipment": (s.get("summary") or {}).get("equipment"),
        })

    # counts
    base_q = {}
    if date:
        base_q["session_date"] = date
    if district:
        base_q["centre_id"] = {"$in": cids}
    counts = {
        "scheduled": db.sessions.count_documents({**base_q, "status": "scheduled"}),
        "running": db.sessions.count_documents({**base_q, "status": "active"}) + db.monitor_runs.count_documents({"status": "running", "session_id": {"$in": [s["_id"] for s in db.sessions.find(base_q, {"_id": 1})]}}),
        "held": db.sessions.count_documents({**base_q, "status": "closed"}),
        "missed": db.sessions.count_documents({**base_q, "status": "missed"}),
        "cancelled": db.sessions.count_documents({**base_q, "status": "cancelled"}),
    }
    return {"items": out, "next_cursor": next_cursor, "counts": counts, "date": date or datetime.now(IST).date().isoformat()}


@router.get("/sessions/{sid}")
def govt_session_detail(sid: str, user=Depends(require("super_admin", "scheme_officer", "auditor"))):
    s = db.sessions.find_one({"_id": oid(sid)})
    if not s:
        _e(404, "NOT_FOUND", "Session not found")
    c = db.centres.find_one({"_id": s["centre_id"]})
    runs = list(db.monitor_runs.find({"session_id": s["_id"]}).sort("started_at", 1))
    return {
        **ser(s),
        "centre_code": c.get("code"),
        "centre_name": c.get("name"),
        "district": c.get("district"),
        "runs": [
            {
                "id": str(r["_id"]),
                "camera_id": str(r["camera_id"]),
                "camera_name": db.cameras.find_one({"_id": r["camera_id"]}, {"name": 1}).get("name") if db.cameras.find_one({"_id": r["camera_id"]}) else None,
                "started_at": r.get("started_at"),
                "ended_at": r.get("ended_at"),
                "end_reason": r.get("end_reason"),
                "by": r.get("by"),
                "by_name": r.get("started_by"),
                "frames_ok": r.get("frames_ok"),
                "frames_bad": r.get("frames_bad"),
                "duration_s": r.get("duration_s"),
            }
            for r in runs
        ],
    }


@router.get("/centres/{cid}/schedule")
def centre_schedule(cid: str, from_date: str = Query(..., alias="from"), to_date: str = Query(..., alias="to"), user=Depends(require("super_admin", "scheme_officer", "auditor"))):
    c = db.centres.find_one({"_id": oid(cid)})
    if not c:
        _e(404, "NOT_FOUND", "Centre not found")
    batches = list(db.batches.find({"centre_id": oid(cid)}))
    sessions = list(db.sessions.find({"centre_id": oid(cid), "session_date": {"$gte": from_date, "$lte": to_date}}).sort("start_ts", 1))
    holidays = list(db.holidays.find({"centre_id": oid(cid), "holiday_date": {"$gte": from_date, "$lte": to_date}}))
    changes = list(db.change_requests.find({"centre_id": oid(cid), "created_at": {"$gte": from_date, "$lte": to_date}}).sort("created_at", 1))
    return {
        "batches": ser(batches),
        "sessions": ser(sessions),
        "holidays": ser(holidays),
        "changes": [
            {
                "ts": ch.get("created_at"),
                "actor_name": ch.get("actor_name"),
                "action": ch.get("action"),
                "entity": ch.get("entity"),
                "text": ch.get("text"),
            }
            for ch in changes
        ],
    }


@router.get("/centres/{cid}/runs")
def centre_runs(cid: str, from_date: str = Query(..., alias="from"), to_date: str = Query(..., alias="to"), user=Depends(require("super_admin", "scheme_officer", "auditor"))):
    c = db.centres.find_one({"_id": oid(cid)})
    if not c:
        _e(404, "NOT_FOUND", "Centre not found")
    start = datetime.fromisoformat(from_date).replace(tzinfo=IST).astimezone(timezone.utc)
    end = (datetime.fromisoformat(to_date) + timedelta(days=1)).replace(tzinfo=IST).astimezone(timezone.utc)
    runs = list(db.monitor_runs.find({"centre_id": oid(cid), "started_at": {"$gte": start, "$lt": end}}).sort("started_at", 1))
    return {"items": ser(runs)}