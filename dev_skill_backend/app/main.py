from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.limiter import limiter, rate_limit_exceeded_handler
from app.routers import (
    applications,
    attendance,
    auth,
    calendar,
    cameras,
    centre,
    compliance,
    edge,
    equipment,
    files,
    flags,
    live,
    notices,
    reports,
    requests,
    schedule,
    schemes,
    sessions,
    staff,
    trainees,
    users,
)
from app.services import scheduler
from app.services.sync import register_device

app = FastAPI(title="Dev_Skill API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

routers = [
    applications.router,
    attendance.router,
    auth.router,
    calendar.router,
    cameras.router,
    centre.router,
    compliance.router,
    edge.router,
    equipment.router,
    files.router,
    flags.router,
    live.router,
    notices.router,
    reports.router,
    requests.router,
    schedule.router,
    schemes.router,
    sessions.router,
    staff.router,
    trainees.router,
    users.router,
]
for r in routers:
    app.include_router(r)


@app.on_event("startup")
def _start():
    register_device()
    scheduler.start()
    try:
        _warm_detectors()
    except Exception:
        pass  # model download/load failure must not block startup


def _warm_detectors():
    """Warm the YOLO models with a dummy frame (plan: warm up at first use)."""
    import threading

    def _run():
        import numpy as np

        from app.services.vision.detector import Detector

        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        from app.db.mongo import db

        for t in db.trade_templates.find({}, {"detector_classes": 1, "min_confidence": 1, "detector_backend": 1}):
            Detector(
                t["detector_classes"],
                float(t.get("min_confidence", 0.35)),
                backend=t.get("detector_backend", "auto"),
            ).detect(dummy)

    threading.Thread(target=_run, daemon=True).start()


@app.get("/health")
def health():
    from app.services.face import health as face_health
    from app.services.vision.detector import Detector
    from app.db.mongo import db
    from app.core.config import settings
    from datetime import datetime, timezone

    detector_ready = False
    detector_model = None
    detector_error = None
    try:
        # Try to instantiate detector for first template
        tpl = db.trade_templates.find_one({}, {"detector_classes": 1, "min_confidence": 1, "detector_backend": 1})
        if tpl:
            Detector(
                tpl["detector_classes"],
                float(tpl.get("min_confidence", 0.35)),
                backend=tpl.get("detector_backend", "auto"),
            ).detect(__import__("numpy").zeros((640, 640, 3), dtype=__import__("numpy").uint8))
            detector_ready = True
            detector_model = settings.detector_model
    except Exception as e:
        detector_error = str(e)

    fh = face_health()

    return {
        "ok": True,
        "version": "4",
        "atlas": db.command("ping").get("ok", 0) == 1,
        "detector": {"ready": detector_ready, "model": detector_model, "error": detector_error},
        "face": fh,
        "models_dir": settings.models_dir,
    }
