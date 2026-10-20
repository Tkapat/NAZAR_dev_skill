==================================================================
 dev_skill_center: CENTRE PORTAL, PAGE PLAN   (v4)
 MongoDB + GSAP + LIVE ROOM (start/stop times) + SCHEDULES + STAFF-ONLY FACES + CALENDAR
 Give with UI/UX 6C (+ the v4 additions block), 6B and the Frontend Patch (M5).
 Accent --primary #0E7C6B. Tone: supportive.
==================================================================

RULES FOR THE AI BUILDER (read first)
------------------------------------------------------------------
 1. Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
    Libraries: @tanstack/react-query, react-hook-form + zod, gsap + @gsap/react,
    recharts, react-leaflet, lucide-react, sonner, next-themes. DO NOT install
    framer-motion, @supabase/*, qrcode.react. Animation = GSAP helpers only
    (6B + 6C section 9). Fonts = next/font/google only (6C). No Next middleware.
 2. AUTH IS THE BACKEND (JWT): POST /auth/login, /auth/refresh, /auth/logout, GET /me,
    POST /me/change-password. Use lib/auth.ts and lib/api.ts as in the Frontend Patch
    PLUS: (a) apiUpload(path, formData, timeoutMs?) = api() without a Content-Type
    header (the browser sets the multipart boundary), same Bearer, ngrok header, silent
    refresh and error mapping, default timeout 15 s (40 s for the FIRST frame after
    page load because the counter model warms up); (b) errors expose
    {status, code, message, advice?} where advice comes from detail.advice.
    Env: NEXT_PUBLIC_API_URL ONLY.
 3. LOGIN ID: the user types a Centre ID (DSK-WB-0001) or Trainer ID (DSK-WB-0001-T01).
    Send AS IS (trimmed) as login_id. No email conversion.
 4. Error shape {detail:{detail,code,advice?}}. Map codes in lib/strings.ts:
    INVALID_CREDENTIALS, ACCOUNT_LOCKED, WEAK_PASSWORD, SAME_PASSWORD,
    ENROLMENT_CAP_REACHED, CLAIM_LOCKED, WRONG_CENTRE, FORBIDDEN, CENTRE_INACTIVE,
    LINK_EXPIRED, BAD_FILE, FILE_TOO_LARGE, LOGIN_EXISTS, BAD_STATE, NOT_FOUND,
    TOO_FAST, BUSY, SESSION_OVERLAP, BAD_TIME, SESSION_ACTIVE, NO_CONSENT, NO_FACE,
    MULTIPLE_FACES, FACE_TOO_SMALL, FACE_BLURRY, NOT_ENROLLED, FACE_MISMATCH,
    FACE_BACKEND_CHANGED, LIVENESS_FAILED, OUTSIDE_WINDOW, NO_STAFF_RECORD,
    FACE_ENGINE_UNAVAILABLE. Always prefer the server's advice text under the message.
 5. Allowed roles: centre_admin, trainer. Otherwise logout() and show "This account
    belongs to the Government portal."
 6. Every page: loading skeleton (mirrors layout), empty state, error state with Retry.
 7. IMAGES: relative signed URLs only through SignedImage/useSignedImage.
 8. Dates in IST. Date-only values arrive as "YYYY-MM-DD", times as "HH:MM"/"HH:MM:SS":
    never convert them with new Date() timezone shifts. Durations via fmtDuration(s).
 9. Polling: dashboard, flags, notices, sessions today 15 s. Live room panel is driven by
    frame responses (no extra polling). Calendar month 60 s; today's day sheet 30 s. No
    websockets. Polling must not replay entrance animations (6B R5).
10. IDs are strings under "id". Lists use ?limit=25&cursor=<id>.
11. FACES EXIST ONLY FOR STAFF (trainers and officials of the centre). Trainees are never
    detected, scanned, recognised or photographed in any screen. The Live room, Calendar,
    Trainees and Attendance roster never mention faces. Faces appear only on
    /staff/[id]/face-enrol and /attendance step 1.
12. getUserMedia works on HTTPS or localhost only. Always show a permission-denied
    fallback. Stop all tracks and clear canvases on stop and unmount. Never keep face
    images or camera frames in state, storage or the React Query cache; frames exist only
    as transient Blobs/data URLs dropped right after the request.
13. Respect centre status: pending_setup / awaiting_camera_approval show the onboarding
    banner; suspended or terminated show a full-page notice and every write action
    (including starting the Live room and creating sessions) is disabled.
14. Role views:
      trainer      : Today (dashboard), Attendance, Live room, Calendar, Flags (read),
                     Notices (read), Settings
      centre_admin : everything below
    Disallowed routes redirect to /dashboard.
15. Do not add pages or features not listed.

NAVIGATION
------------------------------------------------------------------
 Desktop pill nav (centre_admin): Home, Attendance, Monitor (dropdown: Live room, Calendar),
 People (dropdown: Trainees, Staff), Setup (dropdown: Cameras, Schedule, Equipment),
 Requests, Flags, Notices; "More": Onboarding (until live), Demo Lab, Settings.
 Trainer: Today, Attendance, Live room, Calendar, Flags, Notices.
 Mobile dock (5): centre_admin: Home, Attendance, Monitor (bottom sheet: Live room +
 Calendar), People, More (Flags, Setup items, Requests, Notices, Demo Lab, Settings).
 Trainer: Today, Attendance, Calendar, Flags, More (Live room, Notices, Settings).
 Bell badge = open flags + unread notices.

DATA SHAPES (use these names exactly)
------------------------------------------------------------------
 LiveStatus = { camera_id, camera_name, state:"live"|"idle"|"offline"|"tampered"|
   "provisional", ts, age_s, interval_s, session:{id,label,start_ts,end_ts,
   actual_start_ts}|null, run_started_at|null, elapsed_s|null, people, people_smooth,
   claimed|null, items:{class:{present,in_use,idle,off}}, labels:{class:label},
   quality:{ok,reasons[]}, thumb_url, spark:number[] }   (GET /my/live)
 FrameResponse (POST /my/cameras/{id}/frame) = { accepted, state, reason?, people,
   people_smooth, items, boxes:[{cls,x1,y1,x2,y2,conf}] (0..1), session,
   run:{id,started_at}, next_interval_s, reasons? }
 RunRow = { id, camera_id, camera_name, started_at, ended_at|null, end_reason?:"manual"|
   "timeout"|"session_end"|"error"|"system", by, by_name?, frames_ok, frames_bad,
   duration_s }
 POST /my/cameras/{id}/monitor/start -> { id, started_at, ... } ;
 POST /my/cameras/{id}/monitor/stop {reason?} -> { run: RunRow, session_timing:{
   actual_start_ts, actual_end_ts, monitored_s, late_start_s, early_end_s, coverage_pct }|null }
 GET /my/monitor/runs?from=&to= -> RunRow[]
 GET /my/live/diagnostics -> { api_ok, camera:{id,source_kind,setup_status,live},
   last_frame_at|null, last_state|null, last_reasons[], frames_today, session|null,
   run|null, detector_ready, advice:[string] }
 SessionRow = { id, label, batch, trainer, kind:"scheduled"|"oneoff"|"adhoc",
   session_date, start_ts, end_ts, scheduled_s, status:"scheduled"|"running"|"closed"|
   "missed"|"cancelled", cancel_reason?, actual_start_ts?, actual_end_ts?, monitored_s?,
   late_start_s?, early_end_s?, coverage_pct?, claimed?, observed?, delta? }
 GET /my/schedule?from=&to= -> { batches[], sessions: SessionRow[], holidays[] }
 POST /my/sessions {date,start_time,end_time,label?,batch_id?} ; PUT /my/sessions/{id}
 {date?,start_time?,end_time?,label?} ; POST /my/sessions/{id}/cancel {reason} ;
 POST /my/live/demo-session {minutes,label?}
 CalendarDay = { date, status:"ok"|"attention"|"critical"|"no_data"|"holiday"|"upcoming"|
   "none"|"missed"|"partial"|"cancelled", updates, snapshots, sessions, sessions_held,
   sessions_missed, sessions_cancelled, people_max, people_avg, claimed, observed, delta,
   flags{total,open,max_severity}|null, uptime_pct, monitored_min, scheduled_min,
   in_use_pct }
 DayDetail = { date, summary, sessions[], runs: RunRow[], timeline{interval_s,points[]},
   equipment[], flags[], evidence[], camera_health[], events[] }
 GET /my/calendar?from=&to= ; GET /my/calendar/{date} ; GET /my/calendar/{date}/snapshots
 Staff: GET /my/staff (items with user_id, face_enrolled, face_consent, active);
 POST /my/staff ; POST /my/staff/me-official ; POST /my/staff/{id}/face-enrol
 {frames_b64:[1..5], consent:true} ; DELETE /my/staff/{id}/face ;
 POST /my/sessions/{id}/staff-scan {frames_b64} ; GET /edge/health (centre_admin)
 -> { atlas, detector:{ready,model,error?}, face:{ready,backend,error?}, version }

PUBLIC PAGES (no login, no AuthGate)
------------------------------------------------------------------
 /apply   Application form, 5-step Stepper with animateStep:
   1 Applicant: name, type (municipality | panchayat | ngo | other), phone, email (opt).
   2 Centre and scheme: centre name; scheme and trade from GET /public/schemes (trade
     shows required equipment).
   3 Capacity and equipment: trainers list (name, qualification, add/remove), max trainees,
     equipment rows PREFILLED from the trade template (editable class + label + quantity).
     Live plausibility hint (amber, never blocks).
   4 Location and room: address, district, state, GPS ("Use my location" + draggable pin),
     room size, number of cameras, resolution, internet availability (none | intermittent |
     stable), proposed batches.
   5 Documents and review: PDF/JPG/PNG, max 5 files, 5 MB each; review summary; Submit.
   Submit: POST /public/applications -> tracking_code -> upload each file with POST
   /public/applications/{code}/documents?phone=<phone> (multipart "file"), per-file progress
   and retry. Success card: tracking code (mono 28), Copy, "Keep this code and your phone
   number to track your application." Handle 429.
 /apply/track   code + phone -> GET /public/applications/track?code=&phone=. Vertical
   status timeline from events. query_raised: officer comment + "Edit and resubmit" (PUT
   /public/applications/{code} {phone,...fields}). Approved: "Your centre has been approved.
   The department will share your login details with your contact person." NEVER show
   credentials. Wrong details -> "No application found for these details."

AUTH PAGES
------------------------------------------------------------------
 /login   Split layout (6C). Label "Centre ID or Trainer ID" (placeholder DSK-WB-0001),
   password with show/hide. POST /auth/login {login_id, password}. Errors inline + shake.
   Links "Apply for a new centre" and "Track application". After login: GET /me, role
   check, then /change-password if must_change_password, else /onboarding (centre_admin,
   not live) or /dashboard.
 /change-password   Forced on first login; also from /settings. Fields current
   (temporary), new, confirm; strength Meter; data-use notice with a REQUIRED checkbox on
   first login: "I understand: cameras count people and equipment anonymously; faces are
   used only for centre staff, only with their consent; camera pictures are analysed and
   discarded, only blurred thumbnails and counts are kept." POST /me/change-password
   {current_password, new_password, accepted_notice:true}; store fresh tokens, continue.

APP PAGES
------------------------------------------------------------------
 /onboarding   (centre_admin; hidden once live)
   GET /my/centre -> {centre, checklist:{camera,batches,staff,equipment,submitted}, status,
   submitted_at}. ProgressRing + 5 checklist rows:
     1 Register camera and draw classroom area -> /cameras (a browser camera uses THIS
       computer's webcam: Add camera -> "This computer's webcam" -> capture reference
       picture -> draw area)
     2 Create batches and timetable -> /schedule
     3 Add trainers/officials and enrol their faces -> /staff
       (tip: "Add yourself as an official so you can verify attendance")
     4 Declare equipment inventory -> /equipment
     5 Submit for government approval (enabled when 1-4 done)
   Check icon draws when an item flips to done. Step 5 calls POST /my/cameras/{id}/submit
   for each draft camera. Banner by status: pending_setup "Complete the steps below";
   awaiting_camera_approval "Awaiting government approval" + relative time; live success
   row (no confetti) + link to /dashboard. Rejected camera: reason + "Fix and resubmit". Tip
   card: "You can try the Live room before approval. The department will see it as 'Setup
   pending' and nothing is recorded until the camera is approved."

 /dashboard
   centre_admin: hero card + 4 stat tiles (Today's sessions, Enrolled / max with Meter, Open
   flags, Camera: online/offline/tampered chip linking to /live) + "Right now" card when a
   camera reports (People, items in use chips, elapsed "Monitoring for 42 min", button "Open
   Live room") + session rail (each session shows its status chip; held sessions show
   "Started 9:03 am, ended 10:58 am"; missed shows "Not held"; cancelled shows the reason) +
   attention list + quick actions (Mark attendance, Add trainee, Add session, Declare repair,
   Open Live room).
   Data: GET /my/centre, GET /my/sessions/today, GET /my/flags?limit=5, GET
   /my/notices?unread=true, GET /my/live.
   trainer: today's sessions as large cards with "Verify yourself" and "Mark attendance"
   plus a secondary "Open Live room".

 /live   (LIVE ROOM; centre_admin, trainer)   [the camera runs in THIS browser tab]
   Purpose: "Use this computer's camera to monitor the room during a session."
   PRE-FLIGHT (until monitoring starts) - 4 steps with ticks:
     1 Camera: picker of browser cameras (GET /my/cameras). None -> button "Add this
       computer as a camera" (POST /my/cameras {name:"Lab PC", source_uri:"browser",
       resolution}). Hint when setup is not approved: "Not approved yet: the department
       sees it as Setup pending and nothing is recorded." Optional link "Draw the
       classroom area" -> /cameras/[id]/setup.
     2 Session: the active/next session (label, start-end, time left) from GET
       /my/sessions/today, or "No session right now" with two buttons: "Start a demo
       session" (minutes 30 | 60 | 120 -> POST /my/live/demo-session; 409 SESSION_ACTIVE /
       SESSION_OVERLAP shown as messages) and "Plan a session" -> /schedule.
     3 Interval: segmented 5 s | 10 s | 30 s | 60 s (default 10 s) -> PUT
       /my/cameras/{id}/live {enabled:true, interval_s, tiling:false}.
     4 Allow camera: getUserMedia({video:{width:{ideal:1280},height:{ideal:720},
       facingMode:"user"},audio:false}); denied -> fallback with browser steps.
   START MONITORING (primary 56 px) executes in this order: (1) PUT live settings, (2)
   POST /my/cameras/{id}/monitor/start (stores run id + started_at), (3) getUserMedia,
   (4) start the Web Worker timer, (5) send the first frame immediately, (6) request
   navigator.wakeLock("screen") (ignore failure). First frame may take long: show chip
   "Warming up the counter..." until the first accepted response.
   RUNNING STATE:
     - Local preview <video muted playsInline> (never uploaded as video) with a transparent
       <canvas> overlay drawing boxes + labels from the LAST FrameResponse (normalised).
     - MONITORING CLOCK card (top of the right column): "Monitoring since 9:02:14 am"
       (IST), ticking elapsed timer "00:42:10" (mono), session label and "Session ends in
       38 min", "Updates sent 253". Below, a thin session progress bar (elapsed / scheduled)
       with start and end labels.
     - Right panel: People (display 64, CountUp), per-class ItemTiles (Chairs, Desks,
       Monitors, others from items; "present N, in use M"), state chip (Monitoring | Paused |
       Camera problem | Waiting for session | Setup pending), "Last update 4 s ago", sparkline
       of the last 60 people_smooth values (memory only).
     - Buttons: Stop monitoring (primary 56 px), Switch camera, Interval select (live change).
   STOP: stop the worker timer, stop all tracks, POST /my/cameras/{id}/monitor/stop
   {reason:"manual"} and show a SUMMARY dialog: Started, Ended, Duration (fmtDuration),
   Updates sent, and when session_timing exists: Session scheduled window, Actual start/end,
   Monitored time, Coverage %. A session end is detected from FrameResponse.session ending
   or time passing end_ts: stop automatically, call stop with reason "session_end", show
   "Session ended. Monitoring stopped." plus the same summary.
   CAPTURE LOOP (implement exactly):
     - Drive the schedule with a Web Worker timer (public/live-timer.worker.js: setInterval
       -> postMessage("tick")); background tabs throttle main-thread timers. On each tick
       (skip if a request is in flight): capture a frame (prefer ImageCapture.grabFrame() on
       the video track, fallback drawImage(video)) into an offscreen canvas scaled to max 960 px
       width, canvas.toBlob("image/jpeg", 0.7), apiUpload("/my/cameras/{id}/frame",
       FormData{file}); release the Blob right after the response.
     - Responses: accepted -> update panel and boxes; accepted:false reason BUSY -> skip
       silently; 429 TOO_FAST -> widen the interval by 2 s; state tampered -> friendly advice
       ("The picture looks too dark or covered. Check the lens and lighting."); 403
       CENTRE_INACTIVE -> stop and show the read-only notice; network error -> "Reconnecting..."
       chip with backoff (5, 10, 20, 40, 60 s) and auto-resume.
     - Closing the tab simply stops frames; the server ends the run by timeout after 3 missed
       intervals. Show a beforeunload warning while monitoring runs.
   MONITORING HISTORY card (below, GET /my/monitor/runs?from=today&to=today): rows Started -
   Ended (or Running) - duration - end reason chip (Stopped by you | Timed out | Session ended |
   Error | System). Link "See all days" -> /calendar.
   HAVING TROUBLE? collapsible card (GET /my/live/diagnostics, polled 5 s only while open):
   checklist rows with ticks/crosses: Server reachable | Camera approved (or Setup pending) |
   Session active | Frames arriving (last frame N s ago) | Counter ready; then the advice[]
   strings from the API as a list. This is the first place to look when numbers do not update.
   Privacy block (shield): "Camera pictures are analysed on the centre's server and discarded
   immediately. We count people and equipment. We never identify trainees. Only counts and
   blurred thumbnails are kept." The browser preview is shown only on this screen.
   Trainer can use this page too (same behaviour).

 /calendar   (CALENDAR; centre_admin, trainer; read-only)
   Purpose: "See which sessions were held, missed or cancelled, and what the camera recorded."
   Data: GET /my/calendar?from=&to= (month or year), GET /my/calendar/{date}, GET
   /my/calendar/{date}/snapshots.
   Header: month title, prev/next, Today, Month | Year toggle, legend chips (icon + text):
   All matched, Worth a look, Needs your response, Not held, Partly held, Cancelled, No camera
   data, Holiday, Scheduled.
   Summary strip: Total updates, Sessions held, Sessions not held, Sessions cancelled, Average
   people, Flags to respond to.
   Month cell: date, status icon, "412 updates", intensity bar, average people (Users icon),
   "2 of 3 held" text when some are missed/cancelled, difference chip when claimed and counted
   exist ("2 fewer" / "Matched" / "3 more"). Not held = danger-tinted dashed border + CalendarX2;
   Partly held = warning border + CircleDashed; Cancelled = muted + diagonal pattern + Ban.
   Keyboard + aria-labels as in the Gov spec ("9 October, 2 sessions: 1 held, 1 not held ...").
   Year view: contribution-style squares with intensity and a corner dot for not-held days; click
   opens that month.
   Day sheet (right drawer 480 px; bottom sheet on mobile; URL ?date=) tabs: Sessions (each
   session: status chip, scheduled window, actual start-end, monitored time + coverage, late start
   chip, claimed vs camera counted with range, staff verified; below it its monitoring runs;
   missed session says "No camera data was received for this session."), Timeline (people over time
   with scheduled bands and monitored bands, equipment in use per class), Equipment (present avg/max,
   in use %), Flags (with "Respond" link), Pictures (blurred thumbnails, lightbox), Updates (Feed |
   Raw snapshots paged). Empty day shows the reason.

 /cameras   (centre_admin)
   List: name, source kind chip (This computer | Server webcam | RTSP | Sample video), resolution,
   status chip, setup status chip, last seen, "Monitoring enabled" switch (PUT /my/cameras/{id}/live),
   interval select, link "Open Live room" (browser kind). "Add camera" dialog: name; Source type
   segmented control:
     "This computer's webcam (browser)" -> "browser"
     "Webcam on the server" -> "webcam:0" (only if the backend machine has one)
     "Network camera (RTSP)" -> rtsp URL field
     "Sample video (demo)" -> select from GET /edge/videos
   Zone label (optional), resolution. POST /my/cameras.
 /cameras/[id]/setup   ROI EDITOR (follow 6C 6.7 and the ROI rules)
   - Reference frame: BROWSER cameras first show "Capture a reference picture" (live preview +
     Capture), upload via POST /my/cameras/{id}/reference-frame (multipart "file"), then load
     GET /my/cameras/{id}/reference-frame -> {url,width,height,quality}. Other kinds load the GET
     directly. "Retake" allowed.
   - Modes: Classroom area (one polygon, required), Workstation zones (many, named). Undo, Clear
     (confirm), Close shape, drag handles, min 3 points, area > 0.02, normalised 0..1, 4 decimals.
   - Quality panel chips with advice. Save draft -> PUT /my/cameras/{id}/setup {roi_polygon, zones};
     Submit -> POST /my/cameras/{id}/submit (needs a saved classroom area). Rejected: callout with
     reason. Reload reproduces shapes exactly. Privacy line shown.

 /schedule   (centre_admin)   [NEW: sessions and timetable; Gov sees all of it]
   Purpose: "Plan when your sessions happen. The department can see this schedule."
   Header: title "Schedule", primary action "Add session". Tabs with sliding underline:
   Sessions | Recurring batches | Holidays.
   SESSIONS tab (GET /my/schedule?from=&to=, default the next 14 days plus the last 14 days):
     - range picker, WEEK GRID preview (7 columns Mon..Sun, 6:00-20:00; sessions as blocks tinted
       by status: upcoming accent-soft, held success-tint, missed danger-tint dashed, cancelled
       muted; holidays hatched).
     - list grouped by date: session card with label, time range, kind chip (Recurring | One-off |
       Demo), SessionStatusChip. Held: "Started 9:03 am, ended 10:58 am, monitored 1 h 52 min
       (96 %)". Missed: "No camera data was received." Cancelled: reason. Upcoming rows (start more
       than 5 min away) show Edit and Cancel buttons; running/past rows are read-only.
     - ADD / EDIT SESSION (right drawer / bottom sheet; react-hook-form + zod): date (not in the
       past, within 60 days), start time, end time, label (default "Extra session"), optional batch.
       Client rules mirror the server: start at least 5 min in the future, duration 15..480 min, end
       after start. Show a live summary line "Tuesday 14 Oct, 2:00 pm - 3:30 pm (1 h 30 min)".
       Errors: SESSION_OVERLAP -> "This overlaps another session at HH:MM"; BAD_TIME -> advice;
       keep typed values. POST /my/sessions {date,start_time,end_time,label,batch_id?}; PUT
       /my/sessions/{id}.
     - CANCEL (dialog): reason REQUIRED (textarea, min 5 chars) -> POST /my/sessions/{id}/cancel
       {reason}. Warning text: "The department will see this cancellation and the reason."
   RECURRING BATCHES tab: batch cards + form (drawer): name, trainer (active staff), weekday chips
     (Mon..Sun = 1..7), start/end time (HH:MM), start/end date. NO approval is needed. Editing shows
     "Changes are logged and the department can see them. Future sessions of this batch are updated."
     and calls PUT /my/batches/{id}; creating calls POST /my/batches.
   HOLIDAYS tab: list with add (date + reason) / remove.
   Note on the page: "Monitoring runs during scheduled sessions (or a demo session)."
   Past sessions cannot be created or edited.

 /staff   (centre_admin)
   List: initials avatar, name, role chip (trainer | official), login ID (mono), face status chip
   (Enrolled | Not enrolled), consent chip, active switch. Header buttons: "Add staff" (POST
   /my/staff creates the person + trainer login -> credentials modal; 409 LOGIN_EXISTS handled) and
   "Add myself as official" (POST /my/staff/me-official; shown only when no staff row has user_id ==
   me.id). Row action "Enrol face" -> /staff/[id]/face-enrol. Deactivate (confirm; explains that the
   face template is deleted). Helper text: "Face scan is used only for centre staff attendance."
 /staff/[id]/face-enrol   (STAFF ONLY)
   Consent block (shield icon, plain text, REQUIRED checkbox): "I agree that my face will be
   converted to an encrypted template used only to verify my own attendance. No photo is stored."
   Live webcam in the oval frame. "Capture" grabs 3 frames about 600 ms apart (show "Hold still" with
   a 2 s ring), builds frames_b64 (JPEG data URLs, max width 640, quality 0.8) and POSTs
   /my/staff/{id}/face-enrol {frames_b64, consent:true}. Preview of the last frame lives in memory only
   until Enrol/Retake. Errors show the message plus server advice: NO_CONSENT, NO_FACE, MULTIPLE_FACES,
   FACE_TOO_SMALL, FACE_BLURRY, NO_STAFF_RECORD, FACE_ENGINE_UNAVAILABLE ("The face service is not
   ready on the server. Ask the system admin to run the model download step."). Success: tick draw.
   Failure: shake the frame. "Remove face data" -> confirm -> DELETE /my/staff/{id}/face. Only that
   staff member or the centre admin can open this page. Destroy streams and frames on leave.

 /trainees   (centre_admin)
   Cap card "38 of 40 seats used" with Meter. List with search + batch filter, cursor pagination. Add
   trainee dialog (name, external ID, batch) -> POST /my/trainees. CSV import (preview, then POST
   /my/trainees/bulk {rows[]}; stops at the cap and reports added/skipped). At cap: "Request extra
   seats". 409 ENROLMENT_CAP_REACHED handled. Deactivate -> POST /my/trainees/{id}/deactivate. NO photo
   or face fields anywhere.

 /attendance   (trainer, centre_admin)
   Session picker (today). Step 1 "Verify yourself" (STAFF ONLY): the oval-frame camera; "Scan" captures
   3 frames over about 2 s -> POST /my/sessions/{id}/staff-scan {frames_b64}. Allowed from 15 minutes
   before start until the end (OUTSIDE_WINDOW -> clear message). Errors with server advice: NO_FACE,
   MULTIPLE_FACES, FACE_TOO_SMALL, FACE_BLURRY, FACE_MISMATCH ("This did not match. Try again in better
   light."), NOT_ENROLLED (link to /staff/[id]/face-enrol), FACE_BACKEND_CHANGED ("Please enrol your face
   again."), LIVENESS_FAILED, NO_STAFF_RECORD ("Your login is not linked to a staff record." plus, for
   centre_admin, a button "Add myself as official"), FACE_ENGINE_UNAVAILABLE. After 3 failures: "Ask your
   centre admin to help. This will be noted."
   Step 2 "Mark trainees": roster (GET /my/trainees?batch=), large checkboxes, Select all / Clear,
   search, sticky bar "Present 24 of 30 [Submit]" -> confirm -> POST /my/sessions/{id}/claim
   {present_trainee_ids}. Locked after submit; "Edit (needs reason)" re-submits with edit_reason; 409
   CLAIM_LOCKED handled. Past sessions list read-only. Privacy line shown ("Staff verification uses a
   private template. Trainees are never scanned.").

 /equipment   (centre_admin)
   GET /my/equipment. Cards: item, sanctioned, declared (stepper -> PUT /my/equipment), observed status
   chip (OK | Missing | Idle | Non-operational | Repair approved), "In use" % over the last 7 days (Meter)
   and last observed date. Amber note when declared != sanctioned. "Declare repair" (item, qty, reason,
   expected fix date <= 30 days) -> POST /my/repair-declarations; active repairs list with "approved
   until". "Request more equipment".

 /requests   Create + list change requests (equipment | enrolment | camera) + repair declarations; payload
   shapes: equipment {class,extra_qty}; enrolment {extra_trainees}; camera {name,source_uri}. Lock icon on
   unapproved items. (Batches and sessions are NOT requests: use /schedule.)

 /flags
   Own flags: plain-language reason, severity chip, status, evidence thumbnails (SignedImage), supportive
   wording. M1 wording: "A scheduled session was not held (no camera data was received). If it was
   cancelled or moved, add it in Schedule next time." C3: "Attendance was submitted but the camera did not
   run." Detail drawer with why-text, lightbox, timeline (flag.events), link "See this day in your
   calendar" -> /calendar?date=. "Respond": comment + optional file (PDF/JPG/PNG <= 5 MB) -> POST
   /my/flags/{id}/respond. Uncertain flags: violet dashed chip + "The camera could not count reliably. No
   action is needed unless asked."

 /notices   Inbox with level chips, unread dot; opening marks read (POST /my/notices/{id}/read); reply (POST
   /my/notices/{id}/reply). Suspension or termination notices drive the read-only banner.

 /settings   Profile, change password, theme, data-use notice, logout. centre_admin: "System check" card
   (GET /edge/health): rows Server database (atlas), Counter model (detector ready/model/error), Staff face
   service (face ready/backend/error) with ticks/crosses and a "Warm up counter" button (?warm=true).

 /demo   (centre_admin; "Demo Lab", "Demo" chip)
   Sample-video scenarios for judges: camera, session, scenario (Normal class | Few students | Equipment
   removed | Camera covered | Frozen feed), claimed override, "Run session analysis" -> POST /edge/demo/run
   {camera_id, session_id, video, scenario, claimed_override}, animated pipeline steps, results card, offline
   toggle + sync counter + chain status. Link card: "Prefer a live demo? Open the Live room."

STATE AND ERROR HANDLING SUMMARY
------------------------------------------------------------------
 401 silent refresh then /login; 403 WRONG_CENTRE/FORBIDDEN "You do not have access to this."; 403
 CENTRE_INACTIVE read-only banner; 409 ENROLMENT_CAP_REACHED cap message + request; 409 CLAIM_LOCKED ask for
 edit reason; 409 SESSION_OVERLAP / SESSION_ACTIVE schedule messages; 422 BAD_TIME advice; 429 "Too many
 requests. Please wait a moment."; 429 TOO_FAST widen interval; 503 FACE_ENGINE_UNAVAILABLE service message;
 network failure ErrorState with Retry; forms keep typed values.

ACCEPTANCE CHECKS
------------------------------------------------------------------
 - Govt account logging into this app is rejected politely.
 - Trainer cannot open /staff, /cameras, /schedule, /trainees, /equipment, /requests, /demo (redirected to
   /dashboard) but CAN open /live and /calendar.
 - Login uses the plain Centre/Trainer ID; no email conversion.
 - Enrolment stops at the cap; 10 quick clicks never exceed it.
 - Live room: Start calls monitor/start, shows "Monitoring since <time>" with a ticking timer; Stop calls
   monitor/stop and shows the summary (start, end, duration, updates, session timing); permission denied shows
   the fallback; boxes are drawn on the local preview; stopping releases the camera light; a hidden tab keeps
   sending frames (worker timer); network loss shows Reconnecting and resumes; first frame shows "Warming up".
 - "Having trouble?" lists server, approval, session, frames and counter status with advice text.
 - The Live room, Trainees, Calendar and roster screens contain no face wording or face features.
 - Face enrolment and attendance scan send 3 frames, show server advice for each error code, and never keep
   images after the request; "Add myself as official" fixes NO_STAFF_RECORD.
 - Creating a one-off session enforces future time, 15..480 min and no overlap; cancelling needs a reason;
   editing is blocked once a session is within 5 minutes of starting.
 - Creating or editing a batch needs no approval and shows the "changes are visible to the department" note.
 - A scheduled session without camera data appears as Not held in the schedule, dashboard rail and calendar.
 - Calendar distinguishes held / Not held / Partly held / Cancelled / Holiday by icon + text, issues one request
   per month, supports keyboard navigation, and its day sheet shows runs with start, end and reason.
 - No frame, Blob or face image is retained in state, storage or cache.
 - Starting the Live room or creating sessions in a suspended centre is blocked.
 - Evidence thumbnails display via SignedImage.
 - Public /apply works without login; tracking never shows credentials.
 - 390 px layout: bottom dock, stacked cards, bottom-sheet dialogs.
 - No Supabase, framer-motion or Supabase env variable in the code.
 - Polling flags for 60 s does not replay row animations.