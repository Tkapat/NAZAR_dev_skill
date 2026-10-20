from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.db.mongo import db
from app.services.dbfuncs import expire_repairs, generate_sessions
from app.services.sync import sync_tick

sched = BackgroundScheduler(timezone="UTC")


def _generate_sessions_job():
    from datetime import date, timedelta

    for c in db.centres.find({"status": {"$in": ["live", "awaiting_camera_approval"]}}, {"_id": 1}):
        today = date.today()
        generate_sessions(c["_id"], today, today + timedelta(days=14))


def start():
    from app.services.live import daily_rollup_fix, session_status_tick
    from app.services.monitor import run_watchdog

    sched.add_job(sync_tick, "interval", seconds=20, max_instances=1, id="sync")
    sched.add_job(session_status_tick, "interval", seconds=30, max_instances=1, id="session_status")
    sched.add_job(run_watchdog, "interval", seconds=15, max_instances=1, id="run_watchdog")
    sched.add_job(expire_repairs, "cron", hour=0, minute=5, max_instances=1, id="expire_repairs")
    sched.add_job(_generate_sessions_job, "cron", hour=1, minute=0, max_instances=1, id="generate_sessions")
    sched.add_job(daily_rollup_fix, "interval", seconds=3600, max_instances=1, id="daily_rollup")
    if not settings.force_offline:
        try:
            from app.services.live_capture import live_capture_tick

            sched.add_job(live_capture_tick, "interval", seconds=5, max_instances=1, id="live_capture")
        except ImportError:
            pass
    sched.start()
