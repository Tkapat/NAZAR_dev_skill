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


CENTRE PORTAL FIX PACK (dev_skill_center). Implement exactly. Keep the existing theme.

1. Add camera dialog: first field "Source type" (segmented control), default
   "This computer's webcam" -> source_uri "browser" (no URL field). Other options: "Network camera (RTSP)"
   (URL field), "Sample video (demo)" (select from GET /edge/videos), "Webcam on the server" -> "webcam:0".
   Show 409 CAMERA_EXISTS as a field error. Cameras list shows a kind chip and setup status; never hide cameras.

2. LIVE MONITOR page = ONE guided flow (replace the "Start camera + toggle" design):
   a) Camera: list ALL cameras of kind browser. If none, auto-create one named "This computer" on first visit
      (POST /my/cameras) and select it. The dropdown never says "No cameras" without a button that fixes it.
   b) Session: show the active session (label, time left). If none: a prominent button "Start a 60-minute
      demo session" (POST /my/live/demo-session; reuse the returned session). Also link "Plan a session".
   c) Start streaming: ONE primary button (not a silent toggle). It is disabled ONLY with a visible reason
      line listing what is missing ("Needs: a session"). On click run in order: PUT /my/cameras/{id}/live
      {enabled:true, interval_s}, POST .../monitor/start, getUserMedia, start the Worker timer, send the first
      frame immediately. Show "Warming up the counter..." until the first accepted response (can take 30 s).
   d) Running: local <video> with a <canvas> overlay drawing boxes+labels from FrameResponse.boxes; the
      monitoring clock card (since, ticking elapsed, updates sent); Stop button -> POST .../monitor/stop and a
      summary dialog.
   e) Every failed frame shows its reason in a small status line (HTTP status + code, e.g. "503
      DETECTOR_UNAVAILABLE", "429 TOO_FAST", "Network error"). Never leave "Waiting for the first frame..."
      with no explanation: after 20 s show the Diagnostics panel open by default.
   f) Interval selector 5 s | 10 s | 30 s (default 10 s; 5 s recommended for demos).
   g) Demo claim (only when the active session kind is "adhoc"): number input "Pretend the register says N
      trainees were present" + button "Set claim" -> POST /my/live/demo-claim {session_id, claimed}.
   Frame upload uses apiUpload with a 40 s timeout for the first frame, 15 s afterwards.

3. COMPLIANCE BOARD component (new; used on Live Monitor and Dashboard). Data: GET /my/compliance (poll 5 s on
   Live Monitor, 15 s on Dashboard). Layout (card):
   - Header: "Compliance now" + summary.headline + level chip (Waiting | All matched | Worth a look | Needs your
     response; icon + text) + "as of 4 s ago".
   - PEOPLE row: three big numbers: Enrolled | Claimed present | Camera counted (range), each with a label; a
     verdict chip (people.verdict) and people.text underneath. Claimed shows "Not submitted yet" when null.
   - EQUIPMENT table: Item | Sanctioned | Declared | Seen | In use | Verdict chip; usage Meter for in_use_pct.
     Rows with off > 0 show "x switched off". Supportive wording in the Centre app (e.g. verdict "missing" ->
     "Fewer items seen than sanctioned").
   - FLAGS list: flags[] (type name, severity chip, reason). Empty -> "No differences found yet."
   Numbers use CountUp; changed verdict chips flash; no re-entrance on polling.

4. Dashboard: add the Compliance Board for the active/latest session of today.

5. Do not mention faces anywhere in Live Monitor, Calendar or Trainees. Face features remain only in staff
   enrolment and the staff attendance scan.

Acceptance: from a fresh centre, one laptop can: open Live Monitor -> camera auto-created -> click
"Start a 60-minute demo session" -> click Start streaming -> see boxes on the preview and People / Chairs /
Desks / Monitors numbers within 30 s -> set a claim of 12 -> within ~60 s the board shows people verdict
"Inflated" and an A1 flag. Failures always show a reason line.