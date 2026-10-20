# Detection and Live Data System (corrected v2)

Where this document disagrees with any earlier text, this document wins.
Goal: from webcam frames, show per session what the centre ENROLLED, CLAIMED and what the camera COUNTED, and per
equipment class what is SANCTIONED, DECLARED, SEEN and IN USE. Disagreements become flags on the Government portal.

## 0. Ground rules

1. ONE source of truth for verdicts: `app/services/compliance.py`. The compliance endpoints, the live wall summaries and
   the flag engine all call it. A preview and a flag can never disagree.
2. Counting is body-based only (YOLO `person`). No face engine in this path. Faces exist only for staff enrolment and
   the staff attendance scan.
3. Every failure must be visible: the backend returns `{detail:{detail,code,advice}}`, the frontend always shows the
   last error line.
4. Cameras are never hidden. Provisional (not yet approved) cameras record when `RECORD_PROVISIONAL=true` and are
   marked unofficial; they are never silently dropped.
5. Time: all stored values are UTC. `elapsed_s` is computed at READ time, never stored.
6. Run exactly ONE uvicorn worker (`--workers 1`): models, semaphore and per-camera state live in process memory.
7. The first frame can take about 30 s (model load). The UI shows "Warming up", never a blank wait.
8. Government sees data only (no pictures). Centre sees its own blurred preview.

## 1. Architecture and who writes what

```
Centre /live (browser tab)
  getUserMedia -> canvas -> JPEG blob (<=1.4 MB) --POST /my/cameras/{id}/frame--> FastAPI
                                                                                   |
   1 live_status      (always, BEFORE any heavy work)                              |
   2 monitor_runs     (start/stop/last_frame)                                      v
   3 snapshots        (only when a session is active AND recordable)        YOLO detector (loaded once)
   4 day_timelines, daily_summaries, sessions.actual_start/end (per snapshot)
   5 observations     (every N snapshots)
   6 flags            (from compliance.compute(fresh=True) after each consolidation)

Centre portal : /my/live (5 s on /live), /my/compliance (5 s)
Govt portal   : /live (5 s), /centres/{id}/live (5 s), /centres/{id}/compliance (5 s)   all read the same collections
```

## 2. Per-frame order (strict)

1. Decode and size-check the frame. 2. Resolve camera, centre, template, ACTIVE session. 3. `ensure_run`.
4. Quality gate (bad frame: write live_status "tampered", count `frames_bad`, C1 after 3 in a row, STOP).
5. Detect (per-class thresholds). 6. Filter small boxes, `cleanup()` (ROI + presence rule + staff subtraction).
7. `item_usage()` then ZERO-FILL every monitored class. 8. Write `live_status` (with `ts`, `interval_s`, `official`).
9. Save blurred thumbnail `live_<camera_id>`. 10. If recordable: snapshot + timeline + summary + session timing.
11. Every N snapshots: `consolidate_session()` then `flags_for_session()`. 12. Respond with boxes (+`counted`).
`recordable = session is active AND (camera approved OR RECORD_PROVISIONAL)`.

## 3. Centre frontend

### 3.1 Timer worker: `public/live-timer.worker.js`
```js
let t = null;
onmessage = (e) => {
  if (e.data.cmd === "start") { clearInterval(t); t = setInterval(() => postMessage("tick"), e.data.ms); }
  if (e.data.cmd === "stop") { clearInterval(t); t = null; }
};
```

### 3.2 `hooks/useLiveStreamer.ts`
Contract for `apiUpload<T>(path, formData, timeoutMs = 15000)`: no Content-Type header, Bearer + ngrok header, silent
refresh, throws `{status, code, message, advice}`.
```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiUpload } from "@/lib/api";

export type Box = { cls: string; x1: number; y1: number; x2: number; y2: number; conf: number; counted?: boolean };
export type Items = Record<string, { present: number; in_use: number; idle: number; off: number }>;
export type FrameResponse = { accepted: boolean; reason?: string; state?: string; people?: number; people_smooth?: number;
  items?: Items; boxes?: Box[]; session?: any; run?: { id: string; started_at: string }; next_interval_s?: number;
  reasons?: string[]; rule_fallback?: boolean };
export type Status = "idle" | "starting" | "warming" | "running" | "reconnecting" | "error" | "stopped";
const BACKOFF = [5, 10, 20, 40, 60];
const asList = (r: any) => (Array.isArray(r) ? r : r?.items ?? []);
const kindOf = (c: any) => c.source_kind ?? (c.source_uri === "browser" ? "browser" : "other");

export function useLiveStreamer(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [camera, setCamera] = useState<any>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [frame, setFrame] = useState<FrameResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);      // ALWAYS render this line in the UI
  const [sent, setSent] = useState(0);
  const r = useRef({ stream: null as MediaStream | null, worker: null as Worker | null, busy: false, fails: 0,
    nextAt: 0, first: true, canvas: null as HTMLCanvasElement | null, cam: null as any });

  // The camera is resolved from /my/cameras on mount (NOT from the polled live query, NOT created per visit).
  const ensureCamera = useCallback(async () => {
    let cam = asList(await api("/my/cameras")).find((c: any) => kindOf(c) === "browser");
    if (!cam) {
      try { cam = await api("/my/cameras", { method: "POST",
        body: JSON.stringify({ name: "This computer", source_uri: "browser", resolution: "1280x720" }) }); }
      catch (e: any) {
        if (e?.code !== "CAMERA_EXISTS") throw e;
        cam = asList(await api("/my/cameras")).find((c: any) => kindOf(c) === "browser");
      }
    }
    r.current.cam = cam; setCamera(cam); return cam;
  }, []);
  useEffect(() => { ensureCamera().catch((e) => setLastError(`Camera setup failed: ${e?.code ?? e?.message}`)); }, [ensureCamera]);

  const cleanup = useCallback(() => {
    const s = r.current;
    s.worker?.postMessage({ cmd: "stop" }); s.worker?.terminate(); s.worker = null;
    s.stream?.getTracks().forEach((t) => t.stop()); s.stream = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [videoRef]);

  const stop = useCallback(async (why = "manual") => {
    cleanup(); setStatus("stopped");
    const cam = r.current.cam; if (!cam) return null;
    try { return await api(`/my/cameras/${cam.id}/monitor/stop`, { method: "POST", body: JSON.stringify({ reason: why }) }); }
    catch { return null; }
  }, [cleanup]);

  // Un-mirrored capture: the server and the ROI editor see the same picture. Recompress instead of dropping.
  const grab = useCallback(async (): Promise<Blob | null> => {
    const v = videoRef.current; if (!v || !v.videoWidth) return null;
    const sc = Math.min(1, 960 / v.videoWidth), w = Math.round(v.videoWidth * sc), h = Math.round(v.videoHeight * sc);
    const c = (r.current.canvas ??= document.createElement("canvas")); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, w, h);
    for (const q of [0.75, 0.6, 0.45, 0.3]) {
      const b: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
      if (b && b.size <= 1_400_000) return b;
    }
    return null;
  }, [videoRef]);

  const tick = useCallback(async () => {
    const s = r.current; if (s.busy || !s.cam || Date.now() < s.nextAt) return;
    s.busy = true;
    try {
      const blob = await grab(); if (!blob) { setLastError("Camera picture not ready yet"); return; }
      const fd = new FormData(); fd.append("file", blob, "frame.jpg");
      const j = await apiUpload<FrameResponse>(`/my/cameras/${s.cam.id}/frame`, fd, s.first ? 40000 : 15000);
      s.fails = 0;
      if (j.accepted === false) { setLastError(`Server busy (${j.reason}). Retrying.`); return; }
      s.first = false; setLastError(null); setFrame(j); setSent((n) => n + 1);
      if (j.state === "tampered") { setStatus("error"); setLastError("The picture looks too dark or covered. Check the lens and lighting."); }
      else setStatus("running");
    } catch (e: any) {
      const code = e?.code ?? (e?.name === "AbortError" ? "TIMEOUT" : "NETWORK");
      setLastError(`${e?.status ?? ""} ${code}: ${e?.advice || e?.message || ""}`.trim());
      if (code === "TOO_FAST") s.nextAt = Date.now() + 2000;
      else if (code === "CENTRE_INACTIVE") await stop("error");
      else if (code === "DETECTOR_UNAVAILABLE") { setStatus("error"); s.nextAt = Date.now() + 15000; }
      else { s.fails += 1; setStatus("reconnecting"); s.nextAt = Date.now() + BACKOFF[Math.min(s.fails - 1, BACKOFF.length - 1)] * 1000; }
    } finally { s.busy = false; }
  }, [grab, stop]);

  const start = useCallback(async (secs: number) => {
    const s = r.current; const cam = s.cam ?? (await ensureCamera());
    setStatus("starting"); setLastError(null); s.first = true; s.fails = 0; s.nextAt = 0;
    try {
      await api(`/my/cameras/${cam.id}/live`, { method: "PUT", body: JSON.stringify({ enabled: true, interval_s: secs, tiling: false }) });
      await api(`/my/cameras/${cam.id}/monitor/start`, { method: "POST" });
      s.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      const v = videoRef.current!; v.srcObject = s.stream; await v.play();
      s.worker = new Worker("/live-timer.worker.js"); s.worker.onmessage = () => void tick();
      s.worker.postMessage({ cmd: "start", ms: secs * 1000 });
      setStatus("warming"); void tick();                       // first frame NOW; may take ~30 s while the counter loads
      try { await (navigator as any).wakeLock?.request("screen"); } catch {}
    } catch (e: any) { setStatus("error"); setLastError(`${e?.code ?? e?.name}: ${e?.advice ?? e?.message}`); cleanup(); }
  }, [ensureCamera, tick, cleanup, videoRef]);

  useEffect(() => () => cleanup(), [cleanup]);                 // release the camera on unmount
  return { camera, status, frame, lastError, sent, start, stop };
}
```

### 3.3 Box overlay (aligned and mirror-correct)
Wrapper uses the video's real aspect ratio; the video is mirrored with CSS; box x is flipped to match.
```tsx
<div className="relative overflow-hidden rounded-[24px]" style={{ aspectRatio: aspect /* videoWidth/videoHeight */ }}>
  <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-fill" />
  <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
</div>
```
```ts
export function drawBoxes(canvas: HTMLCanvasElement, boxes: Box[], mirror = true) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const primary = css.getPropertyValue("--primary").trim(), info = css.getPropertyValue("--info").trim();
  ctx.lineWidth = 2; ctx.font = "600 12px system-ui";
  for (const b of boxes) {
    const x1 = (mirror ? 1 - b.x2 : b.x1) * W, x2 = (mirror ? 1 - b.x1 : b.x2) * W, y1 = b.y1 * H, y2 = b.y2 * H;
    const ignored = b.cls === "person" && b.counted === false;            // seen but NOT counted (outside area or rule)
    ctx.setLineDash(ignored ? [5, 4] : []); ctx.strokeStyle = b.cls === "person" ? primary : info;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const label = `${b.cls}${ignored ? " (not counted)" : ""} ${Math.round(b.conf * 100)}%`, tw = ctx.measureText(label).width + 8;
    ctx.setLineDash([]); ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(x1, Math.max(0, y1 - 18), tw, 18);
    ctx.fillStyle = "#fff"; ctx.fillText(label, x1 + 4, Math.max(12, y1 - 5));
  }
}
```
UI requirements: one "Start streaming" button (not a silent toggle) with a visible "Needs: ..." reason when disabled; a status
line showing `lastError`; after 20 s without an accepted frame open the Diagnostics panel automatically; a "Not counted"
legend (dashed boxes) so users see why a visible person is not counted.

## 4. Backend frame endpoint: `app/routers/live.py`
```python
import logging, time
import cv2, numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool
from app.core.deps import require
from app.db.mongo import db, oid
from app.services import live

log = logging.getLogger("devskill.live")
router = APIRouter()
_last: dict[str, float] = {}
MIN_GAP_S = 1.5        # fixed minimum spacing; a 5 s interval must never trip a "0.5 x interval" rule

def err(status, code, msg, advice=""):
    raise HTTPException(status, detail={"detail": msg, "code": code, "advice": advice})

def kind_of(cam) -> str:                                   # tolerate cameras created before source_kind existed
    if cam.get("source_kind"): return cam["source_kind"]
    u = cam.get("source_uri") or ""
    return "browser" if u == "browser" else "webcam" if u.startswith("webcam:") else "rtsp" if u.startswith("rtsp") else "file" if u.startswith("file:") else "unknown"

@router.post("/my/cameras/{cid}/frame")
async def push_frame(cid: str, file: UploadFile, user=Depends(require("centre_admin", "trainer"))):
    cam = db.cameras.find_one({"_id": oid(cid), "centre_id": user["centre_id"]})
    if not cam: err(404, "NOT_FOUND", "Camera not found")
    if kind_of(cam) != "browser":
        err(422, "NOT_BROWSER_CAMERA", "This camera is not a browser camera", "Add a camera of type 'This computer's webcam'.")
    c = db.centres.find_one({"_id": user["centre_id"]}, {"status": 1})
    if c and c["status"] in ("suspended", "terminated"): err(403, "CENTRE_INACTIVE", "Centre not active")
    if time.monotonic() - _last.get(cid, 0) < MIN_GAP_S: err(429, "TOO_FAST", "Sending too fast")
    data = await file.read(1_500_001)
    if len(data) > 1_500_000: err(422, "FILE_TOO_LARGE", "Frame too large")
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None or max(frame.shape[:2]) > 1920: err(422, "BAD_FILE", "Unreadable frame")
    _last[cid] = time.monotonic()
    try:
        # detector loading happens INSIDE the thread pool, never on the event loop
        return await run_in_threadpool(live.process_live_frame, cam, frame, user["id"])
    except live.DetectorUnavailable as e:
        err(503, "DETECTOR_UNAVAILABLE", "The counter model could not start", str(e))
```
`main.py`: `logging.basicConfig(level=logging.INFO)`; startup thread warms the default detector (never raises). Run with
`uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1`.

## 5. Core processing: `app/services/live.py`
```python
import logging, statistics, threading, time
from collections import deque
from datetime import datetime, timezone
from app.core.config import settings
from app.db.mongo import db
from app.services import monitor, compliance
from app.services.files_store import save_blob
from app.services.vision.detector import Detector
from app.services.vision.quality import quality_gate
from app.services.vision.cleanup import cleanup
from app.services.vision.usage import item_usage
from app.services.vision.privacy import blurred_thumbnail

log = logging.getLogger("devskill.live")
_sem, _det, _det_lock, _st = threading.Semaphore(2), {}, threading.Lock(), {}

class DetectorUnavailable(Exception): ...

def get_detector(tpl, tiling=False):
    key = (tuple(tpl["detector_classes"]), bool(tiling), tpl.get("detector_model"))
    d = _det.get(key)
    if d: return d
    with _det_lock:
        if key in _det: return _det[key]
        try:
            _det[key] = Detector(tpl["detector_classes"], tpl.get("class_conf"), float(tpl.get("min_confidence", 0.35)), tiling,
                                 tpl.get("detector_model"), tpl.get("class_alias"), tpl.get("imgsz"), tpl.get("detector_backend", "auto"))
        except Exception as e:
            raise DetectorUnavailable(f"{type(e).__name__}: {e}") from e
        return _det[key]

def session_brief(s):
    return None if not s else {"id": str(s["_id"]), "label": s.get("label"), "start_ts": s["start_ts"], "end_ts": s["end_ts"],
                               "actual_start_ts": s.get("actual_start_ts")}

def staff_to_subtract(sess, cam) -> int:
    """Subtract verified staff ONLY when the camera is flagged 'a trainer is visible'. Default False for browser cameras,
    otherwise a presenter alone in front of the laptop would be subtracted and counted as 0 (false 'ghost')."""
    if not sess or not cam.get("subtract_staff"): return 0
    return min(3, db.staff_attendance.count_documents({"session_id": sess["_id"], "verified": True}))

def process_live_frame(cam, frame, user_id=None):
    if not _sem.acquire(blocking=False): return {"accepted": False, "reason": "BUSY"}
    try: return _process(cam, frame, user_id)
    finally: _sem.release()

def _process(cam, frame, user_id):
    t0, now = time.time(), datetime.now(timezone.utc)
    cid, kid = cam["_id"], cam["centre_id"]
    centre = db.centres.find_one({"_id": kid}); tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})
    cfg = cam.get("live") or {}; interval = int(cfg.get("interval_s", settings.live_default_interval_s))
    sess = db.sessions.find_one({"centre_id": kid, "status": {"$in": ["scheduled", "active"]},
                                 "start_ts": {"$lte": now}, "end_ts": {"$gte": now}})
    official = cam.get("setup_status") == "approved"
    recordable = bool(sess) and (official or settings.record_provisional)          # fixes the contradiction with RECORD_PROVISIONAL
    st = _st.setdefault(str(cid), {"gray": None, "t": 0.0, "bad": 0, "hist": deque(maxlen=5), "spark": deque(maxlen=30),
                                   "pt": 0.0, "ev": 0.0, "n": 0})
    run = monitor.ensure_run(cam, sess, user_id, "user")
    base = {"centre_id": kid, "centre_code": centre["code"], "centre_name": centre["name"], "district": centre.get("district"),
            "camera_name": cam["name"], "ts": now, "interval_s": interval, "official": official,
            "run_started_at": run["started_at"], "session": session_brief(sess)}
    run_brief = {"id": str(run["_id"]), "started_at": run["started_at"]}

    q = quality_gate(frame, st["gray"], (t0 - st["t"]) if st["t"] else 0)
    st["gray"], st["t"] = q["gray"], t0
    if not q["ok"]:
        st["bad"] += 1; monitor.touch_run(run["_id"], False)
        db.live_status.replace_one({"_id": cid}, {**base, "state": "tampered", "people": None, "people_smooth": None, "items": {},
            "quality": {"ok": False, "reasons": q["reasons"]}, "claimed": None, "thumb_id": None, "spark": list(st["spark"])}, upsert=True)
        if recordable and st["bad"] == 3:
            compliance.upsert_flag(kid, sess["_id"], "C1", "high", f"Camera quality problem: {', '.join(q['reasons'])}. Counts not evaluated.",
                                   f"{sess['_id']}:C1:{cid}", camera_id=cid)
        return {"accepted": True, "state": "tampered", "reasons": q["reasons"], "run": run_brief, "next_interval_s": interval}
    st["bad"] = 0

    det = get_detector(tpl, cfg.get("tiling", False))                              # may raise DetectorUnavailable
    h, w = frame.shape[:2]
    min_area = float(tpl.get("min_box_area", 0.015)) * h * w
    dets = [d for d in det.detect(frame) if d[5] != "person" or (d[2] - d[0]) * (d[3] - d[1]) >= min_area]
    c = cleanup(dets, frame.shape, cam.get("roi_polygon"), cam.get("zones"), tpl["presence_rule"], staff_to_subtract(sess, cam))
    rules = {r["class"]: r.get("operability", "none") for r in tpl.get("equipment_rules", [])}
    monitored = [k for k in tpl["detector_classes"] if k != "person"]
    items = {k: {"present": 0, "in_use": 0, "idle": 0, "off": 0} for k in monitored}           # ZERO-FILL: a removed chair must show 0
    items.update(item_usage(frame, c["equipment"], c["all_people"], rules))
    people = c["people_count"]; st["hist"].append(people); st["spark"].append(people)
    smooth = int(statistics.median(st["hist"]))
    claim = db.attendance_claims.find_one({"session_id": sess["_id"]}, {"claimed_count": 1}) if sess else None

    # write live_status BEFORE the heavy recording work, so the portals see the camera even if recording fails later
    db.live_status.replace_one({"_id": cid}, {**base, "state": "live" if sess else "idle", "people": people, "people_smooth": smooth,
        "items": items, "quality": {"ok": True, "reasons": []}, "claimed": claim["claimed_count"] if claim else None,
        "model_version": det.version, "latency_ms": int((time.time() - t0) * 1000), "thumb_id": f"live_{cid}",
        "spark": list(st["spark"])}, upsert=True)
    thumb = blurred_thumbnail(frame, [p[:4] for p in c["all_people"]],
                              [(*b[:4], b[5]) for b in c["equipment"]] + [(*p[:4], "person") for p in c["counted_boxes_full"]])
    save_blob(f"live_{cid}", kid, thumb, "live", camera_id=cid)
    monitor.touch_run(run["_id"], True, sess["_id"] if sess else None)
    if recordable:
        _record(cam, kid, sess, now, people, len(c["people_boxes"]), items, det.version, int((time.time() - t0) * 1000), st, tpl, thumb)

    counted = {tuple(p[:4]) for p in c["counted_boxes_full"]}
    boxes = [{"cls": d[5], "x1": d[0] / w, "y1": d[1] / h, "x2": d[2] / w, "y2": d[3] / h, "conf": round(d[4], 2),
              **({"counted": tuple(d[:4]) in counted} if d[5] == "person" else {})} for d in dets]
    log.info("camera=%s state=%s people=%s items=%s latency_ms=%d", cid, "live" if sess else "idle", people,
             {k: v["present"] for k, v in items.items()}, int((time.time() - t0) * 1000))
    return {"accepted": True, "state": "live" if sess else "idle", "people": people, "people_smooth": smooth, "items": items,
            "boxes": boxes, "rule_fallback": c.get("rule_fallback", False), "session": base["session"], "run": run_brief,
            "next_interval_s": interval}

def _record(cam, kid, sess, now, people, raw, items, ver, lat, st, tpl, thumb):
    snap = {"centre_id": kid, "camera_id": cam["_id"], "session_id": sess["_id"], "ts": now, "people": people, "people_raw": raw,
            "items": items, "quality": {"ok": True, "reasons": []}, "model_version": ver, "latency_ms": lat,
            "snap_key": f"{cam['_id']}|{int(now.timestamp() * 1000)}"}
    try: db.snapshots.insert_one(snap)
    except Exception as e:
        if "duplicate" in str(e).lower(): return
        from app.services import ledger; ledger.append("snapshot", {"doc": snap, "centre_id": str(kid)}); return   # Atlas down: outbox
    from zoneinfo import ZoneInfo
    day = now.astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat()
    inc, mx = {"snapshots": 1, "people_sum": people}, {"people_max": people}
    for k, v in items.items():
        inc[f"items.{k}.present_sum"] = v["present"]; inc[f"items.{k}.in_use_sum"] = v["in_use"]; mx[f"items.{k}.present_max"] = v["present"]
    db.daily_summaries.update_one({"centre_id": kid, "date": day}, {"$inc": inc, "$max": mx, "$min": {"first_seen": now},
        "$set": {"last_seen": now, "updated_at": now}}, upsert=True)
    if time.time() - st["pt"] >= settings.live_timeline_gap_s:
        pt = {"ts": now, "people": people, "items": {k: {"present": v["present"], "in_use": v["in_use"]} for k, v in items.items()}}
        db.day_timelines.update_one({"camera_id": cam["_id"], "date": day}, {"$setOnInsert": {"centre_id": kid}, "$set": {"updated_at": now},
            "$push": {"points": {"$each": [pt], "$slice": -2000}}}, upsert=True); st["pt"] = time.time()
    db.sessions.update_one({"_id": sess["_id"]}, {"$min": {"actual_start_ts": now}, "$max": {"actual_end_ts": now},
                           "$inc": {"done_captures": 1}, "$set": {"status": "active"}})
    st["n"] += 1
    if st["n"] >= settings.consolidate_every_snapshots:
        st["n"] = 0
        from app.services.consolidation_job import consolidate_session, flags_for_session
        consolidate_session(sess["_id"], cam, tpl); flags_for_session(kid, sess["_id"], final=False)
```

## 6. Vision helpers

### 6.1 `cleanup.py` (rules: `any`, `seated`, `workstation`; "zone" is accepted as an alias)
```python
import cv2, numpy as np

def _poly(norm, w, h): return np.array([[x * w, y * h] for x, y in norm], np.float32).reshape(-1, 1, 2)
def _inside(poly, pt): return cv2.pointPolygonTest(poly, (float(pt[0]), float(pt[1])), False) >= 0
def _ratio(a, b):                                   # share of box b covered by box a
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy / max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))

def cleanup(dets, shape, roi_norm, zones_norm, presence_rule, staff_to_subtract):
    h, w = shape[:2]
    roi = _poly(roi_norm, w, h) if roi_norm and len(roi_norm) >= 3 else None
    zones = [_poly(z["polygon"], w, h) for z in (zones_norm or []) if len(z.get("polygon", [])) >= 3]
    people, chairs, objs = [], [], []
    for d in dets:
        x1, y1, x2, y2, conf, name = d
        pt = ((x1 + x2) / 2, y2) if name == "person" else ((x1 + x2) / 2, (y1 + y2) / 2)
        if roi is not None and not _inside(roi, pt): continue
        (people if name == "person" else chairs if name == "chair" else objs).append(d)
    rule, fallback, counted = {"zone": "workstation"}.get(presence_rule, presence_rule), False, []
    for p in people:
        if rule == "any": ok = True
        elif rule == "seated":
            if not chairs: ok, fallback = True, True            # no chair visible at all: never hide people (webcam close-ups)
            else:
                lower = (p[0], p[1] + 0.4 * (p[3] - p[1]), p[2], p[3])
                ok = any(max(_ratio(lower, c), _ratio(p, c)) > 0.12 for c in chairs)
        else:                                                   # workstation
            foot = ((p[0] + p[2]) / 2, p[3])
            if not zones and not objs: ok, fallback = True, True
            else: ok = any(_inside(z, foot) for z in zones) or any(_ratio(p, o) > 0.2 for o in objs)
        if ok: counted.append(p)
    return {"people_boxes": [p[:4] for p in people], "counted_boxes_full": counted, "all_people": people,
            "people_count": max(0, len(counted) - staff_to_subtract), "equipment": objs + chairs, "rule_fallback": fallback}
```

### 6.2 `usage.py`
```python
import cv2
SCREEN = {"monitor", "laptop"}

def _near(item, p, pad=0.15):
    pw, ph = p[2] - p[0], p[3] - p[1]
    x1, y1, x2, y2 = p[0] - pad * pw, p[1] - pad * ph, p[2] + pad * pw, p[3] + pad * ph
    return min(x2, item[2]) > max(x1, item[0]) and min(y2, item[3]) > max(y1, item[1])

def screen_on(frame, box) -> bool:
    x1, y1, x2, y2 = [max(0, int(v)) for v in box[:4]]; r = frame[y1:y2, x1:x2]
    if r.size == 0: return False
    g = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY); return bool(g.mean() > 70 or g.std() > 35)

def item_usage(frame, items, people, rules: dict) -> dict:
    """rules: {class: 'none'|'screen_on'|'in_use'} (the only valid template values). Returns only SEEN classes;
    the caller zero-fills the rest. idle = present and nobody near. off = screen class whose screen is not lit."""
    out = {}
    for it in items:
        s = out.setdefault(it[5], {"present": 0, "in_use": 0, "idle": 0, "off": 0}); s["present"] += 1
        mode = rules.get(it[5], "none")
        if mode == "none": continue
        if mode == "screen_on" and it[5] in SCREEN and not screen_on(frame, it): s["off"] += 1
        elif any(_near(it, p) for p in people): s["in_use"] += 1
        else: s["idle"] += 1
    return out
```

## 7. Consolidation: `consolidate.py` and `consolidation_job.py`
```python
# consolidate.py
import statistics
from collections import Counter
def consolidate(counts, tol=1, agree_ratio=0.6, min_frames=5):
    n = len(counts)
    if n < min_frames: return {"consistent": False, "observed": None, "ci_low": None, "ci_high": None, "n": n}
    freq = Counter(counts).most_common(); top = freq[0][1]; tied = [v for v, c in freq if c == top]
    med = statistics.median(counts); mode = min(tied, key=lambda v: abs(v - med))
    agree = [c for c in counts if abs(c - mode) <= tol]; ok = len(agree) / n >= agree_ratio
    return {"consistent": ok, "observed": mode if ok else int(round(med)), "ci_low": min(agree) if ok else min(counts),
            "ci_high": max(agree) if ok else max(counts), "n": n}
```
```python
# consolidation_job.py
from datetime import datetime, timezone
from app.db.mongo import db
from app.services import compliance, monitor
from app.services.consolidate import consolidate

def consolidate_session(sid, cam, tpl, final=False):
    win = int(tpl.get("max_frames", 40))
    snaps = list(db.snapshots.find({"session_id": sid, "camera_id": cam["_id"]}).sort("ts", -1).limit(win))
    if not snaps: return None
    counts = [s["people"] for s in snaps]
    res = consolidate(counts, int(tpl.get("count_tolerance", 1)), float(tpl.get("agree_ratio", 0.6)), int(tpl.get("base_frames", 5)))
    bucket = snaps[0]["ts"].replace(minute=0, second=0, microsecond=0)
    key = {"session_id": sid, "camera_id": cam["_id"], "hour_bucket": bucket, "source": "live"}
    db.observations.update_one(key, {"$set": {**key, "centre_id": cam["centre_id"], "observed_count": res["observed"],
        "ci_low": res["ci_low"], "ci_high": res["ci_high"], "state": "ok" if res["consistent"] else "uncertain",
        "frames_used": len(counts), "per_frame_counts": counts[::-1], "model_version": snaps[0].get("model_version")}}, upsert=True)
    sess = db.sessions.find_one({"_id": sid})
    iv = int((cam.get("live") or {}).get("interval_s", 10))
    db.sessions.update_one({"_id": sid}, {"$set": monitor.session_timing(sess, iv)})
    return res

def flags_for_session(centre_id, sid, final=False):
    sess = db.sessions.find_one({"_id": sid})
    compliance.raise_and_clear_flags(centre_id, sess, final)
```

## 8. Compliance: `app/services/compliance.py` (SINGLE SOURCE OF TRUTH)
```python
import math, statistics
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from cachetools import TTLCache
from app.db.mongo import db
from app.services.consolidate import consolidate

IST, ACTIVE_CAM_S, _cache = ZoneInfo("Asia/Kolkata"), 300, TTLCache(maxsize=256, ttl=4)

def margin(claimed, tol): return max(int(tol), math.ceil(0.10 * (claimed or 0)))

def people_verdict(*, claimed, counted, ci_low, ci_high, state, sanctioned_max, tol, snapshots, min_frames):
    if counted is None or snapshots < min_frames: return "waiting"
    if state == "ok" and ci_low > sanctioned_max: return "over_capacity"
    if state != "ok": return "unverifiable"                    # never accuse on shaky counts
    if claimed is None: return "unclaimed"
    m = margin(claimed, tol)
    if claimed > 0 and ci_high == 0: return "ghost"
    if claimed > ci_high + m: return "inflated"                # same rule as flag A1: uses the range, not the point estimate
    if ci_low > claimed + m: return "unregistered"
    return "match"

def equipment_verdict(*, detectable, snapshots, min_frames, sanctioned, declared, repairs, ci_high, consistent, operability, off_ratio):
    if not detectable: return "not_monitored"                  # e.g. projector: the model cannot see it
    if snapshots < min_frames: return "waiting"
    if consistent and ci_high < max(0, sanctioned - repairs): return "missing"
    if operability == "screen_on" and off_ratio >= 0.6: return "non_operational"   # idle is NOT broken; only lit-screen classes
    if declared != sanctioned: return "declaration_mismatch"
    return "ok"

def pick_session(centre_id, session_id, now):
    if session_id: return db.sessions.find_one({"_id": session_id, "centre_id": centre_id})
    s = db.sessions.find_one({"centre_id": centre_id, "status": {"$in": ["scheduled", "active"]}, "start_ts": {"$lte": now}, "end_ts": {"$gte": now}})
    if s: return s
    day0 = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    return db.sessions.find_one({"centre_id": centre_id, "start_ts": {"$gte": day0, "$lte": now}, "status": {"$ne": "cancelled"}}, sort=[("start_ts", -1)])

def compute(centre_id, session_id=None, fresh=False):
    now = datetime.now(timezone.utc); sess = pick_session(centre_id, session_id, now)
    key = (str(centre_id), str(sess["_id"]) if sess else None)
    if not fresh and key in _cache: return _cache[key]
    centre = db.centres.find_one({"_id": centre_id}); tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})
    out = _compute(centre, tpl, sess, now); _cache[key] = out; return out

def _compute(centre, tpl, sess, now):
    tol, agree = int(tpl.get("count_tolerance", 1)), float(tpl.get("agree_ratio", 0.6))
    minf, win = int(tpl.get("base_frames", 5)), int(tpl.get("max_frames", 40))
    enrolled = db.trainees.count_documents({"centre_id": centre["_id"], "active": True})
    claim = db.attendance_claims.find_one({"session_id": sess["_id"]}) if sess else None
    claimed = claim["claimed_count"] if claim else None
    per_people, per_eq, snaps_n = [], {}, 0
    if sess:
        rows = list(db.snapshots.aggregate([{"$match": {"session_id": sess["_id"]}}, {"$group": {"_id": "$camera_id", "last": {"$max": "$ts"}}}]))
        if sess["status"] in ("scheduled", "active"):          # live: only cameras that sent recently (duplicates never double count)
            rows = [r for r in rows if (now - r["last"]).total_seconds() <= ACTIVE_CAM_S]
        for r in rows:
            sn = list(db.snapshots.find({"session_id": sess["_id"], "camera_id": r["_id"]}, {"people": 1, "items": 1}).sort("ts", -1).limit(win))
            snaps_n = max(snaps_n, len(sn)); per_people.append(consolidate([s["people"] for s in sn], tol, agree, minf))
            for cls in {k for s in sn for k in s["items"]}:
                g = lambda f: [s["items"].get(cls, {}).get(f, 0) for s in sn]
                pres = g("present")
                per_eq.setdefault(cls, []).append({"present": consolidate(pres, tol, agree, 3), "in_use": statistics.median(g("in_use")),
                    "idle": statistics.median(g("idle")), "off": statistics.median(g("off")), "off_sum": sum(g("off")), "pres_sum": sum(pres)})
    ok = [p for p in per_people if p["observed"] is not None]
    counted = sum(p["observed"] for p in ok) if ok else None
    lo = sum(p["ci_low"] for p in ok) if ok else None; hi = sum(p["ci_high"] for p in ok) if ok else None
    state = "no_data" if not ok else ("ok" if all(p["consistent"] for p in ok) else "uncertain")
    verdict = people_verdict(claimed=claimed, counted=counted, ci_low=lo, ci_high=hi, state=state, sanctioned_max=centre["max_trainees"],
                             tol=tol, snapshots=snaps_n, min_frames=minf)
    gap = (claimed - counted) if (claimed is not None and counted is not None) else None
    people = {"enrolled": enrolled, "sanctioned_max": centre["max_trainees"], "claimed": claimed, "counted": counted, "ci_low": lo, "ci_high": hi,
              "state": state, "delta": gap, "margin": margin(claimed, tol) if claimed is not None else None, "verdict": verdict,
              "claimed_over_enrolled": claimed is not None and claimed > enrolled, "text": _people_text(verdict, claimed, counted, lo, hi, snaps_n, minf)}
    today, repairs = datetime.now(IST).date().isoformat(), {}
    for r in db.repair_declarations.find({"centre_id": centre["_id"], "status": "approved", "approved_until": {"$gte": today}}):
        repairs[r["equipment_class"]] = repairs.get(r["equipment_class"], 0) + r["qty"]
    rules, detect = {r["class"]: r.get("operability", "none") for r in tpl.get("equipment_rules", [])}, set(tpl.get("detector_classes", []))
    eq = []
    for e in centre.get("equipment", []):
        cls, sanc, decl = e["class"], int(e["sanctioned_qty"]), int(e.get("declared_qty", 0))
        parts = per_eq.get(cls) or ([{"present": {"observed": 0, "ci_low": 0, "ci_high": 0, "consistent": True}, "in_use": 0, "idle": 0, "off": 0,
                                      "off_sum": 0, "pres_sum": 0}] if (cls in detect and snaps_n >= minf) else [])
        seen = sum(p["present"]["observed"] or 0 for p in parts) if parts else None
        ci_hi = sum(p["present"]["ci_high"] or 0 for p in parts) if parts else None
        cons = bool(parts) and all(p["present"]["consistent"] for p in parts)
        used, idle, off = (sum(p[k] for p in parts) if parts else None for k in ("in_use", "idle", "off"))
        off_ratio = sum(p["off_sum"] for p in parts) / max(1, sum(p["pres_sum"] for p in parts)) if parts else 0
        v = equipment_verdict(detectable=cls in detect, snapshots=snaps_n if parts else 0, min_frames=minf, sanctioned=sanc, declared=decl,
                              repairs=repairs.get(cls, 0), ci_high=ci_hi if ci_hi is not None else 0, consistent=cons,
                              operability=rules.get(cls, "none"), off_ratio=off_ratio)
        label = e.get("label", cls)
        eq.append({"class": cls, "label": label, "sanctioned": sanc, "declared": decl, "seen": seen, "seen_max": ci_hi, "in_use": used, "idle": idle,
                   "off": off, "in_use_pct": round(100 * used / seen) if seen else None, "verdict": v,
                   "text": _eq_text(label, v, sanc, decl, seen, used, off, max(0, sanc - repairs.get(cls, 0)))})
    flags = [{"id": str(f["_id"]), "type": f["type"], "severity": f["severity"], "status": f["status"], "reason": f["reason"], "created_at": f["created_at"]}
             for f in db.flags.find({"session_id": sess["_id"]}).sort("created_at", -1).limit(20)] if sess else []
    return {"session": ({"id": str(sess["_id"]), "label": sess.get("label"), "start_ts": sess["start_ts"], "end_ts": sess["end_ts"], "status": sess["status"]} if sess else None),
            "as_of": now, "snapshots": snaps_n, "window": win, "people": people, "equipment": eq, "flags": flags, "summary": _summary(people, eq)}

def _people_text(v, claimed, counted, lo, hi, n, minf):
    rng = f"(range {lo}-{hi})"
    return {"waiting": f"Waiting for enough camera readings ({n} of {minf}).",
            "unclaimed": f"Camera counted {counted} {rng}. No attendance claim submitted yet.",
            "match": f"Claimed {claimed}, camera counted {counted} {rng}. These match.",
            "inflated": f"Claimed {claimed}, camera counted {counted} {rng}. {max(0, (claimed or 0) - (counted or 0))} fewer than claimed.",
            "ghost": f"Claimed {claimed} present but the camera saw nobody.",
            "unregistered": f"Camera counted {counted} {rng} but only {claimed} were claimed.",
            "over_capacity": f"Camera counted {counted} {rng}, above the sanctioned maximum.",
            "unverifiable": f"The camera count is unstable {rng}. Needs review."}[v]

def _eq_text(label, v, sanc, decl, seen, used, off, expected):
    return {"waiting": f"Waiting for camera readings for {label}.",
            "not_monitored": f"{label} is not detected by the counting model for this trade, so it is not checked automatically.",
            "missing": f"Fewer {label} seen than sanctioned: sanctioned {expected}, camera saw {seen}.",
            "non_operational": f"{label}: {off} appear switched off.",
            "declaration_mismatch": f"{label}: declared {decl}, sanctioned {sanc}.",
            "ok": f"{seen} {label} seen, {used} in use."}[v]

def _summary(p, eq):
    bad = [e for e in eq if e["verdict"] in ("missing", "non_operational", "declaration_mismatch")]
    if p["verdict"] == "waiting" and all(e["verdict"] in ("waiting", "not_monitored") for e in eq):
        return {"level": "waiting", "headline": "Waiting for camera data."}
    if p["verdict"] == "ghost" or (p["verdict"] == "inflated" and p["claimed"] and p["delta"] / p["claimed"] >= 0.5):
        return {"level": "critical", "headline": p["text"]}
    if p["verdict"] in ("inflated", "over_capacity", "unregistered", "unverifiable") or bad:
        return {"level": "attention", "headline": p["text"] if p["verdict"] not in ("match", "unclaimed", "waiting") else bad[0]["text"]}
    return {"level": "ok", "headline": "Everything matches so far."}

# ---------- flags: raised ONLY from compute(fresh=True), so preview and flags cannot disagree ----------
def _sev(g): return "low" if g < .15 else "medium" if g < .30 else "high" if g < .50 else "critical"

def raise_and_clear_flags(centre_id, sess, final=False):
    comp = compute(centre_id, sess["_id"], fresh=True); p, sid, want = comp["people"], str(sess["_id"]), {}
    if p["verdict"] == "inflated": want[f"{sid}:A1"] = ("A1", _sev((p["claimed"] - p["counted"]) / max(1, p["claimed"])), p["text"])
    if p["verdict"] == "ghost": want[f"{sid}:A4"] = ("A4", "critical", p["text"])
    if p["verdict"] == "over_capacity": want[f"{sid}:A2"] = ("A2", "high", p["text"])
    if p["verdict"] == "unregistered": want[f"{sid}:A5"] = ("A5", "low", p["text"])
    if p["verdict"] == "unverifiable" and final: want[f"{sid}:U1"] = ("U1", "low", p["text"])
    if p["claimed_over_enrolled"]: want[f"{sid}:A3"] = ("A3", "medium", f"Claimed {p['claimed']} but only {p['enrolled']} enrolled.")
    for e in comp["equipment"]:
        t = {"missing": "E1", "non_operational": "E2", "declaration_mismatch": "E3"}.get(e["verdict"])
        if t: want[f"{sid}:{t}:{e['class']}"] = (t, _sev((e["sanctioned"] - (e["seen"] or 0)) / max(1, e["sanctioned"])) if t == "E1" else ("high" if t == "E2" else "low"), e["text"])
    for key, (t, sev, reason) in want.items(): upsert_flag(centre_id, sess["_id"], t, sev, reason, key)
    for f in db.flags.find({"session_id": sess["_id"], "auto": True, "status": "open", "dedupe_key": {"$nin": list(want)}}):
        n = f.get("clear_streak", 0) + 1                       # auto-clear only after 2 clean evaluations, never touch human-handled flags
        if n >= 2 and len(f.get("events", [])) == 1:
            db.flags.update_one({"_id": f["_id"]}, {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc)},
                "$push": {"events": {"actor_role": "system", "action": "auto_clear", "comment": "Condition no longer present", "ts": datetime.now(timezone.utc)}}})
        else: db.flags.update_one({"_id": f["_id"]}, {"$set": {"clear_streak": n}})

def upsert_flag(centre_id, session_id, ftype, severity, reason, dedupe, details=None, state="flagged", camera_id=None):
    from app.services.files_store import copy_live_thumb
    from app.services import dbfuncs
    now, f = datetime.now(timezone.utc), db.flags.find_one({"dedupe_key": dedupe})
    if f:
        if f["status"] not in ("resolved", "dismissed"):
            db.flags.update_one({"_id": f["_id"]}, {"$set": {"reason": reason, "severity": severity, "details": details or f.get("details"), "updated_at": now, "clear_streak": 0}})
        return f
    ev = copy_live_thumb(centre_id, camera_id, dedupe)         # the live thumbnail is overwritten every frame: keep an own copy (90 days)
    doc = {"centre_id": centre_id, "session_id": session_id, "camera_id": camera_id, "type": ftype, "severity": severity, "state": state, "status": "open",
           "reason": reason, "details": details or {}, "evidence_ids": ev, "dedupe_key": dedupe, "auto": True, "clear_streak": 0,
           "events": [{"action": "created", "actor_role": "system", "ts": now}], "created_at": now, "updated_at": now}
    doc["_id"] = db.flags.insert_one(doc).inserted_id
    # ledger: record-only kind "flag_live". Do NOT use kind "flag": sync_tick would replay it into flags and create a duplicate.
    dbfuncs.recompute_risk(centre_id); return doc
```
`files_store.copy_live_thumb(centre_id, camera_id, dedupe)`: read blob `live_<camera_id>` (if camera_id is None use the newest
`live` blob of the centre), `save_blob(f"f_{dedupe}", ..., kind="flag")`, return `[that id]` or `[]`.

## 9. Live rows: `app/services/live.py` (read side)
```python
import re
from datetime import datetime, timezone
from app.core.config import settings
from app.db.mongo import db, sign_file_url
from app.services import compliance
from app.routers.live import kind_of

STALE_MIN_S = 30

def live_row(cam, centre, now=None, with_thumb=False):
    now = now or datetime.now(timezone.utc)
    official = cam.get("setup_status") == "approved"
    interval = int((cam.get("live") or {}).get("interval_s", settings.live_default_interval_s))
    row = {"camera_id": str(cam["_id"]), "camera_name": cam["name"], "source_kind": kind_of(cam), "centre_id": str(cam["centre_id"]),
           "centre_code": centre.get("code"), "centre_name": centre.get("name"), "district": centre.get("district"),
           "setup_status": cam.get("setup_status"), "data_official": official, "state": "offline", "ts": None, "age_s": None,
           "interval_s": interval, "session": None, "run_started_at": None, "elapsed_s": None, "people": None, "people_smooth": None,
           "claimed": None, "items": {}, "labels": {}, "quality": None, "error": None, "thumb_url": None, "spark": [], "model_version": None}
    ls = db.live_status.find_one({"_id": cam["_id"]})
    if not ls or not ls.get("ts"): return row
    age = (now - ls["ts"]).total_seconds()
    stale = age > max(3 * ls.get("interval_s", interval), STALE_MIN_S)               # staleness applies to provisional cameras too
    state = "offline" if stale else ls.get("state", "idle")
    if not stale and not official and state in ("live", "idle"): state = "provisional"
    show = (official or settings.record_provisional) and not stale                    # unofficial numbers only when allowed
    items = ls.get("items") or {}
    names = {e["class"]: e.get("label", e["class"]) for e in centre.get("equipment", [])}
    row.update({"state": state, "ts": ls["ts"], "age_s": round(age, 1), "interval_s": ls.get("interval_s", interval),
                "session": ls.get("session"), "run_started_at": ls.get("run_started_at"), "quality": ls.get("quality"),
                "error": ls.get("error") if state == "error" else None, "model_version": ls.get("model_version"),
                "people": ls.get("people") if show else None, "people_smooth": ls.get("people_smooth") if show else None,
                "claimed": ls.get("claimed") if show else None, "items": items if show else {},
                "labels": {k: names.get(k, k.title()) for k in items}, "spark": ls.get("spark", []) if show else []})
    start = ((ls.get("session") or {}).get("actual_start_ts")) or ls.get("run_started_at")
    if state in ("live", "provisional") and start: row["elapsed_s"] = int((now - start).total_seconds())     # computed at READ time
    if with_thumb and ls.get("thumb_id"): row["thumb_url"] = sign_file_url("evidence", ls["thumb_id"])      # centre routes only
    return row

def live_rows(centre_ids=None, district=None, state=None, q=None, limit=200, with_thumb=False):
    cq = {}
    if centre_ids is not None: cq["_id"] = {"$in": centre_ids}
    if district: cq["district"] = district
    if q: cq["$or"] = [{"name": {"$regex": re.escape(q), "$options": "i"}}, {"code": {"$regex": re.escape(q), "$options": "i"}}]
    centres = {c["_id"]: c for c in db.centres.find(cq).limit(limit)}
    now, memo, rows = datetime.now(timezone.utc), {}, []
    for cam in db.cameras.find({"centre_id": {"$in": list(centres)}}):
        c = centres[cam["centre_id"]]; row = live_row(cam, c, now, with_thumb)
        sid = (row.get("session") or {}).get("id")
        if sid and row["state"] in ("live", "provisional"):
            key = (c["_id"], sid)                                                     # ONE compliance computation per session, not per camera
            if key not in memo:
                comp = compliance.compute(c["_id"], __import__("bson").ObjectId(sid))
                memo[key] = {"level": comp["summary"]["level"], "headline": comp["summary"]["headline"], "verdict": comp["people"]["verdict"]}
            row["compliance_summary"] = memo[key]
        rows.append(row)
    counts = {k: 0 for k in ("live", "idle", "offline", "tampered", "provisional", "error")}
    for r in rows: counts[r["state"] if r["state"] in counts else "idle"] += 1
    if state: rows = [r for r in rows if r["state"] == state]
    return rows, counts
```
Routes: `GET /my/live` -> `{"items": rows, "counts": counts}` using `with_thumb=True`. `GET /live` -> same, no thumbnails.
`GET /centres/{id}/live` -> `{"cameras": rows, "items": rows, "counts": counts, "timeline": ..., "flags": ...}` (both keys, so
either frontend contract works). `GET /my/compliance` and `GET /centres/{id}/compliance` return `compliance.compute(...)`.

## 10. Config, template defaults, one-time repairs

| Setting | Default | Note |
|---|---|---|
| `LIVE_DEFAULT_INTERVAL_S` | 10 | use 5 for demos |
| `CONSOLIDATE_EVERY_SNAPSHOTS` | 5 | equals `base_frames` of the demo template |
| `RECORD_PROVISIONAL` | true | unapproved cameras record and are marked unofficial |
| `STALE_MIN_S` | 30 | offline after max(3 x interval, 30 s) |
| `MIN_GAP_S` (frame endpoint) | 1.5 | independent of the interval |
| `ACTIVE_CAM_S` | 300 | cameras counted in a live session |
| template `presence_rule` | `any` | `seated` only for rooms where chairs are clearly visible |
| template `count_tolerance` / `agree_ratio` | 1 / 0.6 | |
| template `base_frames` / `max_frames` | 5 / 20 | |
| camera `subtract_staff` | false | true only if a trainer is normally visible |

Demo template "Webcam Demo Room": classes person, chair, desk, monitor, laptop, keyboard, mouse, cell phone, book;
`presence_rule any`; `class_conf {person: 0.30, chair: 0.20, desk: 0.15, monitor: 0.30, laptop: 0.30}`;
`class_alias {"bench": "desk"}`; `min_box_area 0.015`. Calibrate with `scripts/calibrate.py` on your own webcam frames.

One-time repairs (mongosh), then restart the backend:
```js
// 1) put your centre on the webcam template and set sanctioned equipment to what the webcam can see
const t = db.trade_templates.findOne({trade_name: "Webcam Demo Room"})._id;
db.centres.updateOne({code: "DSK-WB-0001"}, {$set: {trade_template_id: t, equipment: [
  {class: "chair", label: "Chair", sanctioned_qty: 2, declared_qty: 2},
  {class: "desk", label: "Desk", sanctioned_qty: 1, declared_qty: 1},
  {class: "monitor", label: "Monitor", sanctioned_qty: 1, declared_qty: 1}]}});
// 2) give older cameras a source_kind and a lowercase name; then remove duplicates (keep the oldest) before indexing
db.cameras.updateMany({source_uri: "browser", source_kind: {$exists: false}}, {$set: {source_kind: "browser"}});
db.cameras.find().forEach(c => db.cameras.updateOne({_id: c._id}, {$set: {name_lower: c.name.toLowerCase(), subtract_staff: false}}));
// duplicates: run scripts/repair_cameras.py (renames "Cam 01" duplicates to "Cam 01 (2)", ...), then:
db.cameras.createIndex({centre_id: 1, name_lower: 1}, {unique: true});
```
`POST /my/cameras` sets `name_lower` and returns 409 `CAMERA_EXISTS` on a duplicate; sessions with no snapshots after `end_ts`
become `missed`, never `closed`.

## 11. Data flow (corrected)

| Consumer | Refresh | Source |
|---|---|---|
| Centre Live Monitor panel | every accepted frame (interval) | frame response |
| Centre `/my/live`, `/my/compliance` | 5 s on /live, 15 s on dashboard | live_status, snapshots |
| Govt `/live`, `/centres/{id}/live`, `/centres/{id}/compliance` | 5 s | same collections |
| Flags | after every consolidation (5 snapshots, about 25 to 50 s) | `compliance.compute(fresh=True)` |

Timeline example (interval 10 s, `base_frames` 5, tolerance 1, claim 12, sanctioned: 2 chairs, 1 desk, 1 monitor):
```
09:00:00 monitoring starts (run created)            snapshots 0   compliance: waiting
09:00:10 frame 1: 1 person, 1 chair, 1 monitor      live_status written, snapshot 1
...      frames 2-4                                  snapshots 4   compliance: waiting (4 of 5)
09:00:50 frame 5                                     snapshot 5 -> consolidate([1,1,1,0,1]) = observed 1, range 0-1, consistent
                                                     claimed 12 > ci_high 1 + margin 2 -> verdict "inflated" -> flag A1 (evidence copied)
                                                     chair: ci_high 1 < sanctioned 2 -> "missing" -> flag E1; desk 0 < 1 -> E1
10:00:00 session end: closed (has data) or missed (no data), final consolidation, U1/C3/M1 only here
```

## 12. Debugging

| Symptom | Likely cause | Check or fix |
|---|---|---|
| Live Monitor says "No cameras" | `/my/cameras` failed or camera not auto-created | DevTools: GET /my/cameras status; `ensureCamera` runs on mount |
| Same camera 3 times | camera created per visit | unique index + repair script (section 10) |
| "Waiting for the first frame" over 30 s | frames not sent or failing | read the status line; DevTools: POST .../frame status and body |
| 422 NOT_BROWSER_CAMERA | selected a non-browser camera | choose the "This computer" camera |
| 429 TOO_FAST | spacing below `MIN_GAP_S` | slow the loop; server tolerates 1.5 s |
| 503 DETECTOR_UNAVAILABLE | torch/ultralytics/model download | `python -m scripts.webcam_test --source 0`; read `advice` |
| Frames accepted, people 0, you are visible | `seated` with chair not matching, ROI too small, `min_box_area` too high | dashed boxes show "not counted"; set `presence_rule any`, clear the ROI |
| Gov wall empty | `/live` returns 500, or stale live_status | open `/live` in the browser tab with a token; check `db.live_status` |
| Compliance stuck on "Waiting" | fewer than `base_frames` snapshots, no active session, camera unapproved with `RECORD_PROVISIONAL=false` | `db.snapshots.countDocuments({session_id: ObjectId("...")})` |
| No flags | no claim yet; equipment class not in `detector_classes` ("not monitored") | set a demo claim; check verdict texts |
| Counts doubled | two cameras active in the same room | stream from one camera only |

Quick mongosh checks:
```js
db.live_status.find({}, {camera_name: 1, state: 1, people: 1, ts: 1}).sort({ts: -1}).limit(3)
db.cameras.find({}, {name: 1, source_kind: 1, setup_status: 1})
db.sessions.find({status: "active"}, {label: 1, start_ts: 1, end_ts: 1, done_captures: 1})
db.snapshots.find({}, {people: 1, items: 1, ts: 1}).sort({ts: -1}).limit(3)
db.flags.find({auto: true}, {type: 1, severity: 1, reason: 1, status: 1}).sort({created_at: -1}).limit(5)
```
Whole chain from your PC without any frontend: `python -m scripts.frame_test --api <url> --login <id> --password <pw>`.

## 13. Must-pass tests

1. `GET /my/live` and `GET /live` return 200 for cameras with and without `live_status` (no KeyError).
2. A fresh centre: one laptop auto-creates exactly one camera; reloading the page never creates another; a duplicate name returns 409.
3. First frame may take up to 30 s and does not block other requests (check `/health` while it loads).
4. Provisional camera + active session + `RECORD_PROVISIONAL=true`: snapshots, timeline and compliance are produced; the Gov row shows
   state "provisional" with numbers; with the setting false the Gov row shows no numbers.
5. A person visible, `presence_rule seated`, no chair detected: people is counted (`rule_fallback true`).
6. A verified presenter alone in front of the laptop with `subtract_staff` false: counted is 1, not 0.
7. Remove the chair from view: `items.chair.present` becomes 0 (zero-filled) and E1 appears within about 2 consolidations.
8. Claim 12, camera counts 1: verdict "inflated", A1 raised once (re-evaluations update the same flag), evidence image exists
   after the live thumbnail is replaced. Set the claim to 1: after 2 clean evaluations the auto flag resolves.
9. Idle monitor (nobody near) is NOT "non_operational"; a monitor with its screen off in at least 60 % of frames is.
10. A sanctioned class the model cannot detect shows "not monitored", never "missing".
11. Fewer than `base_frames` snapshots: verdict "waiting", never "ghost".
12. A frame request without a valid camera returns `{detail:{detail,code,advice}}`; the frontend always shows the status line.
13. Elapsed timers keep correct values between frames (computed at read time); stopping the tab turns the camera "offline" within
    max(3 x interval, 30 s) and ends the monitoring run by timeout.
14. Gov `/centres/{id}/live` contains both `cameras` and `items`; Gov rows never contain `thumb_url`.