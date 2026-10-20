import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FTimeout

import cv2

from app.core.config import settings
from app.db.mongo import db
from app.services.live import process_live_frame

_caps: dict = {}
_retry: dict = {}
_executor = ThreadPoolExecutor(max_workers=2)


def _open_and_read(uri: str):
    idx = int(uri.split(":", 1)[1]) if uri.startswith("webcam:") else uri
    cap = cv2.VideoCapture(idx)
    if not cap.isOpened():
        cap.release()
        return None
    ok, frame = cap.read()
    cap.release()
    return frame if ok else None


def _get_frame(cam_id, uri: str):
    """Return one frame from a cached cap, or a fresh open+read with a hard timeout."""
    now = time.time()
    entry = _caps.get(cam_id)
    if entry:
        cap, used = entry
        if now - used > 60:
            cap.release()
            _caps.pop(cam_id, None)
        else:
            try:
                ok, frame = cap.read()
            except Exception:
                ok, frame = False, None
            if ok and frame is not None:
                _caps[cam_id] = (cap, now)
                return frame
            cap.release()
            _caps.pop(cam_id, None)
    if now - _retry.get(cam_id, 0) < 30:
        return None
    _retry[cam_id] = now
    fut = _executor.submit(_open_and_read, uri)
    try:
        frame = fut.result(timeout=4)
    except FTimeout:
        return None
    except Exception:
        return None
    return frame


def live_capture_tick():
    now = time.time()
    cams = list(db.cameras.find({"source_kind": {"$in": ["webcam", "rtsp"]}}))
    for cam in cams:
        live = cam.get("live") or {}
        if not live.get("enabled"):
            continue
        centre = db.centres.find_one({"_id": cam["centre_id"]}, {"status": 1})
        if not centre or centre["status"] not in ("live", "pending_setup"):
            continue
        interval = int(live.get("interval_s", settings.live_default_interval_s))
        st = db.live_status.find_one({"_id": cam["_id"]}, {"ts": 1})
        last = st["ts"].timestamp() if st and st.get("ts") else 0
        if now - last < interval:
            continue
        frame = _get_frame(cam["_id"], cam.get("source_uri") or "")
        if frame is None:
            continue
        try:
            process_live_frame(cam, frame)
        except Exception:
            continue
