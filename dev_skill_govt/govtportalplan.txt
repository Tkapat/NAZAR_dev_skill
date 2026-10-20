==================================================================
 dev_skill_gov: GOVERNMENT PORTAL, PAGE PLAN   (v3: MongoDB + GSAP + LIVE + CALENDAR)
 Give with UI/UX 6A v3 + 6B and the "Frontend Patch" block (M5).
==================================================================

RULES FOR THE AI BUILDER (read first)
------------------------------------------------------------------
 1. Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
    Libraries: @tanstack/react-query, react-hook-form + zod,
    gsap + @gsap/react, recharts, react-leaflet, lucide-react, sonner,
    next-themes, qrcode.react (MFA QR).
    DO NOT install: framer-motion, @supabase/*. There is no Supabase.
    Animation = GSAP helpers only (lib/gsap.ts, lib/motion.tsx, UI plan 6B
    + the additions in 6A v3 section 8C).
    Fonts = next/font/google only (UI plan 6A). No Next middleware for
    auth. Use client-side tokens and an <AuthGate>.
 2. AUTH IS THE BACKEND (JWT). Endpoints: POST /auth/login,
    /auth/mfa/login, /auth/refresh, /auth/logout, GET /me,
    POST /me/change-password, POST /me/mfa/setup, POST /me/mfa/enable.
    Use lib/auth.ts and lib/api.ts exactly as in the Frontend Patch.
 3. lib/api.ts: fetch wrapper using NEXT_PUBLIC_API_URL, adds Bearer token
    and header "ngrok-skip-browser-warning": "true". On 401 it silently
    refreshes once (single-flight); failure -> clear tokens + /login.
    403 PASSWORD_CHANGE_REQUIRED -> /change-password. 403
    CREDENTIALS_EXPIRED -> "Ask the department to reset these credentials."
    Error shape {detail:{detail,code}}. Map codes in lib/strings.ts
    (ACCOUNT_LOCKED, INVALID_CREDENTIALS, BAD_MFA, WEAK_PASSWORD,
    SAME_PASSWORD, LINK_EXPIRED, BAD_STATE, FORBIDDEN, NOT_FOUND).
 4. After login call GET /me. Allowed roles: super_admin, scheme_officer,
    auditor. Otherwise logout() and show "This account belongs to the
    Centre portal."
 5. auditor = read-only: hide/disable every action button.
    scheme_officer cannot open /users. Only super_admin edits schemes.
 6. Every page: loading skeleton, empty state, error state with Retry.
 7. IMAGES (evidence, live thumbnails, documents): the API returns RELATIVE
    signed URLs (/files/...?exp=&sig=, valid 60 s). NEVER put them in
    <img src>. Use SignedImage / useSignedImage (fetch + ngrok header ->
    blob URL), skeleton while null. On LINK_EXPIRED refetch the parent
    query. Never build URLs yourself. PDFs: fetch -> blob -> window.open.
 8. Dates in IST, "12 Oct 2026, 3:45 pm" (lib/format.ts). Relative time
    with exact time in a Tooltip. Date-only values arrive as "YYYY-MM-DD"
    strings and times as "HH:MM"/"HH:MM:SS" strings: never pass them
    through new Date() timezone conversion; compare and format as strings.
 9. Env (.env.local): NEXT_PUBLIC_API_URL ONLY.
10. POLLING: live lists (overview, flags, cameras) every 15 s. LIVE pages
    (/live, centre Live tab) every 5 s (React Query refetchInterval 5000,
    refetchIntervalInBackground false). Calendar month 60 s; day drawer
    30 s only when the date is today. No websockets. Polling must NOT replay
    entrance animations (6B R5): updated numbers use CountUp (0.3 s),
    changed chips use flash(), thumbnails use the crossfade helper.
11. IDs are strings under key "id". Lists use ?limit=25&cursor=<id>.
12. Do not add pages or features not listed.
13. LIVE STALENESS: trust the API "state". Show "offline" as grey chip with
    "Last seen 4 min ago". Never animate a Live dot for non-live states.
14. CALENDAR: month view uses GET .../calendar?from=&to= with the first and
    last day of the month (IST). Never call per-day endpoints for the grid.
    Day detail loads only when a day is opened.

GLOBAL LAYOUT
------------------------------------------------------------------
 Left sidebar (collapsible 240 / 64 px) + top bar (breadcrumb, search,
 bell with open-flag count, theme toggle, profile menu).
 Sidebar groups: [Overview, Live] [Applications, Centres, Flags, Cameras,
 Requests, Enforcement] [Schemes, Reports, Accuracy, Audit log]
 [Users (super_admin only), Settings]. Mobile (<768): hamburger -> Sheet.

DATA SHAPES (from the API; use these names exactly)
------------------------------------------------------------------
 LiveStatus = { camera_id, camera_name, centre_id, centre_code, centre_name,
   district, state: "live"|"idle"|"offline"|"tampered"|"provisional", ts,
   age_s, interval_s, session:{id,label,start_ts,end_ts}|null, people,
   people_smooth, claimed|null, items:{class:{present,in_use,idle,off}},
   labels:{class:label}, quality:{ok,reasons[]}, thumb_url, spark:number[],
   model_version }
 GET /live -> { items: LiveStatus[], counts:{live,idle,offline,tampered,provisional} }
 GET /centres/{id}/live -> { cameras: LiveStatus[], timeline:{interval_s,
   points:[{t,people,items:{class:{present,in_use}}}]}, flags:[...] }
 CalendarDay = { date, status: "ok"|"attention"|"critical"|"no_data"|
   "holiday"|"upcoming"|"none", updates, snapshots, sessions, people_max,
   people_avg, claimed, observed, delta, flags:{total,open,max_severity}|null,
   uptime_pct, in_use_pct }
 DayDetail = { date, summary: CalendarDay, sessions:[{id,batch,label,start_ts,
   end_ts,state,claimed,observed,ci_low,ci_high,delta,staff_verified,
   snapshots}], timeline:{interval_s,points:[{t,people,items}]},
   equipment:[{class,label,sanctioned,declared,present_avg,present_max,
   in_use_avg,in_use_pct,status}], flags:[{id,type,severity,status,reason,
   created_at,evidence_urls[]}], evidence:[{id,ts,kind,url}],
   camera_health:[{ts,status,reason}], events:[{ts,kind,text}] }
 SnapshotRow = { id, ts, camera_id, people, items, quality }
 GET .../calendar/{date}/snapshots?limit=50&cursor= -> { items, next_cursor }

PAGES
------------------------------------------------------------------
 /login
   Login ID (govt = email) + password, show/hide, "Government Monitoring
   Portal", split layout per 6A 8B. POST /auth/login {login_id, password}.
   mfa_required -> 6-digit code step -> POST /auth/mfa/login {mfa_token,
   code}. Errors inline + shake. INVALID_CREDENTIALS "Incorrect ID or
   password", ACCOUNT_LOCKED "Too many attempts. Try again in a few
   minutes.", BAD_MFA "Incorrect code". Never say which field was wrong.

 /change-password (when PASSWORD_CHANGE_REQUIRED; also from /settings)
   current, new, confirm; strength Meter; rules min 10, upper, lower,
   digit, special. POST /me/change-password {current_password,
   new_password}; response has fresh tokens: store, go to / (no re-login).

 / (Overview)
   - KPI row (CountUp + sparklines): Live centres, Open flags,
     High/Critical flags, Cameras offline, Pending applications.
   - Map (react-leaflet, ssr:false): pins by risk (green <25, amber 25-60,
     red >60); a pin with a live room shows a small live ring. Click ->
     mini card -> "Open centre".
   - Card "Live rooms now": top 4 rooms with state live (thumbnail 64 px,
     centre name, People number, "x items in use"), link "Open Live wall"
     -> /live. Data: GET /live?limit=4 (poll 15 s here).
   - Left list "Highest risk centres" (top 8, risk Meter).
   - Right list "Latest flags".
   - Chart: flags per day last 14 days (stacked by severity).
   Data: GET /reports/rollup?by=district, GET /flags?limit=10,
   GET /centres?sort=risk&limit=8, GET /cameras?status=offline,
   GET /applications?status=submitted&limit=1, GET /live?limit=4

 /live  (LIVE WALL; all govt roles; read-only)
   Purpose: "What is happening in every room right now?"
   Header: title "Live rooms", description, counts as chips (Live N, Idle N,
   Offline N, Tampered N, Setup pending N) which also act as filters.
   Filters: district, state, search (centre name/code). View toggle: Grid |
   Table. Polling 5 s. Data: GET /live?district=&state=&q=.
   Grid: LiveRoomCard per camera (3 columns >= 1280, 2 >= 768, 1 mobile):
     - thumbnail 16:9 (SignedImage, blurred by backend; crossfade on update)
       with state chip top-left (Live green dot pulsing | Idle | Offline
       grey "Last seen 4 min ago" | Tampered amber "Camera problem" |
       Setup pending violet-dashed), "x s ago" top-right.
     - People: big number (36 tabular, CountUp) with label "people";
       claimed vs observed bar when claimed exists ("Claimed 12, camera saw
       7") in neutral words; sparkline of the last 30 readings.
     - Item chips (max 4 visible + "+n"): "Chair 8 (5 in use)",
       "Monitor 6 (4 on)", "Desk 4 (3 in use)", other equipment.
     - Footer: centre name + code (mono), session label, link "Open centre".
   Table view: centre, camera, state, session, people, claimed, items in
   use (compact), age. Row click -> /centres/[id]?tab=live.
   Empty: "No rooms are being monitored right now. Rooms appear here when
   a centre starts its camera during a session."
   Never show raw video. Only the backend thumbnail.

 /applications
   Tabs Pending | Under review | Query raised | Approved | Rejected with
   count badges. Table: tracking code (mono), centre name, applicant,
   scheme/trade, district, max trainees, submitted date. Search + filters.
   Row click -> /applications/[id]. "Create centre directly" -> /centres/new
   (hidden for auditor).

 /applications/[id]  (review page, two columns)
   Left: grouped cards (Centre, Scheme and trade, Trainers, Capacity,
   Equipment table, Location + small map, Room and internet, Proposed
   batches, Documents (signed), Review history = application.events[]).
   Right sticky panel: "Checks" card (plausibility warnings amber or green
   "Equipment matches template"); actions Approve, Raise query (comment
   required), Reject (reason required), each with confirm dialog.
   After Approve -> CREDENTIALS MODAL (not reopenable): Centre ID, temporary
   password (mono), Copy buttons, red note "Shown once. Expires in 72
   hours. Share only with the centre contact.", "I have saved it"
   (disabled 3 s with ring timer), Print view, locked against Esc/overlay
   until saved, clear password from memory on close. 409 BAD_STATE ->
   "This application was already processed" + refetch. Auditor: no actions.

 /centres
   Table/grid toggle. Columns: code, name, district, scheme/trade, status
   chip, risk bar, open flags, live state chip (Live/Idle/Offline), last
   session, camera status. Filters: district, scheme, status, risk range.
   Search.

 /centres/new  (govt direct creation)
   5-step stepper (Centre -> Scheme -> Capacity and equipment -> Location
   and room -> Review). Equipment prefilled from template. Live
   plausibility warnings. POST /centres -> credentials modal.

 /centres/[id]  (command page; tabs, URL ?tab=)
   Header: name, code, status chip, live state chip, risk score, action menu
   (Message, Issue notice, Reset credentials, Suspend, Terminate, Request
   inspection). Suspend/Terminate only via the enforcement ladder dialog.
   Reset credentials -> credentials modal.
   Tabs (horizontal scroll on mobile):
    1 Overview: sanctioned summary, checklist state, contact, map,
      enrolled / max Meter.
    2 LIVE: "Right now" for this centre. Left (8/12): large thumbnail of
      the selected camera (camera switcher if >1), state chip, age,
      overlay-free (boxes are already drawn in the thumbnail). Right (4/12)
      "Right now" panel: People (CountUp 36), claimed vs observed, then a
      table class | present | in use | idle | off with a usage Meter per
      row and chips (In use / Idle / Off). Below (full width) chart "Today
      so far": area chart of people over time with session bands (ReferenceArea),
      claimed dashed line, and equipment-in-use lines selectable by class
      chips (max 3). Footer: latest 3 flags for today + button "Open today
      in calendar" (switches to tab=calendar&date=today). Poll 5 s.
      Data: GET /centres/{id}/live.
    3 CALENDAR: see CALENDAR SPEC below.
    4 Attendance: line/area chart CLAIMED vs OBSERVED per session (range band;
      uncertain = hollow dots), table with delta and flag chip. Date range
      picker. GET /centres/{id}/attendance?from=&to=
    5 Equipment: matrix class | Sanctioned | Declared | Observed (range) |
      In use % (Meter, from the last 7 days) | Status chip (OK / Missing /
      Idle / Non-operational / Repair approved).
    6 Cameras: list with health, last frame time, setup status, source kind
      chip (Browser | Webcam | RTSP | File), reference frame with read-only ROI
      overlay, approve/reject setup buttons (reject needs reason).
    7 Flags: filtered table for this centre.
    8 Evidence: grid of blurred thumbnails (SignedImage) with timestamp and
      linked flag; date filter; lightbox.
    9 Notices and actions: enforcement timeline, centre replies inline.
   10 Timeline: audit entries for this centre.

 CALENDAR SPEC (tab on /centres/[id]; component CalendarHeatmap + DayDrawer)
   Purpose: "Which day had how much activity, and what exactly happened?"
   Header row: month title (20/600), prev / next icon buttons, "Today", view
   toggle Month | Year, legend chips (OK, Attention, Critical, No data,
   Holiday, Scheduled) with icons.
   MONTH VIEW: 7-column grid Mon-Sun. Each cell (min-height 96 px desktop,
   72 mobile; role="gridcell"):
     - date number (12, mono) top-left; today = 2 px ring; selected = primary border
     - status icon top-right (check | alert-triangle | alert-octagon | minus |
       calendar-off | clock) never colour-only
     - "412 updates" (12 tabular) and an intensity bar at the bottom (4 px,
       width = updates / max updates in the month)
     - people avg with Users icon, e.g. "7.4"
     - delta chip when claimed and observed exist: "+3" (observed lower than
       claimed = amber), "0" green
     - background tint by intensity quartile: primary mixed 0 / 6 / 12 / 20 / 32 %
   Keyboard: arrow keys move focus between cells, Enter/Space opens the day,
   PageUp/PageDown change month. aria-label per cell: "9 October, 412 updates,
   2 sessions, 1 open flag, claimed 18 observed 16".
   YEAR VIEW: 53 x 7 grid of 12 px squares (like a contribution graph), colour
   by updates quartile, month labels on top, hover Tooltip "9 Oct 2026, 412
   updates", click -> month view of that month with the day selected. Data:
   GET .../calendar?from=<Jan 1>&to=<Dec 31> (compact fields used).
   Month summary strip under the header: total updates, days with data,
   average people per active day, open flags, days with critical.
   DAY DRAWER (right drawer 560 px; bottom sheet on mobile) opens on click,
   URL keeps ?tab=calendar&date=YYYY-MM-DD. Header: full date, status chip,
   "Previous day / Next day" buttons. Stat row: Updates, People max / avg,
   Claimed vs Observed, Flags, Camera uptime. Tabs:
     Sessions : cards per session: batch/label, time range, state chip, claimed
       vs observed with range, delta, staff verified tick, snapshots count.
     Timeline : chart people over time (area) with session bands and claimed
       dashed lines; second chart: in-use vs present per selected class (up to
       3 chips). Tooltip shows all classes at that time.
     Equipment: table class | sanctioned | declared | present avg/max | in use
       avg | in use % (Meter) | status chip.
     Flags    : flag rows (type, severity, status, reason) -> /flags/[id].
     Evidence : thumbnail grid for the day (SignedImage, lightbox), time labels.
     Updates  : toggle "Feed | Raw snapshots". Feed = chronological events
       (session opened, claim submitted, flag raised, camera went offline ...).
       Raw snapshots = paged table (time, people, chairs in use / present,
       monitors on, other) from .../snapshots with "Load more".
   Empty day: "No camera data for this day." with the reason chip (Holiday /
   No session / Camera offline).
   Only the displayed month is polled (60 s); open drawer for today polls 30 s.

 /flags  (Flag console)
   Filters: severity, type, status, state, centre, district, date. Table with
   severity dot, type code + name, centre, reason, status, created, age.
   Bulk acknowledge. Row click -> drawer or /flags/[id].

 /flags/[id]
   Header type, severity, state, status. "Why this was flagged": reason +
   numbers (claimed, observed, range, margin, model version, threshold)
   from flag.details. Evidence from flag.evidence_urls[] (SignedImage,
   lightbox). Count history bar chart with claimed ReferenceLine. Centre
   response (flag.events action "centre_respond"). Timeline flag.events[].
   Link "See this day in the calendar" -> /centres/{id}?tab=calendar&date=.
   Actions (not auditor): Acknowledge, Resolve (comment), Dismiss as false
   positive (comment required), Escalate -> notice dialog prefilled.
   POST /flags/{id}/action {action, comment}.

 /cameras
   Health board: cards/table with status dot + icon (online, offline,
   tampered), last frame, centre, source kind chip, tamper reason, setup
   status. "Pending camera approvals" on top with Approve/Reject.

 /requests
   Tabs Change requests | Repair declarations. Decide dialog Approve/Reject
   + comment; repairs choose "approved until" (max 30 days from today).
   Decided row fades out then list refetches.

 /enforcement
   Cross-centre ladder: centre, current level, last notice, open flags, next
   recommended step. "Issue notice" dialog (level, subject, body, attach
   flags). Terminate requires typing the centre code.

 /schemes ; /schemes/[id]/templates/[tid]  (super_admin edit; others read)
   Form: trade name; detector classes (chips; suggested canonical names:
   person, chair, desk, monitor, laptop, keyboard, mouse, cell phone, book,
   bottle, bench, couch; free text allowed for open-vocabulary classes);
   detector backend (auto | coco | world); equipment rules table (class,
   label, min units per trainee, operability: none | screen_on | in_use,
   required) with helper "in_use = a person is next to it; screen_on also
   needs the screen lit"; presence rule; tolerance, agree ratio, min
   confidence, base/step/max frames. zod: max_frames >= base_frames,
   agree_ratio 0.5..1.

 /reports
   Rollup by district / scheme / trade: total centres, avg risk, flags per
   100 sessions, FP rate, avg equipment in-use %, camera uptime %.
   Charts + table. CSV export (client) and Print / Save PDF.

 /accuracy
   GET /accuracy: MAE, within-1 accuracy, per-class precision/recall, flag
   FP/FN by condition, baseline vs quantized, UNCERTAIN rate.

 /audit-log (super_admin, auditor)  Table with filters, expandable JSON, CSV.
 /users (super_admin)  List/create/deactivate govt users (temp password once).
 /settings  Profile, change password, theme, MFA enrolment (QR via
   qrcode.react, 6-digit confirm). Recommend MFA for super_admin and
   scheme_officer.

ACCEPTANCE CHECKS
------------------------------------------------------------------
 - Centre account logging into this app is rejected politely.
 - Auditor sees no action button anywhere (incl. flags and cameras).
 - Credentials modal appears once; double click yields BAD_STATE message.
 - Dismiss requires a comment. Terminate requires typed confirmation.
 - Every list has loading, empty, error states.
 - /live updates every 5 s without replaying entrance animations; numbers tick
   with CountUp; thumbnails crossfade; offline cameras show "Last seen".
 - A camera that stops sending turns "offline" within 3 intervals.
 - Provisional cameras show the "Setup pending" chip and never appear in
   calendars or flag counts.
 - Calendar month grid issues ONE request per month; clicking a day issues
   only the day detail request; keyboard navigation works; every cell has an
   aria-label; status never by colour alone.
 - Year view shows 365 squares with intensity and opens the correct month.
 - Day drawer tabs load correctly for a day with data, a holiday, and a
   day without data.
 - Evidence and live thumbnails display via SignedImage (no ngrok warning page).
 - Token expiry handled silently; 5 wrong passwords show lockout message;
   password change keeps the user signed in.
 - No Supabase, framer-motion or Supabase env variable anywhere.