COMPLIANCE CONTRACT: the core feature of the project
Purpose: for one session show what the centre ENROLLED, CLAIMED and what the camera COUNTED;
and per equipment class what is SANCTIONED, DECLARED, SEEN and IN USE. Verdicts + flags.

GET /my/compliance?session_id=              (centre_admin, trainer; own centre)
GET /centres/{id}/compliance?session_id=    (govt roles, read-only)
 Default session: the active session; else the most recent session today; else null.
 Response (authoritative names):
 { session: SessionRow|null, as_of: dt, snapshots: int, window: int,
   people: { enrolled: int, sanctioned_max: int, claimed: int|null, counted: int|null,
             ci_low: int|null, ci_high: int|null, state: "ok"|"uncertain"|"no_data",
             delta: int|null (claimed - counted), margin: int|null,
             verdict: "waiting"|"match"|"inflated"|"over_capacity"|"unclaimed"|
                      "unverifiable"|"ghost"|"unregistered",
             text: string },
   equipment: [ { class, label, sanctioned, declared, seen: int|null, seen_max: int|null,
                  in_use: int|null, idle: int|null, off: int|null, in_use_pct: int|null,
                  verdict: "waiting"|"ok"|"missing"|"declaration_mismatch"|"non_operational",
                  text: string } ],
   flags: [ { id, type, severity, status, reason, created_at } ]   // flags of this session
   summary: { level: "waiting"|"ok"|"attention"|"critical", headline: string } }

 Computation (server): window = last min(max_frames, snapshots) snapshots of the session across
 cameras. waiting when snapshots < 3. counted = consolidate() observed (summed over cameras);
 seen / in_use / idle / off = MEDIAN over the window per class. Verdicts come from the SAME
 flag_engine.evaluate() context that raises real flags: A1 inflated, A2 over_capacity, A4 ghost,
 A5 unregistered, U1 unverifiable, no claim -> unclaimed, E1 missing, E3 declaration_mismatch,
 E2 non_operational; otherwise match / ok. text is neutral, generated server-side, e.g.
 "Claimed 12, camera counted 1 (range 1-1). 11 fewer than claimed." Frontends show text as given.
 enrolled = active trainees of the centre. This endpoint never depends on consolidation timing:
 it is computed on request (cheap: one query on snapshots + one on the claim).
 summary.level: critical if any high/critical verdict, attention if any other non-ok verdict,
 waiting if people.verdict == waiting, else ok.

BACKEND FIX PACK (dev_skill_backend). Implement exactly. Do not remove other features.

1. RECORD_PROVISIONAL (new env, default true for the demo)
   When true, cameras with setup_status != approved are treated as approved FOR RECORDING:
   snapshots, timelines, summaries, session timing, consolidation and flags all work. live_status.state
   stays "provisional" and gets data_official=false; flags created from such cameras get
   details.provisional=true. When false the old rule applies (live_status only).
   M1/C3 are raised for any centre that has at least one camera when RECORD_PROVISIONAL=true,
   otherwise only for live centres.

2. Cameras
   - POST /my/cameras accepts source_uri "browser", "webcam:N", "rtsp://...", "file:<name>"; sets
     source_kind; returns the full document incl. id and source_kind.
   - Unique per centre on lower(name): 409 CAMERA_EXISTS "A camera with this name already exists".
     Add a unique index (centre_id, name_lower). Write scripts/repair_cameras.py that merges or renames
     existing duplicates (suffix " (2)").
   - GET /my/cameras returns ALL kinds (never filter by kind) and includes source_kind, setup_status,
     live, status, last_seen.

3. Session lifecycle (fix)
   - session_status_tick: a session whose end_ts passed becomes "closed" ONLY if it has snapshots;
     otherwise "missed". Never "closed" without data.
   - Overlap check applies to scheduled, one-off AND demo sessions: 409 SESSION_OVERLAP.
   - POST /my/live/demo-session: if an active session exists return it (200, {session, reused:true})
     instead of an error; if the requested window overlaps a future session shorten to fit or 409.
   - scripts/repair_sessions.py: for sessions with status closed/active, end_ts passed and zero snapshots
     set status "missed"; for overlapping demo sessions keep the first and set the others "cancelled"
     with cancel_reason "Duplicate demo session". Print what it changed.

4. Faster flags in demo
   - env CONSOLIDATE_EVERY_SNAPSHOTS default 5; the first consolidation also runs when snapshots reach
     base_frames. Seed base_frames = 5 for the Webcam Demo Room template.
   - consolidate_session raises/updates flags as soon as frames >= base_frames and (a claim exists or
     equipment data exists). Flags upsert by dedupe_key. U1, C3, M1 stay final-only.

5. Compliance endpoints: implement the COMPLIANCE CONTRACT (block F0). Reuse flag_engine.evaluate and
   consolidate() so the preview and the real flags never disagree. Govt route returns no images.

6. Demo claim (so one laptop can show a mismatch)
   - POST /my/live/demo-claim {session_id, claimed:int 0..500}: allowed ONLY for sessions of kind "adhoc"
     of the caller's centre; upserts attendance_claims {session_id, claimed_count, present_trainee_ids: [],
     marked_by, source:"demo"}; audit-logged; then immediately runs consolidate_session for the session's
     cameras (so the flag appears within seconds). Other kinds: 403 DEMO_ONLY.

7. Frame endpoint robustness
   - Log ONE line per frame with logger "devskill.live": camera id, state, people, latency_ms (never log
     image data).
   - If the detector cannot load or crashes: write live_status {state:"error", error:"<message>"} and return
     503 {code:"DETECTOR_UNAVAILABLE", detail:<reason>}. Never return a bare 500.
   - live_status is written BEFORE heavy recording work so Gov sees the camera even if recording fails.
   - First request warm-up: load the detector lazily with a lock; the first frame may take up to 30 s.

8. Govt reads
   - GET /live and GET /centres/{id}/live include provisional cameras WITH numbers when RECORD_PROVISIONAL
     is true (state "provisional", data_official false), still no thumb_url.
   - GET /live rows add compliance_summary {level, headline} (from the same logic, cheap version using
     the latest consolidated observation when present).

9. Diagnostics: GET /my/live/diagnostics advice[] adds: "No camera of kind browser exists", "Camera setup
   not approved (recording is {on|off} in this mode)", "No session is active. Start a demo session.",
   "Detector error: <text>", "No frames in the last N seconds".

Tests: demo session + claim 12 + camera sees 1 person -> within ~60 s at interval 5 s an A1 flag exists and
/my/compliance shows people.verdict "inflated"; session with no frames ends "missed" (never "held");
duplicate camera name -> 409; GET /my/cameras lists browser, rtsp and file cameras; overlapping demo
sessions rejected.