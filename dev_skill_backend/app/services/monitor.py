from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.db.mongo import db


def ensure_run(cam, sess, user_id=None, by="user"):
    """Create or return existing running monitor run for a camera."""
    run = db.monitor_runs.find_one({"camera_id": cam["_id"], "status": "running"})
    if run:
        return run
    now = datetime.now(timezone.utc)
    doc = {
        "centre_id": cam["centre_id"],
        "camera_id": cam["_id"],
        "session_id": sess["_id"] if sess else None,
        "started_by": user_id,
        "by": by,
        "status": "running",
        "started_at": now,
        "last_frame_at": now,
        "frames_sent": 0,
        "frames_ok": 0,
        "frames_bad": 0,
    }
    doc["_id"] = db.monitor_runs.insert_one(doc).inserted_id
    return doc


def touch_run(run_id, ok: bool, session_id=None):
    """Increment frame counters for a run."""
    from bson import ObjectId as OID

    if isinstance(run_id, str):
        run_id = OID(run_id)
    update = {
        "$set": {"last_frame_at": datetime.now(timezone.utc)},
        "$inc": {"frames_sent": 1, "frames_ok" if ok else "frames_bad": 1},
    }
    if session_id:
        update["$set"]["session_id"] = session_id
    db.monitor_runs.update_one({"_id": run_id}, update)


def end_run(run, reason, ended_at=None):
    """End a running monitor run."""
    from bson import ObjectId as OID

    if isinstance(run, dict):
        run_id = run["_id"]
    else:
        run_id = OID(run)
    end = ended_at or datetime.now(timezone.utc)
    db.monitor_runs.update_one(
        {"_id": run_id, "status": "running"},
        {
            "$set": {
                "status": "ended",
                "ended_at": end,
                "end_reason": reason,
                "duration_s": int((end - run["started_at"]).total_seconds())
                if isinstance(run, dict) and "started_at" in run
                else 0,
            }
        },
    )


def run_watchdog():
    """End runs that haven't received frames within timeout intervals."""
    now = datetime.now(timezone.utc)
    for run in db.monitor_runs.find({"status": "running"}):
        cam = db.cameras.find_one({"_id": run["camera_id"]}, {"live": 1}) or {}
        iv = int((cam.get("live") or {}).get("interval_s", settings.live_default_interval_s))
        if (now - run["last_frame_at"]).total_seconds() > settings.run_timeout_intervals * iv:
            end_run(run, "timeout", run["last_frame_at"])


def session_timing(sess, interval_s):
    """Compute session timing from snapshots."""
    ts = [
        s["ts"]
        for s in db.snapshots.find({"session_id": sess["_id"]}, {"ts": 1}).sort("ts", 1)
    ]
    if not ts:
        return {}
    mon = interval_s + sum(
        min((b - a).total_seconds(), 3 * interval_s)
        if (b - a).total_seconds() <= 3 * interval_s
        else 0
        for a, b in zip(ts, ts[1:])
    )
    dur = max(1, (sess["end_ts"] - sess["start_ts"]).total_seconds())
    return {
        "actual_start_ts": ts[0],
        "actual_end_ts": ts[-1],
        "monitored_s": int(mon),
        "late_start_s": max(0, int((ts[0] - sess["start_ts"]).total_seconds())),
        "early_end_s": max(0, int((sess["end_ts"] - ts[-1]).total_seconds())),
        "coverage_pct": min(100, round(100 * mon / dur)),
    }