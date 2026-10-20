==================================================================
 dev_skill_gov: GOVERNMENT PORTAL, PAGE PLAN   (v4)
 MongoDB + GSAP + LIVE DATA WALL + SESSIONS + RUNS + CALENDAR
 Give with UI/UX 6A (+ the v4 additions block), 6B, and the Frontend Patch (M5).
==================================================================

RULES FOR THE AI BUILDER (read first)
------------------------------------------------------------------
 1. Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
    Libraries: @tanstack/react-query, react-hook-form + zod,
    gsap + @gsap/react, recharts, react-leaflet, lucide-react, sonner,
    next-themes, qrcode.react (MFA QR).
    DO NOT install: framer-motion, @supabase/*. Animation = GSAP helpers
    only (lib/gsap.ts, lib/motion.tsx). Fonts = next/font/google only.
    No Next middleware for auth: client tokens + <AuthGate>.
 2. AUTH IS THE BACKEND (JWT): POST /auth/login, /auth/mfa/login,
    /auth/refresh, /auth/logout, GET /me, POST /me/change-password,
    POST /me/mfa/setup, POST /me/mfa/enable. lib/auth.ts and lib/api.ts as
    in the Frontend Patch. api() must also surface detail.advice from error
    bodies: throw {status, code, message, advice?}.
 3. lib/api.ts adds Bearer + "ngrok-skip-browser-warning": "true", silently
    refreshes once on 401 (single-flight), redirects on 403
    PASSWORD_CHANGE_REQUIRED, shows "Ask the department to reset these
    credentials." on CREDENTIALS_EXPIRED. Map codes in lib/strings.ts
    (ACCOUNT_LOCKED, INVALID_CREDENTIALS, BAD_MFA, WEAK_PASSWORD,
    SAME_PASSWORD, LINK_EXPIRED, BAD_STATE, FORBIDDEN, NOT_FOUND).
 4. After login call GET /me. Allowed roles: super_admin, scheme_officer,
    auditor. Otherwise logout() and show "This account belongs to the Centre
    portal."
 5. auditor = read-only: hide/disable every action button. scheme_officer
    cannot open /users. Only super_admin edits schemes/templates.
 6. Every page: loading skeleton (mirrors layout), empty state, error state
    with Retry.
 7. IMAGES: only blurred EVIDENCE images (flags, calendar day Evidence tab,
    camera reference frame) and documents. They arrive as RELATIVE signed URLs
    (/files/...?exp=&sig=, 60 s). NEVER put them in <img src>: use
    SignedImage/useSignedImage. On LINK_EXPIRED refetch the parent query.
 8. GOVERNMENT SEES DATA ONLY. The Live wall, Overview "Live rooms now" and
    the centre Live tab must NOT show camera pictures. They show numbers,
    equipment use, state and timers. If a LiveStatus row happens to include
    thumb_url (only when the server enables it) render it through SignedImage;
    otherwise render no image slot. Never reserve empty image space.
 9. Dates in IST, "12 Oct 2026, 3:45 pm". Date-only values arrive as
    "YYYY-MM-DD", times as "HH:MM"/"HH:MM:SS": never run them through
    new Date() timezone conversion. Durations use fmtDuration(seconds) ->
    "1 h 02 min" / "42 min" / "35 s" (lib/format.ts).
10. POLLING: lists (flags, cameras, overview, sessions today) 15 s; LIVE pages
    (/live, centre Live tab) 5 s; calendar month 60 s; today's day drawer 30 s.
    refetchIntervalInBackground false. No websockets. Polling must NOT replay
    entrance animations (6B R5): numbers use CountUp (0.3 s), changed chips
    use flash().
11. ELAPSED TIMERS: LiveStatus.elapsed_s is a server value at fetch time. Show a
    ticking timer by adding (now - fetchedAt) locally every second (one shared
    1 s interval hook useNow()); reset on each poll. No animation on the tick.
12. IDs are strings under "id". Lists use ?limit=25&cursor=<id>.
13. Do not add pages or features not listed.
14. LIVE STALENESS: trust the API "state". "offline" = grey chip + "Last seen
    4 min ago". Never pulse the Live dot for non-live states.
15. CALENDAR: the month grid uses ONE range request (first..last day of the
    month, IST). Day detail loads only when a day is opened.

GLOBAL LAYOUT
------------------------------------------------------------------
 Left sidebar (collapsible 240 / 64 px) + top bar (breadcrumb, search, bell with
 open-flag count, theme toggle, profile menu).
 Sidebar groups: [Overview, Live, Sessions] [Applications, Centres, Flags,
 Cameras, Requests, Enforcement] [Schemes, Reports, Accuracy, Audit log]
 [Users (super_admin only), Settings]. Mobile (<768): hamburger -> Sheet.

DATA SHAPES (use these names exactly)
------------------------------------------------------------------
 LiveStatus = { camera_id, camera_name, centre_id, centre_code, centre_name,
   district, state: "live"|"idle"|"offline"|"tampered"|"provisional", ts, age_s,
   interval_s, session:{id,label,start_ts,end_ts,actual_start_ts}|null,
   run_started_at|null, elapsed_s|null, people, people_smooth, claimed|null,
   items:{class:{present,in_use,idle,off}}, labels:{class:label},
   quality:{ok,reasons[]}, thumb_url?, spark:number[], model_version }
 GET /live -> { items: LiveStatus[], counts:{live,idle,offline,tampered,provisional} }
 GET /centres/{id}/live -> { cameras: LiveStatus[], timeline:{interval_s,points:
   [{t,people,items:{class:{present,in_use}}}]}, flags:[...] }
 SessionRow = { id, centre_id, centre_code, centre_name, district, label, batch,
   trainer, kind:"scheduled"|"oneoff"|"adhoc", session_date, start_ts, end_ts,
   scheduled_s, status:"scheduled"|"running"|"closed"|"missed"|"cancelled",
   cancel_reason?, actual_start_ts?, actual_end_ts?, monitored_s?, late_start_s?,
   early_end_s?, coverage_pct?, claimed?, observed?, delta? }
 GET /sessions?date=&status=&district=&q=&limit=&cursor= -> { items: SessionRow[],
   next_cursor, counts:{scheduled,running,held,missed,cancelled}, date }
 GET /sessions/{id} -> { ...SessionRow, runs: RunRow[], summary }
 RunRow = { id, camera_id, camera_name, started_at, ended_at|null, end_reason?:
   "manual"|"timeout"|"session_end"|"error"|"system", by:"user"|"system", by_name?,
   frames_ok, frames_bad, duration_s }
 GET /centres/{id}/schedule?from=&to= -> { batches[], sessions: SessionRow[],
   holidays[], changes:[{ts,actor_name,action,entity,text}] }
 GET /centres/{id}/runs?from=&to= -> RunRow[]
 CalendarDay = { date, status: "ok"|"attention"|"critical"|"no_data"|"holiday"|
   "upcoming"|"none"|"missed"|"partial"|"cancelled", updates, snapshots, sessions,
   sessions_held, sessions_missed, sessions_cancelled, people_max, people_avg,
   claimed, observed, delta, flags:{total,open,max_severity}|null, uptime_pct,
   monitored_min, scheduled_min, in_use_pct }
 DayDetail = { date, summary: CalendarDay, sessions:[SessionRow-like + ci_low,
   ci_high, staff_verified, snapshots], runs: RunRow[], timeline:{interval_s,
   points:[{t,people,items}]}, equipment:[{class,label,sanctioned,declared,
   present_avg,present_max,in_use_avg,in_use_pct,status}], flags:[{id,type,
   severity,status,reason,created_at,evidence_urls[]}], evidence:[{id,ts,kind,url}],
   camera_health:[{ts,status,reason}], events:[{ts,kind,text}] }
 SnapshotRow = { id, ts, camera_id, people, items, quality }
 GET .../calendar/{date}/snapshots?limit=50&cursor= -> { items, next_cursor }
 Flag types now include M1 "Session not held" (see constants).

PAGES
------------------------------------------------------------------
 /login
   Login ID (govt = email) + password, show/hide, split layout (6A 8B).
   POST /auth/login {login_id, password}. mfa_required -> 6-digit step -> POST
   /auth/mfa/login {mfa_token, code}. Errors inline + shake. INVALID_CREDENTIALS
   "Incorrect ID or password", ACCOUNT_LOCKED "Too many attempts. Try again in a
   few minutes.", BAD_MFA "Incorrect code". Never say which field was wrong.

 /change-password   (when PASSWORD_CHANGE_REQUIRED; also from /settings)
   current, new, confirm; strength Meter; min 10, upper, lower, digit, special.
   POST /me/change-password {current_password, new_password}; response has fresh
   tokens: store, go to / (no re-login).

 / (Overview)
   - KPI row (CountUp + sparklines): Live centres, Open flags, High/Critical
     flags, Cameras offline, Pending applications.
   - Map (react-leaflet, ssr:false): pins by risk (green <25, amber 25-60, red
     >60); a pin with a live room shows a small ring. Click -> mini card ->
     "Open centre".
   - Card "Live rooms now" (NO pictures): top 4 live rooms as rows: centre name +
     code, People number (CountUp), "5 of 8 chairs in use", elapsed timer, state
     chip. Link "Open Live wall" -> /live. Data GET /live?limit=4 (15 s).
   - Card "Today's sessions": counts from GET /sessions?date=today (Running, Held,
     Missed, Upcoming) as 4 mini stats + link "Open Sessions" -> /sessions.
   - Left list "Highest risk centres" (top 8, risk Meter). Right list "Latest flags".
   - Chart: flags per day last 14 days (stacked by severity).
   Data: GET /reports/rollup?by=district, GET /flags?limit=10, GET /centres?
   sort=risk&limit=8, GET /cameras?status=offline, GET /applications?status=
   submitted&limit=1, GET /live?limit=4, GET /sessions?date=today&limit=1

 /live   (LIVE DATA WALL; all govt roles; read-only; NO pictures)
   Purpose: "What is happening in every room right now?"
   Header: title "Live rooms", description, state chips with counts (Live N, Idle N,
   Offline N, Camera problem N, Setup pending N) that double as filters.
   Filters: district, search (centre name/code). View toggle Grid | Table. Poll 5 s.
   Data: GET /live?district=&state=&q=.
   LIVE DATA CARD (grid; 3 cols >= 1280, 2 >= 768, 1 mobile; component LiveDataCard):
     Row 1: LiveStateChip left; right: elapsed timer "Live for 42 min" (mono, ticking,
            when live) or "Last seen 4 min ago" (offline) or "Waiting for session" (idle).
     Row 2: People number (36 tabular, CountUp) + "people" label; right: sparkline
            (last 30 values, 96x32).
     Row 3: comparison "Claimed 12 / Camera counted 7" with a thin two-bar and the
            neutral sentence "5 fewer than claimed" (only when claimed exists).
     Row 4: equipment mini-tiles (max 4 + "+n" popover): label, "5 / 8 in use" and a
            4 px usage Meter; screen classes read "4 / 6 on". Tiles with off>0 show an
            "x off" chip.
     Footer (12 muted): centre name, code (mono), session label, "Started 9:02 am"
            (actual_start_ts or run_started_at). Whole card links to
            /centres/[id]?tab=live. Hover = .card-hover.
   Table view: centre, camera, state, session, started, elapsed, people, claimed,
   items in use (compact), age. Row click -> /centres/[id]?tab=live.
   Empty: "No rooms are being monitored right now. Rooms appear here when a centre
   starts monitoring during a session."
   The page shows counts and equipment data only, never camera pictures.

 /sessions   (NEW: SESSIONS BOARD; all govt roles; read-only)
   Purpose: "Which sessions were scheduled, which were held, and for how long?"
   Header: title "Sessions", description. Date navigation: prev / next day buttons,
   date input, "Today". Count chips (Scheduled, Running, Held, Missed, Cancelled)
   that filter. Filters: district, search (centre, label). Poll 15 s when the date is
   today.
   Table (DataTable, cursor pagination "Load more"): columns Centre (name + code
   mono) | Session (label, batch, kind chip: Recurring | One-off | Demo) | Scheduled
   (start-end) | Status (SessionStatusChip) | Started (actual_start_ts) | Ended
   (actual_end_ts) | Monitored (fmtDuration + coverage Meter) | Late start (chip
   "+7 min" amber when > 5 min, else "On time") | Claimed / Counted. Missed rows
   show an "No camera data" sub-label; cancelled rows show the reason on hover and
   line-through styling plus a Ban icon.
   Row click -> SESSION DRAWER (right drawer 560 px / bottom sheet mobile;
   GET /sessions/{id}; URL ?session=<id>): header (label, centre, date, status chip);
   stat row: Scheduled (start-end), Actual (start-end), Monitored (duration + %),
   Late start, Early end; "Monitoring runs" list (RunRow: started, ended or "Running",
   end reason chip Manual | Timed out | Session ended | Error | System, by, frames
   ok/bad, duration); claimed vs counted summary with range; flags of the session;
   link "Open this day in the centre calendar" -> /centres/{id}?tab=calendar&date=.
   Empty: "No sessions on this date."

 /applications
   Tabs Pending | Under review | Query raised | Approved | Rejected with count
   badges. Table: tracking code (mono), centre name, applicant, scheme/trade,
   district, max trainees, submitted date. Search + filters. Row click ->
   /applications/[id]. "Create centre directly" -> /centres/new (hidden for auditor).

 /applications/[id]   (review page, two columns)
   Left: grouped cards (Centre, Scheme and trade, Trainers, Capacity, Equipment
   table, Location + small map, Room and internet, Proposed batches, Documents
   (signed), Review history = application.events[]). Right sticky panel: "Checks"
   card (plausibility warnings amber or green "Equipment matches template"); actions
   Approve, Raise query (comment required), Reject (reason required), each with a
   confirm dialog. After Approve -> CREDENTIALS MODAL (not reopenable): Centre ID,
   temporary password (mono), Copy buttons, red note "Shown once. Expires in 72
   hours. Share only with the centre contact.", "I have saved it" (disabled 3 s with
   ring timer), Print view, locked against Esc/overlay until saved, clear password
   from memory on close. 409 BAD_STATE -> "This application was already processed" +
   refetch. Auditor: no actions.

 /centres
   Table/grid toggle. Columns: code, name, district, scheme/trade, status chip, risk
   bar, open flags, live state chip, last session, camera status. Filters: district,
   scheme, status, risk range. Search.

 /centres/new   (govt direct creation)
   5-step stepper (Centre -> Scheme -> Capacity and equipment -> Location and room ->
   Review). Equipment prefilled from template. Live plausibility warnings. POST
   /centres -> credentials modal.

 /centres/[id]   (command page; tabs, URL ?tab=)
   Header: name, code, status chip, live state chip, risk score, action menu
   (Message, Issue notice, Reset credentials, Suspend, Terminate, Request inspection).
   Suspend/Terminate only via the enforcement ladder dialog. Reset credentials ->
   credentials modal.
   Tabs (horizontal scroll on mobile): Overview | Live | Calendar | Schedule |
   Attendance | Equipment | Cameras | Flags | Evidence | Notices | Timeline.
    1 Overview: sanctioned summary, checklist state, contact, map, enrolled / max Meter.
    2 LIVE (data only, 5 s): left 8/12 "Right now" card: LiveStateChip, elapsed timer,
      People (CountUp 36), claimed vs counted, camera switcher if > 1 camera, run info
      "Monitoring since 9:02 am by Priya (this computer)". Below it the EQUIPMENT USE
      table: class | present | in use | idle | off | usage Meter | chips. Right 4/12:
      "Today's monitoring" card = runs of today (GET /centres/{id}/runs?from=today&to=
      today): rows Started - Ended (or Running) - duration - end reason chip; plus the
      sessions of today with status chips and actual start/end. Full width: ChartCard
      "Today so far" (TimelineChart: people over time, session bands, claimed dashed,
      up to 3 class lines). Footer: latest 3 flags of today + button "Open today in
      calendar". Data: GET /centres/{id}/live.
    3 CALENDAR: see CALENDAR SPEC.
    4 SCHEDULE (NEW; GET /centres/{id}/schedule?from=&to=): range picker (default
      previous 14 to next 14 days). Left: recurring batches as cards (name, trainer,
      weekday chips Mon-Sun, time range, date range, active chip). Beside/below: WEEK
      GRID preview (7 columns, 6:00-20:00, blocks tinted accent-soft; holidays hatched).
      Then SESSIONS table for the range: date | session | scheduled | SessionStatusChip |
      actual start-end | monitored | coverage; cancelled rows show reason; missed rows
      highlighted with the Missed chip. Then HOLIDAYS list and "Schedule changes" log
      (changes[]: time, actor, text such as "Priya cancelled 'Evening batch' on 12 Oct:
      Power cut"), newest first. Read-only for every govt role.
    5 Attendance: line/area chart CLAIMED vs OBSERVED per session (range band; uncertain =
      hollow dots), table with delta and flag chip. Date range picker. GET
      /centres/{id}/attendance?from=&to=
    6 Equipment: matrix class | Sanctioned | Declared | Observed (range) | In use %
      (Meter, last 7 days) | Status chip (OK / Missing / Idle / Non-operational / Repair
      approved).
    7 Cameras: list with health, last frame time, setup status, source kind chip
      (Browser | Webcam | RTSP | File), reference frame with read-only ROI overlay,
      approve/reject setup buttons (reject needs reason).
    8 Flags: filtered table for this centre.
    9 Evidence: grid of blurred thumbnails (SignedImage) with timestamp and linked flag;
      date filter; lightbox.
   10 Notices and actions: enforcement timeline, centre replies inline.
   11 Timeline: audit entries for this centre.

 CALENDAR SPEC   (tab on /centres/[id]; components CalendarHeatmap + DayDrawer)
   Purpose: "Which days were held, missed or cancelled, and what happened on each?"
   Header row: month title (20/600), prev / next icon buttons, "Today", ToggleGroup
   Month | Year, legend chips (with icons): OK, Attention, Critical, Not held, Partly
   held, Cancelled, No data, Holiday, Scheduled.
   Month summary strip: Total updates, Days held, Days not held, Sessions held / missed
   / cancelled (three numbers), Average people, Open flags.
   MONTH VIEW: 7-column grid Mon-Sun. Cell (role="gridcell", min-height 96 px desktop,
   72 mobile): date (12 mono) + status icon (never colour only); "412 updates" and a
   4 px intensity bar (width = updates / month max); people average with Users icon;
   "2 of 3 held" mini text when sessions > 0 and some missed/cancelled; delta chip when
   claimed and counted exist ("+3" amber, "0" green). Backgrounds: heat-0..4 by updates;
   missed = danger-tinted dashed border + CalendarX2 icon; partial = warning border +
   CircleDashed icon; cancelled = muted, diagonal-line pattern + Ban icon; holiday =
   hatched + CalendarOff; upcoming = dashed border + Clock; none = plain.
   today = 2 px ring; selected = primary border. Keyboard: arrows move focus, Enter/Space
   opens the day, PageUp/PageDown change month, Home/End row ends. aria-label per cell:
   "9 October, 2 sessions: 1 held, 1 not held, 412 updates, 1 open flag".
   YEAR VIEW: 53 x 7 grid of 12 px squares coloured by updates quartile, with a small
   corner marker (dot) for missed/partial days, month labels, Tooltip "9 Oct 2026: 412
   updates, 1 session not held"; click opens that month with the day selected.
   DAY DRAWER (right drawer 560 px; bottom sheet on mobile; URL ?tab=calendar&date=):
   header (full date, status chip, prev/next day buttons). Stat row: Updates | People max
   / avg | Claimed vs Counted | Flags | Monitored (fmtDuration of scheduled). Tabs:
     Sessions : per session card: label, scheduled window, SessionStatusChip, actual
       start - end, monitored + coverage Meter, late start chip, claimed vs counted with
       range, staff verified tick, snapshots; below each card its runs (Started - Ended -
       reason - duration). Missed sessions say "No camera data was received."
     Timeline : people-over-time chart with session bands (scheduled window) and a
       second band for monitored periods; class lines (max 3); text summary.
     Equipment: table class | sanctioned | declared | present avg/max | in use avg | in
       use % Meter | status chip.
     Flags    : flag rows -> /flags/[id].
     Evidence : blurred thumbnails (SignedImage, lightbox) with time labels.
     Updates  : ToggleGroup Feed | Raw snapshots. Feed = vertical rail of events
       (session opened, monitoring started, claim submitted, flag raised, camera went
       offline, monitoring stopped). Raw = DataTable with "Load more".
   Empty day: "No camera data for this day." + reason chip (Holiday | Not held | Cancelled
   | No session).
   Month polled 60 s; today's open drawer 30 s.

 /flags   (Flag console)
   Filters: severity, type (includes M1 "Session not held"), status, state, centre,
   district, date. Table with severity dot, type code + name, centre, reason, status,
   created, age. Bulk acknowledge. Row click -> drawer or /flags/[id].

 /flags/[id]
   Header type, severity, state, status. "Why this was flagged": reason + numbers
   (claimed, observed, range, margin, model version, threshold) from flag.details. For
   M1 / C3 flags show the session card (scheduled window, "No camera data received").
   Evidence from flag.evidence_urls[] (SignedImage, lightbox). Count history bar chart
   with claimed ReferenceLine. Centre response (flag.events action "centre_respond").
   Timeline flag.events[]. Link "See this day in the calendar" ->
   /centres/{id}?tab=calendar&date=. Actions (not auditor): Acknowledge, Resolve
   (comment), Dismiss as false positive (comment required), Escalate -> notice dialog.
   POST /flags/{id}/action {action, comment}.

 /cameras
   Health board: cards/table with status dot + icon (online, offline, tampered), last
   frame, centre, source kind chip, tamper reason, setup status. "Pending camera
   approvals" on top with Approve/Reject (reject needs a reason).

 /requests   Tabs Change requests | Repair declarations. Decide dialog Approve/Reject +
   comment; repairs choose "approved until" (max 30 days from today). Decided row fades
   out then the list refetches. (Batch requests no longer exist: batches need no
   approval; kinds are equipment, enrolment, camera.)

 /enforcement   Cross-centre ladder: centre, current level, last notice, open flags, next
   recommended step. "Issue notice" dialog (level, subject, body, attach flags). Terminate
   requires typing the centre code.

 /schemes ; /schemes/[id]/templates/[tid]   (super_admin edit; others read)
   Form groups:
   Basics: trade name; presence rule (seated | workstation | any).
   Detector: classes (chips; suggested canonical names: person, chair, desk, monitor,
   laptop, keyboard, mouse, cell phone, book, bottle, bench, couch; free text allowed for
   open-vocabulary classes); detector backend (auto | coco | world); model (yolo11n |
   yolo11s | yolo11m, default yolo11s); image size (default 960); minimum object size
   (min_box_area as percent of frame, default 1.5 %).
   Thresholds: default confidence (min_confidence) plus an optional per-class confidence
   table (class -> value) with helper "Lower values find more objects but may add false
   ones. Tune on your webcam."; optional class aliases table (e.g. bench -> desk).
   Equipment rules table (class, label, min units per trainee, operability: none |
   screen_on | in_use, required) with helper "in_use = a person is next to it; screen_on
   also needs the screen lit".
   Counting: tolerance, agree ratio, base/step/max frames.
   zod: max_frames >= base_frames, agree_ratio 0.5..1, class_conf values 0.05..0.95,
   min_box_area 0.2..20 (%).

 /reports
   Rollup by district / scheme / trade: total centres, avg risk, flags per 100 sessions,
   FP rate, avg equipment in-use %, sessions held % (sessions_held_pct), missed sessions,
   average monitoring coverage % (avg_coverage_pct). Charts + table. CSV export (client) and
   Print / Save PDF.

 /accuracy   GET /accuracy: MAE, within-1 accuracy, per-class precision/recall, flag FP/FN
   by condition, baseline vs quantized, UNCERTAIN rate.

 /audit-log (super_admin, auditor)   Table with filters, expandable JSON, CSV. Includes
   schedule actions (session.create, session.cancel, batch edits).
 /users (super_admin)   List/create/deactivate govt users (temp password once).
 /settings   Profile, change password, theme, MFA enrolment (QR via qrcode.react, 6-digit
   confirm). Recommend MFA for super_admin and scheme_officer.

ACCEPTANCE CHECKS
------------------------------------------------------------------
 - Centre account logging into this app is rejected politely.
 - Auditor sees no action button anywhere.
 - Credentials modal appears once; double click yields BAD_STATE message.
 - Dismiss requires a comment. Terminate requires typed confirmation.
 - Every list has loading, empty, error states.
 - /live, Overview "Live rooms now" and the centre Live tab show NO camera pictures
   (counts, equipment use, state, timers only). With thumb_url absent no image slot or
   empty gap exists.
 - Elapsed timers tick every second without re-animating cards; polling refreshes numbers
   with CountUp and flash only.
 - A camera that stops sending turns "offline" within 3 intervals and shows "Last seen".
 - Provisional cameras show "Setup pending" and never appear in calendars or flag counts.
 - /sessions lists every centre's sessions for the chosen date with status, actual start,
   actual end, monitored time and coverage; the drawer shows runs with end reasons.
 - A scheduled session without camera data shows Not held; with a claim it also links to
   the C3 flag; cancelled sessions show the reason.
 - Centre Schedule tab shows recurring batches, the sessions table, holidays and the change
   log.
 - Calendar month grid issues ONE request per month; keyboard navigation works; every cell
   has an aria-label; Not held / Partly held / Cancelled are distinguishable without colour
   (icon + text); year view opens the correct month.
 - Day drawer works for a held day, a missed day, a partial day, a cancelled day and a
   holiday.
 - Blurred evidence images display via SignedImage (no ngrok warning page).
 - Token expiry handled silently; 5 wrong passwords show the lockout message; password
   change keeps the user signed in.
 - No Supabase, framer-motion or Supabase env variable anywhere.