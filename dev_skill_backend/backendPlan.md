==================================================================
 dev_skill_backend: PLAN AND SPEC  v4
 (FastAPI + MongoDB Atlas + YOLO counting + STAFF-ONLY faces + own JWT
  auth + LIVE MONITOR + MONITOR RUNS + SCHEDULES + CALENDAR)
 Give with: Backend key code (v2 Block 3: consolidate, flag_engine,
 ledger, sync), M1-M4, "Backend additions for Centre portal v2".
 Where this block and older blocks disagree, THIS block wins.
==================================================================

RULES FOR THE AI BUILDER (read first, obey exactly)
------------------------------------------------------------------
 1. Python 3.10/3.11. FastAPI + Uvicorn. Sync endpoints are fine; run
    heavy vision work in a thread pool (starlette run_in_threadpool),
    never blocking inside an async def body.
 2. NO Supabase. Database = MongoDB Atlas via PyMongo (sync), ONE cluster,
    database "devskill". MONGODB_URI, JWT_SECRET, FERNET_KEY,
    FILE_URL_SECRET live only in backend .env, never returned or logged.
 3. Frontends only call this API. Every endpoint uses
    Depends(require(...roles...)) except the PUBLIC ones.
 4. Centre-side roles only touch documents whose centre_id equals
    user["centre_id"]. Filter by centre_id in EVERY centre route. Never
    trust a centre_id from the client.
 5. Timestamps = timezone-aware UTC datetimes. Date-only values are
    "YYYY-MM-DD" strings (calendar dates are IST dates). Times "HH:MM".
 6. Raw frames are NEVER written to disk or database, never logged, never
    returned. Only blurred, annotated, resized JPEG thumbnails (<=60 KB)
    may be saved. Face images are decoded in memory and dropped.
 7. Never store plain passwords. Temporary passwords are returned once.
 8. Errors: HTTPException(status, detail={"detail": "...", "code": "X"}).
    401, 403, 404, 409, 422, 429, 503.
 9. Do not invent collections or fields. Use only the COLLECTIONS shapes.
10. Every state-changing officer/admin/centre-schedule action writes to
    audit_log (insert-only). Snapshots are not audit-logged (volume) but are
    covered by ledger batch digests.
11. Thresholds live in trade_templates / camera.live, not in code.
12. IDs: ObjectId internally; return strings under "id" (ser()). Parse
    incoming ids with oid() (422 BAD_ID).
13. Lists: ?limit=25 (max 100) & ?cursor=<last id>; never skip(). Return
    {"items":[...],"next_cursor":..}.
14. No DB triggers: invariants are enforced in code.
15. Public routes rate limited (slowapi 20/min/IP; login 10/min). Frame
    endpoint has per-camera spacing (0.5 x interval, 429 TOO_FAST).
16. Do not add features not listed.
17. LIVE PATH FAST: <= 1.5 s per frame on 2 vCPU (yolo11s, imgsz 960,
    tiling OFF for live). Semaphore(2); if busy return {"accepted":false,
    "reason":"BUSY"} (HTTP 200).
18. SERVER TIME ONLY. Never use client timestamps.
19. WRITE FALLBACK: Atlas unreachable (3 s) -> snapshots/observations go to
    the local ledger outbox and replay via sync. live_status and
    monitor_runs are best-effort offline.
20. Provisional cameras (setup_status != approved) update live_status only.
    They never write snapshots, timelines, summaries, flags or session
    timing.
21. FACES: FACE DETECTION AND RECOGNITION EXIST ONLY FOR CENTRE OFFICIALS
    (staff: trainers/officials). They are used in exactly two routes:
    POST /my/staff/{id}/face-enrol and POST /my/sessions/{id}/staff-scan.
    The live pipeline, thumbnails, calendar and demo runner NEVER call the
    face engine. No face data of trainees exists in any form. The face
    engine loads lazily on first staff use and can never crash startup
    (503 FACE_ENGINE_UNAVAILABLE with a reason).
22. GOVERNMENT SEES DATA ONLY: GET /live and GET /centres/{id}/live must NOT
    return thumb_url unless env GOV_LIVE_THUMBS=true. Blurred thumbnails stay
    on centre routes and in flag/calendar evidence.
23. sessions documents omit actual_start_ts / actual_end_ts until set
    (use $min / $max updates).

FOLDER STRUCTURE
------------------------------------------------------------------
 dev_skill_backend/
   .env  requirements.txt  README.md
   scripts/init_db.py  download_models.py  webcam_test.py  calibrate.py
   models/  sample_videos/  data/  eval/
   app/
     main.py
     core/    config.py security.py deps.py audit.py limiter.py
     db/      mongo.py local.py
     routers/ auth.py applications.py centres.py schemes.py users.py
              cameras.py schedule.py trainees.py attendance.py staff.py
              equipment.py requests.py flags.py notices.py reports.py
              files.py edge.py live.py sessions.py calendar.py
     services/ credentials.py ledger.py sync.py consolidate.py
               flag_engine.py plausibility.py scheduler.py pipeline.py
               dbfuncs.py files_store.py monitor.py live.py live_capture.py
               calendar.py face.py            (face.py = STAFF ONLY)
               vision/ detector.py quality.py cleanup.py privacy.py usage.py

ENVIRONMENT (.env)
------------------------------------------------------------------
 MONGODB_URI=mongodb+srv://<user>:<urlencoded-pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
 MONGODB_DB=devskill
 JWT_SECRET=<64+ chars>   FILE_URL_SECRET=<64+ chars, different>
 FERNET_KEY=...  EDGE_SIGNING_KEY_HEX=<64 hex>  DEVICE_ID=edge-001
 ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,https://<gov>.vercel.app,https://<center>.vercel.app
 FORCE_OFFLINE=false
 MODELS_DIR=models
 DETECTOR_MODEL=yolo11s          # yolo11n for weak CPUs
 DETECTOR_IMGSZ=960
 FACE_BACKEND=auto               # STAFF ONLY. auto|opencv|insightface (auto = opencv first)
 FACE_THRESHOLD=0.363            # opencv SFace cosine; insightface use 0.45
 FACE_LIVENESS=false             # true: staff scan needs head movement across frames
 GOV_LIVE_THUMBS=false
 LIVE_DEFAULT_INTERVAL_S=10      LIVE_TIMELINE_GAP_S=30
 LIVE_SNAPSHOT_TTL_DAYS=14       ROUTINE_EVIDENCE_EVERY_MIN=15
 CONSOLIDATE_EVERY_SNAPSHOTS=20  RUN_TIMEOUT_INTERVALS=3
 SCHEDULE_HORIZON_DAYS=60
 (config.py has matching fields. .env is in .gitignore.)

REQUIREMENTS (requirements.txt)
------------------------------------------------------------------
 fastapi, uvicorn[standard], pydantic-settings, python-dotenv, pymongo[srv],
 PyJWT, argon2-cffi, pyotp, slowapi, cachetools, apscheduler,
 python-multipart, httpx, ultralytics, opencv-python-headless>=4.8, numpy,
 pillow, cryptography, torch/torchvision (CPU build:
 pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu)
 OPTIONAL: insightface + onnxruntime (only if FACE_BACKEND=insightface;
 Windows needs Microsoft C++ Build Tools). NO supabase.
 python -m scripts.download_models downloads face_detection_yunet_2023mar.onnx
 and face_recognition_sface_2021dec.onnx (OpenCV Zoo) into MODELS_DIR; yolo
 weights are fetched by ultralytics on first use.

RUN AND EXPOSE
------------------------------------------------------------------
 python -m scripts.init_db                 (once; safe to re-run)
 python -m scripts.download_models         (once; needed only for staff faces)
 python -m scripts.webcam_test --source 0  (local window: boxes + counts, no server)
 uvicorn app.main:app --host 0.0.0.0 --port 8000
 HTTPS is required for the frontends (getUserMedia): ngrok reserved domain,
 Cloudflare Tunnel or Caddy. CORS exact origins. Frontends send header
 "ngrok-skip-browser-warning: true".
 Startup: sync.register_device(); scheduler.start(); background warm-up of the
 DETECTOR only (never the face engine, never raising).
 Scheduler jobs (max_instances=1): sync_tick 20 s; session_status_tick 30 s;
 run_watchdog 15 s; live_capture_tick 5 s (server cameras only);
 expire_repairs daily; generate_sessions nightly (next 14 days; never touches
 past, cancelled or edited sessions); daily_rollup_fix hourly.

AUTH MODEL (unchanged)
------------------------------------------------------------------
 POST /auth/login {login_id, password} (govt login_id = email; centre
 DSK-WB-0001, trainer DSK-WB-0001-T01). 5 failures -> 15 min lock (429
 ACCOUNT_LOCKED). TOTP MFA for govt roles. Access JWT 30 min + one-time
 rotating refresh 7 days (hashed, TTL). Password change/reset bumps
 users.token_version. must_change_password blocks all but GET /me and
 POST /me/change-password; expiry -> 403 CREDENTIALS_EXPIRED. Password: >=10
 chars, upper, lower, digit, special. Roles: super_admin, scheme_officer,
 auditor (GET only), centre_admin, trainer.

LIVE MONITORING, RUNS, SESSIONS, CALENDAR
------------------------------------------------------------------
 A. CAMERA SOURCE KINDS (cameras.source_kind, derived from source_uri)
    browser  "browser": the Centre /live tab captures PC-webcam frames and
             POSTs them. DEFAULT for teammates' PCs.
    webcam   "webcam:0": backend reads its own machine's webcam
             (cv2.VideoCapture(index, cv2.CAP_DSHOW) on Windows).
    rtsp     rtsp://... (future CCTV; same pipeline).
    file     "file:<name>" from sample_videos/ (Demo Lab only).
    cameras.live = {enabled, interval_s 5..120, tiling false};
    cameras.subtract_staff (true for the first camera); zone_label.
    Several cameras per centre must cover different areas; session observed =
    SUM over cameras.

 B. FRAME FLOW (process_live_frame) - COUNTING ONLY, NO FACE ENGINE
    1 Resolve camera, centre, template and the ACTIVE session (status
      scheduled|active, now within start_ts..end_ts) or None.
    2 monitor.ensure_run(): a run is created if none is running.
    3 Quality gate (dark/covered/blurry/frozen/moved). Bad frame: state
      "tampered", health event on change, run.frames_bad++, after 3
      consecutive bad frames inside a session raise C1 (deduped). Bad frames
      are never counted.
    4 Detect (per-class thresholds, aliases) -> cleanup (ROI, presence rule,
      staff subtraction) -> item_usage().
    5 Output: people (final), people_raw, items, people_smooth (median of
      last 5).
    6 Thumbnail: head regions (top 30 % of every person box) blurred, boxes +
      labels drawn, 640 px, JPEG q60. "live_<camera_id>" (kind live, 1 d)
      each frame; one routine thumbnail per ROUTINE_EVIDENCE_EVERY_MIN
      during sessions (kind routine, 14 d).
    7 live_status upserted always. If camera approved AND session active:
      snapshot, day_timelines (<=1 point / LIVE_TIMELINE_GAP_S),
      daily_summaries, sessions $min actual_start_ts / $max actual_end_ts /
      $inc done_captures, run counters. Every CONSOLIDATE_EVERY_SNAPSHOTS and
      at close: consolidate_session().
    8 Response: {accepted, state, session, people, people_smooth, items,
      boxes[] (normalised 0..1, for the LOCAL preview), run{id,started_at},
      next_interval_s}.
    COUNT ACCURACY NOTES: webcam views are close-ups (partial bodies); keep
    person threshold low (calibrate), use ROI to exclude background people,
    min box area filter (default 1.5 % of frame) per template field
    min_box_area, and rely on consolidation (mode over frames), not on a
    single frame.

 C. IN-USE DEFINITION (usage.py)
    present   detected inside ROI.
    in_use    a person box (expanded 15 %) overlaps the item; for operability
              "screen_on" classes the screen must also be on.
    off       screen class, screen not on.  idle  present, not off, nobody near.
    operability "none" = presence only.

 D. CONSOLIDATION AND FLAGS (rolling)
    consolidate_session(final): counts of last max_frames snapshots ->
    consolidate() -> observation {source live} (upsert by session, camera,
    hour_bucket); equipment per class (present counts + in_use_pct); ledger
    entry on change; session summary; flag_engine.evaluate when frames >=
    base_frames; flags upserted by dedupe_key. U1, C3, M1 only when final.

 E. MONITOR RUNS (start and end of streaming)
    monitor_runs record every start and stop:
      started_at, ended_at, end_reason: manual | timeout | session_end |
      error | system, by user|system, started_by, frames_sent, frames_ok,
      frames_bad, last_frame_at, duration_s.
    Start: POST /my/cameras/{id}/monitor/start (or the first frame).
    Stop: POST .../monitor/stop. run_watchdog ends a run when now -
    last_frame_at > RUN_TIMEOUT_INTERVALS x interval (ended_at = last_frame_at,
    reason timeout). Server cameras: live_capture_tick starts runs by "system";
    they end at session end.
    SESSION TIMING (stored on the session from snapshots; recomputed on each
    consolidation and at close, because snapshots expire in 14 days):
      actual_start_ts first recordable snapshot
      actual_end_ts   last recordable snapshot
      monitored_s     sum of gaps between consecutive snapshots that are
                      <= 3 x interval, plus one interval
      late_start_s    max(0, actual_start - scheduled start)
      early_end_s     max(0, scheduled end - actual_end)
      coverage_pct    monitored_s / scheduled duration

 F. SESSIONS AND SCHEDULES
    Sources: recurring batches (kind scheduled), ONE-OFF sessions created by
    the centre (kind oneoff), demo sessions (kind adhoc).
    Lifecycle: scheduled -> active (start_ts passed) -> closed (had camera
    data) | missed (window passed with no camera data) | cancelled (centre
    cancelled with a reason before start).
    Centre rules:
      - one-off: date >= today, start >= 5 min in the future, duration 15..480
        min, within SCHEDULE_HORIZON_DAYS, no overlap with another
        non-cancelled session (409 SESSION_OVERLAP, 422 BAD_TIME).
      - edit/cancel only while scheduled and start_ts > now + 5 min.
      - past sessions are never created, edited or deleted.
      - batches: create/edit allowed (NO approval needed); future scheduled
        sessions of that batch with done_captures == 0 are deleted and
        regenerated; every change is audit-logged and visible to govt.
      - demo session: 409 SESSION_ACTIVE if one is active, 409 SESSION_OVERLAP.
    session_status_tick (every 30 s):
      scheduled & start_ts <= now < end_ts  -> active; planned_captures =
        floor(duration_s / interval_s)
      (scheduled|active) & end_ts <= now:
        has snapshots -> consolidate(final=True) per camera, timing, status
          closed, runs of the session ended (session_end)
        no snapshots  -> status missed; if a claim exists raise C3 (high,
          "Attendance claimed but the camera did not run"); else if the
          centre is live raise M1 (low)
      cancelled sessions raise nothing.

 G. CALENDAR (calendar.py)
    Per snapshot: snapshots (14 d TTL) -> day_timelines -> daily_summaries.
    updates = snapshots + claims + flags + health events.
    Day status precedence: holiday | cancelled (all cancelled) | upcoming
    (after today, or today with only not-yet-started sessions) | none (no
    sessions, no data) | missed (sessions, none held, >=1 missed) | partial
    (some held, some missed) | no_data (held but no snapshots) | critical
    (flag high/critical) | attention (open flag) | ok.
    A range call = grouped queries only (daily_summaries; sessions grouped by
    date with status counts; flags grouped by IST date; holidays).

 H. STALENESS: live_status.ts older than 3 x interval -> "offline".

COLLECTIONS (the only data shapes allowed)
------------------------------------------------------------------
 Notation: oid, dt = UTC datetime, d = "YYYY-MM-DD", t = "HH:MM".
 UNCHANGED: users, refresh_tokens, counters, schemes, applications, centres,
 holidays, trainees (NO face/photo/biometric fields, ever), attendance_claims,
 staff_attendance, camera_health_events, frame_fingerprints, edge_devices,
 ledger_entries, repair_declarations, change_requests, notices, audit_log,
 day_timelines, daily_summaries, evidence_blobs, batches.

 trade_templates {scheme_id, trade_name, detector_classes[canonical names],
   detector_backend: auto|coco|world, detector_model: yolo11n|yolo11s|yolo11m
   (default yolo11s), imgsz(default 960), class_conf{class:0.05..0.95}
   (optional), class_alias{raw:canonical} (optional; built-in tv->monitor,
   dining table->desk), min_box_area(0.002..0.2, default 0.015),
   equipment_rules[{class,label,min_units_per_trainee,operability:none|
   screen_on|in_use,required}], presence_rule: seated|workstation|any,
   count_tolerance(0-5), agree_ratio(0.5-1), min_confidence(0.05-0.95),
   base_frames(>=5), step_frames(>=1), max_frames(>=base), active}
 staff {centre_id, user_id (REQUIRED to scan; links to users), full_name,
   staff_role: trainer|official, phone, face_consent, face_consent_at?,
   face_enrolled, active, created_at}
 staff_faces {_id = staff _id, embedding_enc(Binary), model, backend, n_frames,
   created_at}   (backend must match at verify time, else FACE_BACKEND_CHANGED
   and the person re-enrols)
 cameras {centre_id, name, source_uri, source_kind, resolution,
   roi_polygon[[x,y]]|null, zones[{name,polygon}]|null, zone_label?,
   subtract_staff, live{enabled,interval_s,tiling}, reference_phash?,
   reference_blob_id?, setup_status: draft|submitted|approved|rejected,
   reject_reason?, submitted_at?, decided_by?, decided_at?, status:
   unknown|online|offline|tampered, last_tamper_reason?, last_seen?,
   created_at}
 sessions {centre_id, batch_id|null, kind: scheduled|oneoff|adhoc, label,
   session_date(d), start_ts, end_ts, status: scheduled|active|closed|missed|
   cancelled, cancel_reason?, created_by?, planned_captures, done_captures,
   actual_start_ts?, actual_end_ts?, monitored_s?, late_start_s?, early_end_s?,
   coverage_pct?, summary{claimed,observed,ci_low,ci_high,state,delta,
   snapshots,staff_verified}|null}
 monitor_runs {centre_id, camera_id, session_id|null, started_by|null, by:
   user|system, status: running|ended, started_at, last_frame_at, ended_at?,
   end_reason?, duration_s?, frames_sent, frames_ok, frames_bad}
 snapshots {centre_id, camera_id, session_id, ts, people, people_raw,
   items{class:{present,in_use,idle,off}}, quality{ok,reasons[]},
   model_version, latency_ms, snap_key(unique)}   TTL on ts
 live_status {_id = camera_id, centre_id, centre_code, centre_name, district,
   camera_name, state: live|idle|tampered|provisional, ts, interval_s,
   session{id,label,start_ts,end_ts,actual_start_ts?}|null, run_started_at?,
   people, people_smooth, items{...}, quality{ok,reasons[]}, claimed|null,
   model_version, latency_ms, thumb_id}
 observations {centre_id, session_id, camera_id, hour_bucket, source: live|
   demo, observed_count|null, ci_low, ci_high, state: ok|uncertain,
   frames_used, per_frame_counts[], equipment{class:{observed,ci_low,ci_high,
   consistent,in_use_pct,status}}, tamper[], model_version, ledger_hash?}
 flags {... v2 shape ..., camera_id?, dedupe_key?(unique sparse),
   events[], evidence_ids[]}  type enum: A1 A2 A3 A4 A5 E1 E2 E3 S1 C1 C2 C3
   D1 U1 P1 M1

 RESPONSE RULES: flags return evidence_urls[]. live_status returns thumb_url
 ONLY on centre routes (GET /my/live) or when GOV_LIVE_THUMBS=true. Never
 expose raw ids as URLs, password hashes, mfa secrets or embeddings.

API ENDPOINTS (JSON; * = write)
------------------------------------------------------------------
 PUBLIC (20/min/IP)
  POST /public/applications ; POST /public/applications/{code}/documents?phone=
  GET  /public/applications/track?code=&phone= ; PUT /public/applications/{code}
  GET  /public/schemes
 AUTH / ME / FILES / SYSTEM
  POST /auth/login | /auth/mfa/login | /auth/refresh | /auth/logout
  GET  /me ; POST /me/change-password* ; POST /me/mfa/setup* | /me/mfa/enable*
  GET  /files/{kind}/{id}?exp=&sig=      HMAC, 60 s
  GET  /health ; GET /edge/health (centre_admin, super_admin)
       -> {atlas, detector{ready,model,error?}, face{ready,backend,error?},
           models_dir, version:"4"}   (?warm=true loads the detector)
 GOVT (write: super_admin, scheme_officer; auditor GET only)
  GET/POST*/PUT* /schemes ; /schemes/{id}/templates ; /templates/{id}
  GET  /applications?status=&q= ; GET /applications/{id}
  POST /applications/{id}/approve* | /reject* | /query*
  POST /centres* ; GET /centres?district=&status=&q=&sort=risk&limit=
  GET  /centres/{id} ; POST /centres/{id}/reset-credentials*
  GET  /centres/{id}/attendance | /equipment | /evidence?from=&to= | /timeline
  GET  /cameras?status=&setup_status= ; POST /cameras/{id}/approve* | /reject*
  GET  /flags?... ; GET /flags/{id} ; POST /flags/{id}/action* ;
       POST /flags/bulk-acknowledge*
  GET  /requests ; POST /requests/{id}/decide*
  POST /notices* ; GET /notices?centre_id=
  GET  /reports/rollup?by=district|scheme|trade  (adds sessions_held_pct,
       missed_sessions, avg_coverage_pct)
  GET  /audit-log ; GET /accuracy ; GET/POST* /users ; POST /users/{id}/deactivate*
  LIVE AND SCHEDULE (read: all govt roles)
  GET  /live?district=&state=&q=         LiveStatus rows (no thumb_url), counts
  GET  /centres/{id}/live                cameras + today's timeline + latest flags
  GET  /sessions?date=&status=&district=&q=&limit=&cursor=
                                         {items: SessionRow[], counts{scheduled,
                                         running,held,missed,cancelled}, date}
  GET  /sessions/{id}                    SessionRow + runs[] + summary
  GET  /centres/{id}/schedule?from=&to=  {batches, sessions[], holidays[],
                                         changes[{ts,actor_name,action,entity,text}]}
  GET  /centres/{id}/runs?from=&to=      RunRow[]
  GET  /centres/{id}/calendar?from=&to= | /calendar/{date} | /calendar/{date}/snapshots
 CENTRE (centre_admin, trainer; own centre)
  GET  /my/centre ; GET/POST* /my/cameras ; PUT /my/cameras/{id}/setup* ;
  POST /my/cameras/{id}/submit* ; PUT /my/cameras/{id}/live* ;
  GET/POST* /my/cameras/{id}/reference-frame ; POST /my/cameras/{id}/frame*
  POST /my/cameras/{id}/monitor/start*   -> {run}; sets live.enabled; 403 CENTRE_INACTIVE
  POST /my/cameras/{id}/monitor/stop*    {reason?} -> {run, session_timing}
  GET  /my/monitor/runs?from=&to=        RunRow[]
  GET  /my/live ; GET /my/live/diagnostics
       -> {api_ok, camera{id,source_kind,setup_status,live}, last_frame_at,
           last_state, last_reasons, frames_today, session|null, run|null,
           detector_ready, advice[str]}
  GET  /my/schedule?from=&to=            {batches, sessions[SessionRow], holidays}
  POST /my/sessions*                     one-off {date,start_time,end_time,label?,batch_id?}
  PUT  /my/sessions/{id}*                {date?,start_time?,end_time?,label?}
  POST /my/sessions/{id}/cancel*         {reason} required
  POST /my/live/demo-session*            {minutes 15..180, label?}
  GET/POST*/PUT* /my/batches ; GET/POST* /my/holidays ; DELETE* /my/holidays/{id}
  GET  /my/sessions/today ; GET /my/sessions?from=&to=
  GET/POST* /my/trainees ; POST /my/trainees/bulk* | /{id}/deactivate* | /{id}/reactivate*
  GET/POST* /my/staff ; POST /my/staff/me-official* (adds the logged-in
       centre_admin as an official, user_id set) ; POST /my/staff/{id}/deactivate*
  POST /my/staff/{id}/face-enrol*        {frames_b64:[1..5 JPEG data URLs], consent:true}
  DELETE /my/staff/{id}/face*
  POST /my/sessions/{id}/staff-scan*     {frames_b64 | image_b64}  (STAFF ONLY)
  POST /my/sessions/{id}/claim*          {present_trainee_ids[], edit_reason?}
  GET/PUT* /my/equipment ; POST /my/repair-declarations* ; GET /my/repair-declarations
  POST /my/requests* ; GET /my/requests
  GET  /my/flags ; POST /my/flags/{id}/respond*
  GET  /my/notices ; POST /my/notices/{id}/read* | /reply*
  GET  /my/calendar?from=&to= | /my/calendar/{date} | /my/calendar/{date}/snapshots
  Suspended/terminated centres: every write returns 403 CENTRE_INACTIVE.
 EDGE / DEMO (centre_admin, super_admin)
  GET /edge/videos ; POST /edge/demo/run* ; POST /edge/offline* ;
  POST /edge/sync-now* ; GET /edge/status
 STAFF FACE ERROR CODES (body also has "advice" text for the UI):
  422 NO_CONSENT NO_FACE MULTIPLE_FACES FACE_TOO_SMALL FACE_BLURRY NOT_ENROLLED
  FACE_MISMATCH FACE_BACKEND_CHANGED BAD_FILE LIVENESS_FAILED ; 403
  OUTSIDE_WINDOW NO_STAFF_RECORD ; 503 FACE_ENGINE_UNAVAILABLE.

 RESPONSE SHAPES (authoritative; UIs rely on these)
  LiveStatus = {camera_id, camera_name, centre_id, centre_code, centre_name,
    district, state("live"|"idle"|"offline"|"tampered"|"provisional"), ts, age_s,
    interval_s, session{id,label,start_ts,end_ts,actual_start_ts}|null,
    run_started_at|null, elapsed_s|null (only when state live), people,
    people_smooth, claimed|null, items{class:{present,in_use,idle,off}},
    labels{class:label}, quality{ok,reasons}, thumb_url? (centre only),
    spark[int], model_version}
  SessionRow = {id, centre_id, centre_code, centre_name, district, label, batch,
    trainer, kind, session_date, start_ts, end_ts, scheduled_s, status
    ("scheduled"|"running"|"closed"|"missed"|"cancelled"; running = active with
    a running run), cancel_reason?, actual_start_ts?, actual_end_ts?,
    monitored_s?, late_start_s?, early_end_s?, coverage_pct?, claimed?,
    observed?, delta?}
  RunRow = {id, camera_id, camera_name, started_at, ended_at|null, end_reason?,
    by, by_name?, frames_ok, frames_bad, duration_s}
  CalendarDay = {date, status("ok"|"attention"|"critical"|"no_data"|"holiday"|
    "upcoming"|"none"|"missed"|"partial"|"cancelled"), updates, snapshots,
    sessions, sessions_held, sessions_missed, sessions_cancelled, people_max,
    people_avg, claimed, observed, delta, flags{total,open,max_severity}|null,
    uptime_pct, monitored_min, scheduled_min, in_use_pct}
  DayDetail = {date, summary(CalendarDay), sessions[SessionRow-like + ci_low,
    ci_high, staff_verified, snapshots], runs[RunRow], timeline{interval_s,
    points[{t:"HH:MM:SS",people,items{class:{present,in_use}}}]}(<=240),
    equipment[{class,label,sanctioned,declared,present_avg,present_max,
    in_use_avg,in_use_pct,status}], flags[{id,type,severity,status,reason,
    created_at,evidence_urls[]}], evidence[{id,ts,kind,url}],
    camera_health[{ts,status,reason}], events[{ts,kind,text}]}
  SnapshotRow = {id, ts, camera_id, people, items, quality}
  FrameResponse = {accepted, state, reason?, people, people_smooth, items,
    boxes[{cls,x1,y1,x2,y2,conf}], session, run{id,started_at}, next_interval_s,
    reasons?}

VISION PIPELINE SPEC
------------------------------------------------------------------
 Detector: canonical names, per-class thresholds, aliases, model per template.
   The MODEL FLOOR is min(class thresholds); each detection is then filtered by
   ITS OWN class threshold (a single global conf must never override class
   thresholds). Aliases merge bench/dining table into "desk" when configured.
   Class-wise NMS 0.5. Cache models per (classes, tiling, model). COCO path
   when every class is COCO-supported and backend != "world", else YOLO-World.
 Quality gate, replay (C2 via dhash), cleanup, usage: as in section B/C.
 Person filters: inside ROI (bottom-centre point), box area >= min_box_area,
   presence rule per template, staff subtraction (verified staff of the session;
   if none verified subtract 1 and raise S1 once per session).
 Privacy: head blur = top 30 % of EVERY person box (no face detector). Thumbnails
   <= 60 KB, labelled boxes.
 Calibration: scripts/calibrate.py reads a CSV of labelled webcam frames
   (path,true_people,true_chair,true_desk,...) and sweeps each class threshold
   0.05..0.60 to maximise F1; prints suggested class_conf and min_box_area.
   Seeded defaults are starting values only.

FLAG TYPES
------------------------------------------------------------------
 A1 Attendance inflation  A2 Over capacity  A3 Enrolment mismatch  A4 Ghost
 session  A5 Unregistered attendees  E1 Equipment missing  E2 Equipment
 non-operational  E3 Declaration mismatch  S1 Trainer not verified  C1 Camera
 problem  C2 Replay suspicion  C3 Missed capture windows / claimed but camera
 did not run  D1 Data integrity  U1 Unverifiable count  P1 Capacity implausible
 M1 Session not held (scheduled session ended with no camera data, not
 cancelled; low; dedupe "<session_id>:M1").
 margin = max(count_tolerance, ceil(0.10 * claimed)). Severity by gap ratio
 (<15 low, <30 medium, <50 high, else critical), +1 level if the same type
 repeats >=3 times in 7 days. After any flag change: recompute_risk(centre).

INTEGRITY AND SYNC (as before)
------------------------------------------------------------------
 Claims, observations, flags -> ledger (SHA-256 chain + Ed25519) before sync.
 Snapshot batches ledgered as "snapshot_batch" digests. Offline snapshots go to
 the SQLite outbox and replay idempotently by snap_key. sessions.actual_* are
 derived from snapshots so they survive replay. monitor_runs are best-effort.

PRIVACY AND SECURITY CHECKLIST
------------------------------------------------------------------
 - Trainees: no face detection, no face recognition, no photo, no embedding.
   Counting is body-based only.
 - Staff: consent flag, encrypted embedding (Fernet), own-record 1:1 verify
   only, deleted on deactivate / "Remove face data".
 - Frames and face images are processed in memory and dropped; never logged.
 - Govt live view is data only. Evidence blurred with TTL (live 1 d, routine
   14 d, flag 90 d, reference 365 d).
 - Argon2, lockout, rate limits, rotating refresh, token_version, signed URLs
   (60 s), insert-only audit log.
 - Input validation: unknown enums rejected; strings capped; arrays <= 500;
   frame <= 1.5 MB / 1920 px; face frames <= 5 and <= 1 MB each; interval_s
   clamped 5..120.
 - HONEST LIMIT: in browser-agent mode the camera device is trusted; production
   uses an on-LAN agent with device certificates.

KEY CODE (copy as starting points)
------------------------------------------------------------------
 # FILE: app/services/vision/detector.py
 import numpy as np, torch
 from torchvision.ops import batched_nms
 from ultralytics import YOLO, YOLOWorld
 from app.core.config import settings
 COCO_TO_CANON = {"tv": "monitor", "dining table": "desk"}
 COCO_OK = {"person","chair","desk","monitor","laptop","keyboard","mouse","cell phone","bench","couch","book","bottle"}
 class Detector:
     def __init__(self, classes, class_conf=None, default_conf=0.35, tiling=False,
                  model=None, alias=None, imgsz=None, backend="auto"):
         self.classes = list(classes)
         self.alias = {**COCO_TO_CANON, **(alias or {})}
         self.conf_map = {c: float((class_conf or {}).get(c, default_conf)) for c in self.classes}
         self.floor = min(self.conf_map.values())
         self.tiling, self.imgsz = tiling, int(imgsz or settings.detector_imgsz)
         name = model or settings.detector_model
         coco_ok = all((c in COCO_OK) or (c in self.alias.values()) for c in self.classes)
         if backend == "coco" or (backend == "auto" and coco_ok):
             self.model = YOLO(f"{name}.pt"); self.version = name
         else:
             self.model = YOLOWorld("yolov8s-worldv2.pt"); self.model.set_classes(self.classes); self.version = "yolov8s-worldv2"
     def _predict(self, img, ox=0, oy=0):
         r = self.model.predict(img, conf=self.floor, imgsz=self.imgsz, verbose=False)[0]
         out = []
         for b in r.boxes:
             raw = r.names[int(b.cls)]; name = self.alias.get(raw, raw); conf = float(b.conf)
             if name not in self.conf_map or conf < self.conf_map[name]: continue
             x1, y1, x2, y2 = b.xyxy[0].tolist()
             out.append((x1 + ox, y1 + oy, x2 + ox, y2 + oy, conf, name))
         return out
     def detect(self, frame: np.ndarray):
         h, w = frame.shape[:2]; dets = self._predict(frame)
         if self.tiling:
             tw, th = int(w * 0.6), int(h * 0.6)
             for ox in (0, w - tw):
                 for oy in (0, h - th): dets += self._predict(frame[oy:oy + th, ox:ox + tw], ox, oy)
         if not dets: return []
         boxes = torch.tensor([d[:4] for d in dets]); scores = torch.tensor([d[4] for d in dets])
         ids = torch.tensor([self.classes.index(d[5]) for d in dets])
         return [dets[i] for i in batched_nms(boxes, scores, ids, 0.5).tolist()]

 # FILE: app/services/vision/privacy.py   (no face detector)
 import cv2
 PAL = [(79,70,229),(2,132,199),(217,119,6),(22,163,74),(124,58,237),(234,88,12)]
 def blurred_thumbnail(frame, person_boxes, labelled=(), width=640) -> bytes:
     out = frame.copy(); H, W = out.shape[:2]
     for x1, y1, x2, y2 in person_boxes:                       # head = top 30 % of each person box
         x1, y1, x2, y2 = max(0,int(x1)), max(0,int(y1)), min(W,int(x2)), min(H,int(y2))
         hy2 = y1 + max(8, int(0.30 * (y2 - y1))); roi = out[y1:hy2, x1:x2]
         if roi.size: k = max(9, ((x2 - x1) // 4) | 1); out[y1:hy2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)
     seen = {}
     for x1, y1, x2, y2, name in labelled:
         col = PAL[seen.setdefault(name, len(seen) % len(PAL))]
         cv2.rectangle(out, (int(x1),int(y1)), (int(x2),int(y2)), col, 2)
         cv2.putText(out, name, (int(x1), max(12,int(y1)-6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1)
     out = cv2.resize(out, (width, int(out.shape[0] * width / out.shape[1])))
     for q in (60, 50, 40, 30):
         ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, q])
         if len(buf) <= 60_000: break
     return buf.tobytes()

 # FILE: app/services/vision/usage.py
 import cv2
 SCREEN = {"monitor", "laptop"}
 def _near(item, p, pad=0.15):
     pw, ph = p[2]-p[0], p[3]-p[1]
     x1, y1, x2, y2 = p[0]-pad*pw, p[1]-pad*ph, p[2]+pad*pw, p[3]+pad*ph
     return min(x2, item[2]) > max(x1, item[0]) and min(y2, item[3]) > max(y1, item[1])
 def screen_on(frame, box) -> bool:
     x1, y1, x2, y2 = [max(0, int(v)) for v in box[:4]]; r = frame[y1:y2, x1:x2]
     if r.size == 0: return False
     g = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY); return bool(g.mean() > 70 or g.std() > 35)
 def item_usage(frame, items, people, rules: dict) -> dict:
     out = {}
     for it in items:
         c = it[5]; s = out.setdefault(c, {"present": 0, "in_use": 0, "idle": 0, "off": 0}); s["present"] += 1
         mode = rules.get(c, "none")
         if mode == "none": continue
         if mode == "screen_on" and c in SCREEN and not screen_on(frame, it): s["off"] += 1
         elif any(_near(it, p) for p in people): s["in_use"] += 1
         else: s["idle"] += 1
     return out

 # FILE: app/services/face.py   (STAFF ONLY: enrol + 1:1 scan. Never imported by live.py/pipeline.py)
 import base64, os, threading, cv2, numpy as np
 from cryptography.fernet import Fernet
 from app.core.config import settings
 _fernet = Fernet(settings.fernet_key.encode())
 _lock, _engine, _err = threading.Lock(), None, None
 class FaceError(Exception):
     def __init__(self, code, msg, advice="", status=422): self.code, self.msg, self.advice, self.status = code, msg, advice, status
 class OpenCVEngine:
     name = "opencv"; threshold = 0.363
     def __init__(self):
         d = os.path.join(settings.models_dir, "face_detection_yunet_2023mar.onnx")
         r = os.path.join(settings.models_dir, "face_recognition_sface_2021dec.onnx")
         if not (os.path.exists(d) and os.path.exists(r)): raise RuntimeError("Face models missing. Run: python -m scripts.download_models")
         self.det = cv2.FaceDetectorYN.create(d, "", (320, 320), 0.7, 0.3, 5000); self.rec = cv2.FaceRecognizerSF.create(r, "")
     def faces(self, img):
         h, w = img.shape[:2]; self.det.setInputSize((w, h)); _, f = self.det.detect(img)
         return [] if f is None else [(r[0], r[1], r[0]+r[2], r[1]+r[3], float(r[14]), r) for r in f]
     def embed(self, img, face): return self.rec.feature(self.rec.alignCrop(img, face[5])).flatten().astype(np.float32)
 class InsightEngine:
     name = "insightface"; threshold = 0.45
     def __init__(self):
         from insightface.app import FaceAnalysis
         self.app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"]); self.app.prepare(ctx_id=-1, det_size=(640, 640))
     def faces(self, img): return [(*f.bbox.tolist(), float(f.det_score), f) for f in self.app.get(img)]
     def embed(self, img, face): return face[5].normed_embedding.astype(np.float32)
 def engine():
     global _engine, _err
     if _engine: return _engine
     with _lock:
         if _engine: return _engine
         order = {"opencv": [OpenCVEngine], "insightface": [InsightEngine]}.get(settings.face_backend, [OpenCVEngine, InsightEngine])
         for cls in order:
             try: _engine = cls(); _err = None; return _engine
             except Exception as e: _err = f"{cls.__name__}: {e}"
     raise FaceError("FACE_ENGINE_UNAVAILABLE", "Face engine is not available", _err or "", 503)
 def health():
     try: e = engine(); return {"ready": True, "backend": e.name, "error": None}
     except FaceError: return {"ready": False, "backend": None, "error": _err}
 def decode(b64: str):
     try: img = cv2.imdecode(np.frombuffer(base64.b64decode(b64.split(",")[-1]), np.uint8), cv2.IMREAD_COLOR)
     except Exception: img = None
     if img is None: raise FaceError("BAD_FILE", "Unreadable image", "Try again.")
     if max(img.shape[:2]) > 1280: s = 1280 / max(img.shape[:2]); img = cv2.resize(img, None, fx=s, fy=s)
     return img
 def _single(img):
     e = engine(); fs = [f for f in e.faces(img) if f[4] >= 0.7]
     if not fs: raise FaceError("NO_FACE", "No face found", "Face the camera in good light.")
     if len(fs) > 1: raise FaceError("MULTIPLE_FACES", "More than one face", "Only one person in the picture.")
     f = fs[0]
     if (f[2] - f[0]) < 0.12 * img.shape[1]: raise FaceError("FACE_TOO_SMALL", "Face too small", "Move closer to the camera.")
     x1, y1, x2, y2 = [max(0, int(v)) for v in f[:4]]
     if cv2.Laplacian(cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 30:
         raise FaceError("FACE_BLURRY", "Picture is blurry", "Hold still and clean the lens.")
     return e.embed(img, f), f
 def _unit(v): return v / (np.linalg.norm(v) + 1e-9)
 def enrol_embedding(frames_b64):
     embs = [_unit(_single(decode(b))[0]) for b in frames_b64[:5]]
     return _unit(np.mean(embs, axis=0)), engine().name
 def encrypt(e): return _fernet.encrypt(e.astype(np.float32).tobytes())
 def decrypt(b): return np.frombuffer(_fernet.decrypt(bytes(b)), dtype=np.float32)
 def verify(frames_b64, stored_doc):      # stored_doc = staff_faces document
     e = engine()
     if stored_doc.get("backend") != e.name: raise FaceError("FACE_BACKEND_CHANGED", "Enrolment is outdated", "Please enrol your face again.")
     ref = _unit(decrypt(stored_doc["embedding_enc"])); scores, centres = [], []
     for b in frames_b64[:5]:
         img = decode(b); emb, f = _single(img); scores.append(float(np.dot(_unit(emb), ref)))
         centres.append(((f[0] + f[2]) / 2 / img.shape[1], (f[1] + f[3]) / 2 / img.shape[0]))
     thr = settings.face_threshold if settings.face_threshold else e.threshold
     if settings.face_liveness and len(centres) >= 3:
         move = max(abs(centres[i][0]-centres[0][0]) + abs(centres[i][1]-centres[0][1]) for i in range(1, len(centres)))
         if move < 0.01: raise FaceError("LIVENESS_FAILED", "No movement detected", "Turn your head slightly while scanning.")
     best = max(scores); return best >= thr, best
 # Route rules: enrol only if staff.face_consent is true; staff.user_id must equal the caller's user id (else 403
 # NO_STAFF_RECORD); scan only inside [session.start-15 min, session.end] (403 OUTSIDE_WINDOW); verify only against
 # the CALLER'S OWN staff_faces doc; count attempts per session+staff; after 3 failures write staff_attendance
 # {verified:false, attempts:3}; success writes verified:true. Deactivate staff -> delete staff_faces doc.

 # FILE: app/services/monitor.py
 from datetime import datetime, timezone, timedelta
 from app.core.config import settings
 from app.db.mongo import db
 def ensure_run(cam, sess, user_id=None, by="user"):
     run = db.monitor_runs.find_one({"camera_id": cam["_id"], "status": "running"})
     if run: return run
     now = datetime.now(timezone.utc)
     doc = {"centre_id": cam["centre_id"], "camera_id": cam["_id"], "session_id": sess["_id"] if sess else None,
            "started_by": user_id, "by": by, "status": "running", "started_at": now, "last_frame_at": now,
            "frames_sent": 0, "frames_ok": 0, "frames_bad": 0}
     doc["_id"] = db.monitor_runs.insert_one(doc).inserted_id; return doc
 def touch_run(run_id, ok: bool, session_id=None):
     db.monitor_runs.update_one({"_id": run_id}, {"$set": {"last_frame_at": datetime.now(timezone.utc),
         **({"session_id": session_id} if session_id else {})}, "$inc": {"frames_sent": 1, "frames_ok" if ok else "frames_bad": 1}})
 def end_run(run, reason, ended_at=None):
     end = ended_at or datetime.now(timezone.utc)
     db.monitor_runs.update_one({"_id": run["_id"], "status": "running"}, {"$set": {"status": "ended", "ended_at": end,
         "end_reason": reason, "duration_s": int((end - run["started_at"]).total_seconds())}})
 def run_watchdog():
     now = datetime.now(timezone.utc)
     for run in db.monitor_runs.find({"status": "running"}):
         cam = db.cameras.find_one({"_id": run["camera_id"]}, {"live": 1}) or {}
         iv = int((cam.get("live") or {}).get("interval_s", settings.live_default_interval_s))
         if (now - run["last_frame_at"]).total_seconds() > settings.run_timeout_intervals * iv: end_run(run, "timeout", run["last_frame_at"])
 def session_timing(sess, interval_s):
     ts = [s["ts"] for s in db.snapshots.find({"session_id": sess["_id"]}, {"ts": 1}).sort("ts", 1)]
     if not ts: return {}
     mon = interval_s + sum(min((b - a).total_seconds(), 3 * interval_s) if (b - a).total_seconds() <= 3 * interval_s else 0
                            for a, b in zip(ts, ts[1:]))
     dur = max(1, (sess["end_ts"] - sess["start_ts"]).total_seconds())
     return {"actual_start_ts": ts[0], "actual_end_ts": ts[-1], "monitored_s": int(mon),
             "late_start_s": max(0, int((ts[0] - sess["start_ts"]).total_seconds())),
             "early_end_s": max(0, int((sess["end_ts"] - ts[-1]).total_seconds())), "coverage_pct": min(100, round(100 * mon / dur))}

 # FILE: app/services/live.py   (COUNTING ONLY; changes vs v3: no faces, runs, per-class thresholds)
 # _process(cam, frame, user_id=None, by="user"):
 #   centre/tpl/sess resolved as in v3 (session: status in scheduled|active and start_ts <= now <= end_ts)
 #   run = monitor.ensure_run(cam, sess, user_id, by)
 #   q = quality_gate(...); if not ok: monitor.touch_run(run["_id"], False); live_status "tampered"; C1 after 3 bad
 #   det = _detector(tpl, live.tiling)  # Detector(tpl["detector_classes"], tpl.get("class_conf"), tpl["min_confidence"],
 #                                      #   live.tiling, tpl.get("detector_model"), tpl.get("class_alias"), tpl.get("imgsz"),
 #                                      #   tpl.get("detector_backend", "auto"))
 #   dets = det.detect(frame); drop person boxes smaller than tpl.min_box_area * frame area
 #   c = cleanup(dets, frame.shape, roi, zones, tpl["presence_rule"], staff_to_subtract)
 #   items = item_usage(frame, c["equipment"], c["all_people"], rules); people = c["people_count"]
 #   thumb = blurred_thumbnail(frame, [p[:4] for p in c["all_people"]],
 #           [(*b[:4], b[5]) for b in c["equipment"]] + [(*p[:4], "person") for p in c["counted_boxes_full"]])
 #   monitor.touch_run(run["_id"], True, sess["_id"] if sess else None)
 #   _record(...) as in v3 but ALSO: db.sessions.update_one({"_id": sess["_id"]}, {"$min": {"actual_start_ts": now},
 #           "$max": {"actual_end_ts": now}, "$inc": {"done_captures": 1}, "$set": {"status": "active"}})
 #   consolidation (every N snapshots and at close) also writes monitor.session_timing(sess, interval) to the session
 #   response includes run{id,started_at}; NO "faces" anywhere.

 # FILE: app/routers/live.py (additions)
 # POST /my/cameras/{id}/monitor/start: cam scoped to user's centre; 403 CENTRE_INACTIVE if suspended; set
 #   cameras.live.enabled = true; run = ensure_run(cam, active_session_or_None, user_id); return ser(run)
 # POST /my/cameras/{id}/monitor/stop: find running run -> end_run(run, "manual"); sessions timing recompute for the
 #   active session; return {run, session_timing}
 # GET /my/live/diagnostics: composes api_ok, camera, last_frame_at (live_status.ts), last_state/reasons, frames_today
 #   (daily_summaries.snapshots for IST today), session, run, detector_ready (live._det non-empty), advice[] such as:
 #   "No session is active. Start a demo session." | "Camera setup is not approved yet: frames are shown but not
 #   recorded." | "Frames are arriving but the picture is too dark." | "No frames received in the last N seconds."

 # FILE: app/services/scheduler.py (session_status_tick core)
 # now = utcnow
 # for s in db.sessions.find({"status": "scheduled", "start_ts": {"$lte": now}, "end_ts": {"$gt": now}}):
 #     db.sessions.update_one({"_id": s["_id"]}, {"$set": {"status": "active", "planned_captures": max(1, s_duration // interval)}})
 # for s in db.sessions.find({"status": {"$in": ["scheduled", "active"]}, "end_ts": {"$lte": now}}):
 #     has = db.snapshots.count_documents({"session_id": s["_id"]}, limit=1)
 #     if has:  for each camera with snapshots: consolidate_session(s["_id"], cam, tpl, final=True)
 #              db.sessions.update_one({"_id": s["_id"]}, {"$set": {"status": "closed", **monitor.session_timing(s, interval)}})
 #              end running runs of the session with reason "session_end"
 #     else:    db.sessions.update_one({"_id": s["_id"]}, {"$set": {"status": "missed"}});
 #              claim = db.attendance_claims.find_one({"session_id": s["_id"]})
 #              if claim: raise_flag(centre, s, None, "C3", "high", "Attendance claimed but the camera did not run", f"{s['_id']}:C3")
 #              elif centre.status == "live": raise_flag(centre, s, None, "M1", "low", "Scheduled session was not held", f"{s['_id']}:M1")

 # FILE: app/routers/sessions.py (rules to implement exactly)
 # POST /my/sessions: parse date + times as IST, convert to UTC; checks listed in section F; label default "Extra session";
 #   audit_log(user, "session.create", ...). PUT: only scheduled and start_ts > now + 5 min; re-check overlap; audit.
 #   cancel: requires reason (422 if empty); status cancelled; audit. Batch edit: delete future scheduled sessions of the batch
 #   with done_captures == 0, then dbfuncs.generate_sessions(...). Govt GET /sessions maps stored status + running run to
 #   SessionRow.status ("running" when active and a monitor_run is running).

 # FILE: app/services/calendar.py (status precedence implemented from the grouped counts)
 # per date: n, held (closed or active-with-snapshots), missed, cancelled, scheduled_future from sessions grouped by
 #   {session_date, status}; compute
 #   status = holiday if date in holidays else cancelled if n > 0 and cancelled == n else
 #            upcoming if date > today or (date == today and only status scheduled) else
 #            none if n == 0 and no summary else
 #            missed if missed > 0 and held == 0 else partial if missed > 0 and held > 0 else
 #            no_data if held and snapshots == 0 else
 #            critical if flag severity >= high else attention if open flags else ok
 #   plus monitored_min = sum(sessions.monitored_s)/60, scheduled_min = sum(duration)/60 (excluding cancelled),
 #   uptime_pct = round(100 * monitored_min / scheduled_min)

 # FILE: scripts/webcam_test.py   (sanity check before any portal work)
 # python -m scripts.webcam_test --source 0 --model yolo11s
 # Opens cv2.VideoCapture(source, CAP_DSHOW), runs Detector with the demo template classes, draws boxes + counts of
 # person/chair/desk/monitor, prints FPS, press q to quit. If this works, the model side is fine; any later failure is
 # in the portals, auth, session or network layer.

DELTAS TO init_db.py AND OLDER BLOCKS (apply these)
------------------------------------------------------------------
 - validators: flags.type enum adds "M1"; sessions.status enum adds "cancelled", kind enum "scheduled|oneoff|adhoc".
 - indexes: monitor_runs (camera_id, status), (centre_id, started_at desc);
   sessions: partial unique (batch_id, session_date) with {batch_id: {$type:"objectId"}}, (centre_id, start_ts, end_ts),
   (status, end_ts); snapshots TTL on ts (14 d); evidence_blobs TTL on expire_at; live_status (centre_id);
   plus all v3 indexes. New plain collection: monitor_runs.
 - snapshots no longer carry "faces"; remove any face_boxes usage from live.py, pipeline.py, privacy.py and cleanup.py.
 - seed templates: Webcam Demo Room (person, chair, desk, monitor, laptop, keyboard, mouse, cell phone, book;
   presence_rule any; detector_model yolo11s; class_conf {person:0.30, chair:0.20, desk:0.15, monitor:0.30, laptop:0.30};
   class_alias {"bench":"desk"}; min_box_area 0.015). Computer Lab: "tv" renamed "monitor". Sewing: detector_backend world.
 - Remove the old rule "new batch after approval needs a change request" (batches are free; changes are audit-logged and
   visible to govt). Camera change requests stay.
 - batches: no schema change. generate_sessions never touches cancelled or already-active/closed sessions.

BUILD ORDER FOR THE BACKEND
------------------------------------------------------------------
 1 config, mongo.py, security.py, deps.py, audit.py, init_db.py, auth, /me, MFA
 2 schemes/templates, public applications (+documents), approve (atomic), direct create, credentials, users
 3 scripts/webcam_test.py + vision services standalone (detector, quality, cleanup, usage, privacy)
 4 centres, cameras (+reference frame, kinds, live settings), batches (+generate_sessions), holidays, one-off sessions
 5 live.py frame endpoint + live_status + monitor runs + diagnostics + demo session
 6 snapshots/timeline/summary writes + consolidation + flag upserts + session_status_tick + calendar service/routes
 7 trainees (take_seat), staff (+me-official), face.py (staff enrol/scan), attendance claims
 8 ledger + sync + files router
 9 gov /live, /sessions, /centres/{id}/schedule|runs|calendar
10 flags actions, notices ladder, requests decide, reports, accuracy, audit-log, edge demo
11 eval script + calibrate.py + results.json

TEST CHECKLIST (must pass before demo)
------------------------------------------------------------------
 (All v2/v3 tests remain.) NEW or CHANGED:
 - scripts/webcam_test.py shows boxes and counts from a PC webcam.
 - The live pipeline never imports face.py; with the face models deleted live
   counting still works and /edge/health shows face.ready=false.
 - Thumbnails: head regions (top 30 %) of person boxes are blurred; no face detector is used.
 - Per-class thresholds are honoured: a chair at conf 0.12 is kept when
   class_conf.chair=0.10 even if the template default is 0.35.
 - Monitor start creates one run; a second start returns the same run; stop ends it with reason manual and duration;
   killing the tab ends it by timeout within 3 intervals; session end closes it with reason session_end.
 - Session gets actual_start_ts, actual_end_ts, monitored_s, late_start_s, coverage_pct from snapshots.
 - One-off session: past date -> 422 BAD_TIME; overlapping -> 409 SESSION_OVERLAP; edit/cancel after start -> 409;
   cancel without reason -> 422.
 - A scheduled session with no camera data becomes "missed" once and raises M1 once; with a claim it raises C3 instead;
   a cancelled session raises nothing.
 - Calendar: a month with held, missed, cancelled and holiday days returns statuses held=ok/attention, missed, cancelled,
   holiday correctly; a day with one held and one missed session is "partial".
 - Govt GET /live and /centres/{id}/live contain no thumb_url (with GOV_LIVE_THUMBS=false); GET /my/live does.
 - Govt GET /sessions?date=today lists every centre's sessions with status and actual start/end.
 - Staff face: enrol without consent 422 NO_CONSENT; two faces -> MULTIPLE_FACES; verify uses only the caller's own
   embedding; wrong user_id link -> 403 NO_STAFF_RECORD; changed backend -> FACE_BACKEND_CHANGED; 3 failed scans ->
   staff_attendance verified=false and S1 on close.
 - Trainees: no endpoint accepts or returns any face/photo/embedding data for trainees.
 - Browser frame POST from centre A to centre B camera -> 404; TOO_FAST 429; oversize 422; BUSY under load.
 - Atlas down: snapshots queue in SQLite and sync once; sessions timing correct after replay.
 - Mongo shell: TTL indexes on evidence_blobs.expire_at, snapshots.ts, refresh_tokens, camera_health_events,
   frame_fingerprints. 