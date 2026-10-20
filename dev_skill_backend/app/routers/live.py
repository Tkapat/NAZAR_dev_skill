import time
import cv2
import logging
import numpy as np
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
from app.core.config import settings
from app.core.deps import require
from app.db.mongo import db, oid, ser
from app.services import live
from app.services import monitor

router = APIRouter()
_last = {}
_det_lock = threading.Lock()
_det_initialized = False
IST = ZoneInfo("Asia/Kolkata")

# Logger for frame events
frame_logger = logging.getLogger("devskill.live")
frame_logger.setLevel(logging.INFO)

def _e(s, code, msg):
    raise HTTPException(s, detail={"detail": msg, "code": code})

def _ensure_detector_loaded():
    """Lazily load detector with lock; first frame may take up to 30s."""
    global _det_initialized
    if _det_initialized:
        return
    with _det_lock:
        if _det_initialized:
            return
        try:
            from app.services.vision.detector import Detector
            tpl = db.trade_templates.find_one({}, {"detector_classes": 1, "min_confidence": 1, "detector_backend": 1})
            if tpl:
                Detector(
                    tpl["detector_classes"],
                    float(tpl.get("min_confidence", 0.35)),
                    backend=tpl.get("detector_backend", "auto"),
                )
                _det_initialized = True
        except Exception as e:
            logging.getLogger("devskill.live").error("Detector warm-up failed: %s", e)


@router.post("/my/cameras/{cid}/frame")
async def push_frame(cid: str, file: UploadFile, user=Depends(require("centre_admin", "trainer"))):
    cam = db.cameras.find_one({"_id": oid(cid), "centre_id": user["centre_id"]})
    if not cam or cam.get("source_kind") != "browser":
        _e(404, "NOT_FOUND", "Camera not found")
    c = db.centres.find_one({"_id": user["centre_id"]}, {"status": 1})
    if c["status"] in ("suspended", "terminated"):
        _e(403, "CENTRE_INACTIVE", "Centre not active")
    interval = int((cam.get("live") or {}).get("interval_s", settings.live_default_interval_s))
    if time.time() - _last.get(cid, 0) < 0.5 * interval:
        _e(429, "TOO_FAST", "Sending too fast")
    data = await file.read(1_500_001)
    if len(data) > 1_500_000:
        _e(422, "FILE_TOO_LARGE", "Frame too large")
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None or max(frame.shape[:2]) > 1920:
        _e(422, "BAD_FILE", "Unreadable frame")
    _last[cid] = time.time()
    
    # Ensure detector is loaded (lazy init with lock)
    _ensure_detector_loaded()
    
    start = time.time()
    try:
        result = await run_in_threadpool(live.process_live_frame, cam, frame)
    except Exception as e:
        # Detector crashed or unavailable
        logging.getLogger("devskill.live").exception("Detector error on camera %s: %s", cid, e)
        # Write live_status error state
        db.live_status.replace_one(
            {"_id": cam["_id"]},
            {"_id": cam["_id"], "centre_id": user["centre_id"], "camera_name": cam["name"],
             "state": "error", "error": str(e), "ts": datetime.now(timezone.utc)},
            upsert=True,
        )
        _e(503, "DETECTOR_UNAVAILABLE", str(e))
    
    latency_ms = int((time.time() - start) * 1000)
    # Log one line per frame
    state = result.get("state")
    people = result.get("people")
    frame_logger.info("camera=%s state=%s people=%d latency_ms=%d", cid, state, people or 0, latency_ms)
    return result

@router.get("/my/live")
def my_live_status(user=Depends(require("centre_admin", "trainer"))):
    rows, counts = live.live_rows(centre_ids=[user["centre_id"]])
    return {"items": rows, "counts": counts}


@router.get("/live")
def govt_live(
    district: str | None = None,
    state: str | None = None,
    q: str | None = None,
    user=Depends(require("super_admin", "scheme_officer", "auditor")),
):
    rows, counts = live.live_rows(district=district, state=state, q=q)
    return {"items": rows, "counts": counts}


@router.get("/centres/{cid}/live")
def centre_live(cid: str, user=Depends(require("super_admin", "scheme_officer", "auditor"))):
    c = db.centres.find_one({"_id": oid(cid)})
    if not c:
        _e(404, "NOT_FOUND", "Centre not found")
    rows, counts = live.live_rows(centre_ids=[c["_id"]])
    today = datetime.now(IST).date().isoformat()
    tl = db.day_timelines.find({"centre_id": c["_id"], "date": today}).sort("date", 1)
    points = []
    for doc in tl:
        points.extend(doc.get("points") or [])
    points.sort(key=lambda p: p.get("ts") or 0)
    flags = list(db.flags.find({"centre_id": c["_id"]}).sort("created_at", -1).limit(10))
    return {
        "items": rows,
        "counts": counts,
        "timeline": points[-240:],
        "flags": [
            {
                "id": str(f["_id"]),
                "type": f.get("type"),
                "severity": f.get("severity"),
                "status": f.get("status"),
                "reason": f.get("reason"),
                "created_at": f.get("created_at"),
            }
            for f in flags
        ],
    }

@router.post("/my/live/demo-session")
def create_demo_session(body: dict, user=Depends(require("centre_admin"))):
    minutes = int(body.get("minutes", 30))
    label = body.get("label", "Demo session")
    if minutes < 15 or minutes > 180:
        raise HTTPException(422, detail={"detail": "Minutes must be 15-180", "code": "BAD_MINUTES"})
    
    now = datetime.now(timezone.utc)
    # Check for existing active session (any kind) - reuse it
    active = db.sessions.find_one({"centre_id": user["centre_id"], "status": {"$in": ["scheduled", "active"]}, "end_ts": {"$gte": now}})
    if active:
        return {"session_id": str(active["_id"]), "label": active.get("label"), "start_ts": active["start_ts"].isoformat(), "end_ts": active["end_ts"].isoformat(), "reused": True}
    
    today = datetime.now(timezone.utc).astimezone(IST).date().isoformat()
    count = db.sessions.count_documents({"centre_id": user["centre_id"], "session_date": today, "kind": "adhoc"})
    if count >= 3:
        raise HTTPException(429, detail={"detail": "Max 3 ad-hoc sessions per day", "code": "TOO_MANY"})
    
    # Check overlap with future sessions
    start = now
    end = now + timedelta(minutes=minutes)
    overlap = db.sessions.find_one({
        "centre_id": user["centre_id"],
        "status": {"$in": ["scheduled", "active"]},
        "start_ts": {"$lt": end},
        "end_ts": {"$gt": start},
    })
    if overlap:
        # Shorten to fit before the next session, or 409 if too short
        available_end = overlap["start_ts"]
        available_min = max(0, int((available_end - start).total_seconds() / 60))
        if available_min >= 15:
            end = available_end
            minutes = available_min
        else:
            raise HTTPException(409, detail={"detail": "Overlaps with upcoming session", "code": "SESSION_OVERLAP"})
    
    doc = {
        "centre_id": user["centre_id"],
        "batch_id": None,
        "kind": "adhoc",
        "label": label,
        "session_date": today,
        "start_ts": start,
        "end_ts": end,
        "status": "active",
        "planned_captures": int(minutes * 60 / settings.live_default_interval_s),
        "done_captures": 0,
        "summary": None,
    }
    doc["_id"] = db.sessions.insert_one(doc).inserted_id
    from app.services import ledger
    ledger.append("session.create", {"session_id": str(doc["_id"]), "centre_id": user["centre_id"], "kind": "adhoc", "label": label, "minutes": minutes})
    return {"session_id": str(doc["_id"]), "label": label, "start_ts": start.isoformat(), "end_ts": end.isoformat(), "reused": False}


@router.post("/my/live/demo-claim")
def demo_claim(body: dict, user=Depends(require("centre_admin"))):
    """Set a demo attendance claim for an adhoc session (for testing mismatch)."""
    session_id = body.get("session_id")
    claimed = body.get("claimed")
    if not session_id or claimed is None:
        _e(422, "BAD_REQUEST", "session_id and claimed required")
    try:
        claimed_int = int(claimed)
    except Exception:
        _e(422, "BAD_REQUEST", "claimed must be integer")
    if not 0 <= claimed_int <= 500:
        _e(422, "BAD_REQUEST", "claimed must be 0..500")
    
    s = db.sessions.find_one({"_id": oid(session_id), "centre_id": user["centre_id"]})
    if not s:
        _e(404, "NOT_FOUND", "Session not found")
    if s["kind"] != "adhoc":
        _e(403, "DEMO_ONLY", "Demo claims only allowed for ad-hoc sessions")
    
    from app.services import ledger
    now = datetime.now(timezone.utc)
    db.attendance_claims.update_one(
        {"session_id": s["_id"]},
        {"$set": {"session_id": s["_id"], "claimed_count": claimed_int, "present_trainee_ids": [],
                   "marked_by": user["id"], "source": "demo", "created_at": now}},
        upsert=True,
    )
    ledger.append("demo_claim", {"session_id": session_id, "claimed": claimed_int, "by": user["id"]})
    
    # Immediately run consolidation for all cameras of this session
    # FIX: Include provisional cameras when RECORD_PROVISIONAL=True, as they store snapshots too
    centre = db.centres.find_one({"_id": s["centre_id"]})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]}) if centre else None
    if tpl:
        cam_query = {"centre_id": s["centre_id"]}
        if not settings.record_provisional:
            cam_query["setup_status"] = "approved"
        from app.services.live import consolidate_session
        for cam in db.cameras.find(cam_query):
            consolidate_session(s["_id"], cam, tpl, final=False)
    
    return {"ok": True, "session_id": session_id, "claimed": claimed_int}


@router.post("/my/cameras/{cid}/monitor/start")
def monitor_start(cid: str, user=Depends(require("centre_admin", "trainer"))):
    cam = db.cameras.find_one({"_id": oid(cid), "centre_id": user["centre_id"]})
    if not cam:
        _e(404, "NOT_FOUND", "Camera not found")
    c = db.centres.find_one({"_id": user["centre_id"]}, {"status": 1})
    if c["status"] in ("suspended", "terminated"):
        _e(403, "CENTRE_INACTIVE", "Centre not active")
    db.cameras.update_one({"_id": cam["_id"]}, {"$set": {"live.enabled": True}})
    now = datetime.now(timezone.utc)
    sess = db.sessions.find_one({"centre_id": user["centre_id"], "start_ts": {"$lte": now}, "end_ts": {"$gte": now}, "status": {"$in": ["scheduled", "active"]}})
    run = monitor.ensure_run(cam, sess, user["id"], "user")
    return ser(run)


@router.post("/my/cameras/{cid}/monitor/stop")
def monitor_stop(cid: str, body: dict = None, user=Depends(require("centre_admin", "trainer"))):
    cam = db.cameras.find_one({"_id": oid(cid), "centre_id": user["centre_id"]})
    if not cam:
        _e(404, "NOT_FOUND", "Camera not found")
    run = db.monitor_runs.find_one({"camera_id": cam["_id"], "status": "running"})
    if not run:
        _e(404, "NOT_FOUND", "No running monitor")
    reason = (body or {}).get("reason", "manual")
    monitor.end_run(run, reason)
    # recompute session timing if there's an active session
    now = datetime.now(timezone.utc)
    sess = db.sessions.find_one({"centre_id": user["centre_id"], "start_ts": {"$lte": now}, "end_ts": {"$gte": now}, "status": {"$in": ["scheduled", "active"]}})
    timing = {}
    if sess:
        cams = list(db.cameras.find({"centre_id": sess["centre_id"], "setup_status": "approved"}))
        interval = int((cams[0].get("live") or {}).get("interval_s", settings.live_default_interval_s)) if cams else settings.live_default_interval_s
        timing = monitor.session_timing(sess, interval)
        if timing:
            db.sessions.update_one({"_id": sess["_id"]}, {"$set": timing})
    # end other runs of this session
    db.monitor_runs.update_many({"session_id": sess["_id"] if sess else None, "status": "running"}, {"$set": {"status": "ended", "end_reason": "session_end"}})
    return {"run": ser(run), "session_timing": timing}


@router.get("/my/live/diagnostics")
def my_live_diagnostics(user=Depends(require("centre_admin", "trainer"))):
    centre = db.centres.find_one({"_id": user["centre_id"]})
    if not centre:
        _e(404, "NOT_FOUND", "Centre not found")
    cams = list(db.cameras.find({"centre_id": user["centre_id"]}))
    now = datetime.now(timezone.utc)
    advice = []
    api_ok = True
    frames_today = 0
    session = None
    run = None
    last_frame_at = None
    last_state = None
    last_reasons = None
    detector_ready = True
    try:
        _ = live._det
    except Exception:
        detector_ready = False
        advice.append("Detector not loaded yet.")
    if centre["status"] in ("suspended", "terminated"):
        advice.append("Centre is not active.")
    has_browser = any(c.get("source_kind") == "browser" for c in cams)
    if not has_browser:
        advice.append("No camera of kind browser exists")
    approved_cams = [c for c in cams if c.get("setup_status") == "approved"]
    if not approved_cams:
        provisional_cams = [c for c in cams if c.get("setup_status") != "approved"]
        if provisional_cams:
            recording = "on" if settings.record_provisional else "off"
            advice.append(f"Camera setup not approved (recording is {recording} in this mode)")
        else:
            advice.append("No camera approved yet. Frames will be shown but not recorded.")
    for cam in cams:
        if cam.get("setup_status") != "approved":
            continue
        ls = db.live_status.find_one({"_id": cam["_id"]})
        if ls:
            frames_today += 1
            last_frame_at = ls.get("ts")
            last_state = ls.get("state")
            last_reasons = ls.get("quality", {}).get("reasons")
            if ls.get("session"):
                session = ls["session"]
            if ls.get("run_started_at"):
                run = {"id": str(cam["_id"]), "started_at": ls["run_started_at"]}
            if last_reasons and "dark" in " ".join(last_reasons).lower():
                advice.append(f"Camera {cam['name']}: picture too dark.")
            if ls.get("state") == "error":
                advice.append(f"Detector error: {ls.get('error', 'unknown')}")
    if not session:
        advice.append("No session is active. Start a demo session.")
    if not last_frame_at or (now - last_frame_at).total_seconds() > 60:
        advice.append("No frames in the last 60 seconds.")
    # get frames_today from daily_summaries
    today = datetime.now(IST).date().isoformat()
    ds = db.daily_summaries.find_one({"centre_id": user["centre_id"], "date": today})
    if ds:
        frames_today = ds.get("snapshots", 0)
    return {
        "api_ok": api_ok,
        "cameras": [
            {
                "id": str(c["_id"]),
                "name": c["name"],
                "source_kind": c.get("source_kind"),
                "setup_status": c.get("setup_status"),
                "live": c.get("live"),
            }
            for c in cams
        ],
        "last_frame_at": last_frame_at,
        "last_state": last_state,
        "last_reasons": last_reasons,
        "frames_today": frames_today,
        "session": session,
        "run": run,
        "detector_ready": detector_ready,
        "advice": advice,
    }
