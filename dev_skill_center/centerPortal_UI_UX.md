==================================================================
 DEV_SKILL UI/UX PLAN  (6C) v3: CENTRE PORTAL THEME AND DESIGN
 Applies ONLY to dev_skill_center. The Gov app uses 6A v3.
 Read with: 6B (GSAP), M5 (auth), Centre page plan v3.
 This file is self-contained: it restates the shared rules it needs.
==================================================================

0. PRECEDENCE AND RULES (read first, obey exactly)
------------------------------------------------------------------
 1. This file is the single design source for dev_skill_center. If any other
    UI document disagrees (for example fonts, tokens, layout), THIS file wins.
 2. Stack: Next.js App Router + TypeScript + Tailwind (v4: tokens with
    @theme inline; v3: map the same variables in tailwind.config.ts) + shadcn/ui.
    Every data page has 4 states: loading (mirrored skeleton), empty, error with
    Retry, success. Status and severity are never colour-only. Evidence/live/
    reference images ONLY through SignedImage/useSignedImage. No Supabase, no
    framer-motion. All strings in lib/strings.ts and lib/constants.ts.
 3. Animation = GSAP via lib/gsap.ts + lib/motion.tsx (6B) ONLY. Rules R1-R11
    (useGSAP + scope, clearProps, no re-run on polling, no repeat:-1, reduced
    motion). New helpers in section 9 extend 6B.
 4. Fonts ONLY via next/font/google: Plus_Jakarta_Sans (UI), DM_Serif_Display
    (display headings and hero numbers ONLY), JetBrains_Mono (IDs, passwords,
    codes, calendar dates, times). No other font, no <link>.
 5. ONE accent colour (--primary, deep green). Tints allowed (accent-soft,
    accent-tint). No second brand colour.
 6. Every colour from CSS variables. No hex in components.
 7. Hover may animate ONLY border-color, background-color and box-shadow with
    CSS (150 ms). No hover transforms or lifts.
 8. Tone: supportive, never accusatory. Mobile first: trainers use phones. Test
    390 / 768 / 1024 / 1440 in light AND dark.
 9. Spacing scale 4, 8, 12, 16, 24, 32, 48 (+64 page top). Do not add pages,
    colours or animations not listed here or in 6B.
10. LIVE DATA IS NEVER REPLAYED AS ANIMATION: updates change numbers (CountUp),
    chips (flash) and boxes (canvas redraw) only.

1. DESIGN CONCEPT
------------------------------------------------------------------
 "Warm paper, calm green." A well-run, friendly institution: warm off-white
 canvas, white cards with soft depth, deep-green primary, a serif voice for
 headings, generous space, rounded shapes. Data stays crisp while chrome stays
 soft. Contrast with Gov: Gov = cool neutral, indigo, sidebar, flat borders,
 dense tables. Centre = warm neutral, green, TOP NAV, soft shadowed rounded
 cards, airy lists, serif headings.

2. FONTS  ---  FILE: app/layout.tsx
------------------------------------------------------------------
 import { Plus_Jakarta_Sans, DM_Serif_Display, JetBrains_Mono } from "next/font/google";
 import { ThemeProvider } from "next-themes";
 const sans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans-ui" });
 const display = DM_Serif_Display({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-display" });
 const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jbmono" });
 <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
   <body><ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
     <Providers>{children}</Providers></ThemeProvider></body></html>
 USAGE
  - font-sans: all UI text. Weights 400/500/600/700.
  - font-display (400 only): page titles (32), hero greeting (40), big hero
    numbers (40/48, live People 64), login headline. NEVER in tables, buttons,
    labels, chips or body text. Never bold it.
  - font-mono: Centre ID, trainer ID, temporary password, tracking code, hashes,
    times in compact lists, calendar dates.
  - Body 14/22, inputs 16, meta 12, section title 20/600 (sans), page title 32
    (display), hero 40 (display).

3. TOKENS  ---  FILE: app/globals.css
------------------------------------------------------------------
 @import "tailwindcss";
 @import "tw-animate-css";
 @custom-variant dark (&:is(.dark *));
 :root {
   --background:#FAF8F5;  --foreground:#1C1917;
   --card:#FFFFFF;        --card-foreground:#1C1917;
   --popover:#FFFFFF;     --popover-foreground:#1C1917;
   --surface:#F4F1EC;     --surface-2:#ECE7DF;   --surface-hover:#F8F5F0;
   --secondary:#F4F1EC;   --secondary-foreground:#1C1917;
   --muted:#F4F1EC;       --muted-foreground:#78716C;
   --accent:#F4F1EC;      --accent-foreground:#1C1917;   /* hover surface, NOT brand */
   --border:#E7E2DA;      --border-strong:#D6CFC4;  --input:#E7E2DA;  --ring:var(--primary);
   --primary:#0E7C6B;     --primary-foreground:#FFFFFF;
   --accent-soft:rgba(14,124,107,0.10);
   --accent-tint:rgba(14,124,107,0.05);
   --success:#15803D; --warning:#B45309; --danger:#B91C1C;
   --uncertain:#6D28D9; --info:#0369A1;
   --sev-low:#78716C; --sev-medium:#B45309; --sev-high:#C2410C; --sev-critical:#B91C1C;
   --shadow-card:0 1px 2px rgba(28,25,23,.04), 0 4px 16px rgba(28,25,23,.05);
   --shadow-pop:0 12px 32px rgba(28,25,23,.12), 0 2px 4px rgba(28,25,23,.06);
   --radius:0.75rem;
 }
 .dark {
   --background:#0F1412;  --foreground:#F2F5F3;
   --card:#151B18;        --card-foreground:#F2F5F3;
   --popover:#151B18;     --popover-foreground:#F2F5F3;
   --surface:#1B221F;     --surface-2:#232C28;   --surface-hover:#18201C;
   --secondary:#1B221F;   --secondary-foreground:#F2F5F3;
   --muted:#1B221F;       --muted-foreground:#9AA8A1;
   --accent:#1B221F;      --accent-foreground:#F2F5F3;
   --border:#263029;      --border-strong:#34413A;  --input:#263029;
   --primary:#34C3A8;     --primary-foreground:#04211B;
   --accent-soft:rgba(52,195,168,0.16);  --accent-tint:rgba(52,195,168,0.07);
   --success:#4ADE80; --warning:#FBBF24; --danger:#F87171;
   --uncertain:#A78BFA; --info:#38BDF8;
   --sev-low:#9AA8A1; --sev-medium:#FBBF24; --sev-high:#FB923C; --sev-critical:#F87171;
   --shadow-card:0 1px 2px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.25);
   --shadow-pop:0 12px 32px rgba(0,0,0,.55);
 }
 @theme inline {
   --color-background:var(--background); --color-foreground:var(--foreground);
   --color-card:var(--card); --color-card-foreground:var(--card-foreground);
   --color-popover:var(--popover); --color-popover-foreground:var(--popover-foreground);
   --color-surface:var(--surface); --color-surface-2:var(--surface-2); --color-surface-hover:var(--surface-hover);
   --color-secondary:var(--secondary); --color-secondary-foreground:var(--secondary-foreground);
   --color-muted:var(--muted); --color-muted-foreground:var(--muted-foreground);
   --color-accent:var(--accent); --color-accent-foreground:var(--accent-foreground);
   --color-border:var(--border); --color-border-strong:var(--border-strong);
   --color-input:var(--input); --color-ring:var(--ring);
   --color-primary:var(--primary); --color-primary-foreground:var(--primary-foreground);
   --color-accent-soft:var(--accent-soft); --color-accent-tint:var(--accent-tint);
   --color-success:var(--success); --color-warning:var(--warning);
   --color-danger:var(--danger); --color-uncertain:var(--uncertain); --color-info:var(--info);
   --color-sev-low:var(--sev-low); --color-sev-medium:var(--sev-medium);
   --color-sev-high:var(--sev-high); --color-sev-critical:var(--sev-critical);
   --font-sans:var(--font-sans-ui); --font-display:var(--font-display); --font-mono:var(--font-jbmono);
   --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:20px; --radius-2xl:28px;
   --shadow-card:var(--shadow-card); --shadow-pop:var(--shadow-pop);
 }
 @layer base {
   * { border-color:var(--border); }
   body { background:var(--background); color:var(--foreground); font-family:var(--font-sans);
          font-size:14px; line-height:1.57; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
   h1,h2,h3 { font-weight:600; letter-spacing:-0.01em; }
   :focus-visible { outline:2px solid var(--ring); outline-offset:2px; }
   ::selection { background:var(--accent-soft); }
 }
 .display { font-family:var(--font-display); font-weight:400; letter-spacing:-0.01em; line-height:1.1; }
 .tabular { font-variant-numeric:tabular-nums; }
 .eyebrow { font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted-foreground); }
 .card { background:var(--card); border:1px solid var(--border); border-radius:20px; box-shadow:var(--shadow-card); }
 .card-hover { transition:border-color .15s ease, box-shadow .15s ease; }
 .card-hover:hover { border-color:var(--border-strong); box-shadow:var(--shadow-pop); }
 .dotgrid { background-image:radial-gradient(var(--border-strong) 1px, transparent 1px); background-size:20px 20px;
   -webkit-mask-image:linear-gradient(to bottom, #000, transparent 85%); mask-image:linear-gradient(to bottom, #000, transparent 85%); opacity:.6; }
 .skeleton { background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface) 50%,var(--surface-2) 75%);
   background-size:200% 100%; animation:shimmer 1.4s linear infinite; border-radius:12px; }
 @keyframes shimmer { to { background-position:-200% 0; } }
 .live-dot { animation:pulse-soft 2s ease-in-out infinite; }
 @keyframes pulse-soft { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.85)} }
 /* heat tints for calendar (level 0..4) */
 .heat-0 { background:transparent; }
 .heat-1 { background:color-mix(in srgb, var(--primary) 7%,  transparent); }
 .heat-2 { background:color-mix(in srgb, var(--primary) 14%, transparent); }
 .heat-3 { background:color-mix(in srgb, var(--primary) 24%, transparent); }
 .heat-4 { background:color-mix(in srgb, var(--primary) 38%, transparent); }
 @media (prefers-reduced-motion:reduce){ .skeleton,.live-dot{animation:none} }
 @media print { header, nav, button { display:none !important; } }
 Radius: inputs/buttons 12, chips 999, cards 20, dialogs 24, hero card 28.
 Icons: lucide-react, strokeWidth 1.75, 16/20/24.

4. LAYOUT (NO SIDEBAR)  ---  components/shared/AppShell.tsx
------------------------------------------------------------------
 DESKTOP >= 1024
  - Sticky TOP BAR 64 px, bg var(--background), 1 px bottom border, no blur.
    Left: BrandMark + centre name (14/600) with Centre ID under it (mono 12
    muted). Centre: PILL NAV. Right: bell (badge), theme toggle, avatar menu.
  - PILL NAV: rounded-full container (bg surface, 1 px border, 4 px padding),
    items 36 px high, 16 px horizontal padding, 14/500, icon 16 + label. The
    active item sits on a sliding card-coloured pill (shadow-card) animated by
    GSAP (9.1). centre_admin items: Home, Attendance, Monitor (dropdown: Live
    room, Calendar), People (Trainees, Staff), Setup (Cameras, Schedule,
    Equipment), Requests, Flags, Notices; "More": Onboarding (until live), Demo
    Lab, Settings. Trainer: Today, Attendance, Live room, Calendar, Flags,
    Notices. Dropdown parents show the active pill when a child route is active.
    A small live dot appears on "Monitor" while monitoring runs in this tab.
  - Content max-width 1120, padding 32, centred. Page top gap 32.
 TABLET 768-1023: top bar with icon-only nav items and tooltips.
 MOBILE < 768
  - Top bar 56 px: brand mark + page title centre, bell right.
  - BOTTOM DOCK: floating (margin 12, radius 24, height 64, bg card, 1 px
    border, shadow-pop, safe-area padding). 5 items (icon 22 + 11 px label).
    Active: icon primary, label foreground, sliding accent-soft pill behind the
    icon (9.1). centre_admin: Home, Attendance, Monitor (bottom sheet: Live
    room, Calendar), People, More (sheet: Flags, Setup items, Requests, Notices,
    Demo Lab, Settings). trainer: Today, Attendance, Calendar, Flags, More
    (Live room, Notices, Settings).
  - Content bottom padding 96. Dialogs become bottom sheets (radius 28 top
    corners, drag handle).
 PAGE HEADER: optional eyebrow, title in font-display 32 (28 mobile), muted
  description 14 (<= 60ch), primary action right (full-width below on mobile),
  24 px gap after.
 STATUS BANNER (below the top bar when needed): full-width strip 40 px, tinted
  background (warning/danger/info 10 %), icon + one sentence + optional link.
  Used for: awaiting approval, suspended, camera reconnecting. Slides down
  0.25 s once (animateIn y:-8).

5. COMPONENT STYLES
------------------------------------------------------------------
 Card         class "card": white, 1 px border, radius 20, soft shadow, padding
              24 (20 mobile). Linked cards use .card-hover.
 Button       height 44 (40 sm), radius 12, weight 600. Primary solid green;
              Secondary surface + border; Ghost; Destructive = danger tint bg +
              danger text (solid only inside confirm). Loading keeps width.
              :active scale .98 80 ms.
 Input        height 48, radius 12, 16 px text, 1 px border, focus ring 2 px
              primary, label 14/600 above, helper 12 muted below.
 Chip         28 px high, radius 999, 12/600, tinted bg 10 %, 1 px border 25 %,
              icon 12 + label. UNCERTAIN = violet text, DASHED border, help icon.
 Lists        AIRY LISTS: 64 px rows inside a card, 16 px padding, title 14/600 +
              meta 12 muted, right side chip + chevron, 1 px dividers. Wide data
              (trainees) may use a 56 px-row table, eyebrow header, no zebra.
 Dialog       radius 24, shadow-pop, padding 32, title sans 20/600, footer
              buttons full-width stacked on mobile.
 Stat tile    card, eyebrow label, value in display 40 via <CountUp/>, helper
              line, optional ring/meter. 4 per row desktop, 2 mobile.
 Progress     Meter 10 px, radius 999, track surface-2, fill primary (warning
              >= 90 %, danger 100 %). ProgressRing 72 px.
 Empty state  centred in card, 56 px circle accent-tint with 24 px primary line
              icon, serif 20 title ("Nothing here yet"), muted sentence, button.
 Avatar       initials circle 36 px, accent-soft bg, primary text 600.
 Sheet/drawer right drawer 480 (full width mobile), radius 24 on the open edge.
 LiveStateChip  Monitoring (green, live dot) | Paused (grey) | Waiting for
              session (info) | Camera problem (amber) | Setup pending (violet,
              dashed). Always icon + label.
 ItemTile     rounded-16 tile on surface: 40 px icon tile (accent-tint) + class
              label 14/600 + "present N" meta + big "M in use" (display 28) +
              10 px Meter (in use / present).

6. KEY SCREEN DESIGNS
------------------------------------------------------------------
 6.1 LOGIN (and /change-password)
  Desktop split 50/50. LEFT: bg accent-tint over background, .dotgrid top,
  BrandMark, headline display 48 "Your centre, supported.", one muted sentence,
  three check lines (anonymous counting, blurred evidence, staff-only face
  check), and at the bottom a static inline-SVG "classroom plan" (room
  rectangle, desk dots, camera icon with a soft cone; currentColor strokes in
  primary at 40 %). RIGHT: form card (max 420, radius 28, shadow-card): title
  "Welcome back" (display 32), Centre ID or Trainer ID field (mono placeholder
  DSK-WB-0001), password with show/hide, "Sign in" full width; below: links
  "Apply for a new centre" and "Track application". Mobile: left panel becomes a
  120 px tinted header with brand mark + headline 28. Motion: login timeline
  (6B) + classroom-plan strokes draw once (0.9 s total, stagger 0.08).
 6.2 HOME / DASHBOARD (centre_admin)
  a) HERO CARD (radius 28, bg accent-tint, 1 px border, dotgrid corner):
     eyebrow = today's date (IST), greeting display 40 "Good morning, <first word
     of centre name>" (by IST hour), muted summary line, right: status chip LIVE or
     setup state + primary button "Mark attendance".
  b) 4 STAT TILES: Today's sessions, Enrolled / max (Meter), Open flags, Camera
     (online/offline/tampered chip; the tile links to /live).
  c) "RIGHT NOW" CARD (only when a camera reports): People (display 64 CountUp),
     up to 3 ItemTiles, state chip, "updated 4 s ago", button "Open Live room".
  d) TWO COLUMNS (7/5): LEFT "Today" session rail (6.3). RIGHT stacked cards:
     "Needs your attention" (unread notices, open flags, pending requests as 56 px
     rows) and "Quick actions" (grid of 5 icon buttons: Mark attendance, Add
     trainee, Declare repair, New request, Open Live room).
 6.3 SESSION RAIL (vertical timeline)
  Row = time label (mono 12), node on a 2 px vertical line, card: batch name
  14/600, trainer, time range, state chip (Upcoming grey | Active green with live
  dot | Closed | Missed amber). When data exists: "Claimed 12" and "Camera saw 7"
  (sans 20/600) and a thin comparison bar with neutral text "5 fewer than
  claimed". Active node has a ring. Line grows first, then rows stagger (9.3).
 6.4 TRAINER HOME (mobile first)
  Hero shrinks to greeting + date. One large session card per session (radius
  24, padding 24): time, batch, state chip, two stacked 56 px buttons "1. Verify
  yourself" (green tick when done) and "2. Mark attendance" (disabled until
  verified, helper text), plus a secondary "Open Live room". Below: "My flags"
  count row and latest notice row.
 6.5 ATTENDANCE (trainer/admin)
  Session picker as a segmented control; 2-step progress bar.
  STEP 1 "Verify yourself": rounded camera frame (3:4 mobile, 4:3 desktop,
  radius 24, 1 px border), SVG oval face guide (primary 2 px, outside dimmed
  rgba(0,0,0,.35) with an SVG mask), "Scan" button 56 px. One scan line sweeps
  once (9.4); success: oval stroke turns success + tick draws (0.25 s); failure:
  frame shakes + advice ("Move closer to the light and face the camera"). Privacy
  line in a surface block with a shield icon.
  STEP 2 "Mark trainees": 60 px rows (name 14/600, external ID mono 12 muted,
  28 px rounded-lg checkbox right, whole row tappable; checked row bg
  accent-tint + 3 px primary left edge), search + Select all / Clear. STICKY
  BOTTOM BAR (card, shadow-pop, safe-area): "Present" label + CountUp "24 / 30"
  (display 28), thin Meter, primary "Submit". After submit: lock icon +
  "Submitted at 9:42 am" + ghost "Edit (needs reason)"; bar flashes.
 6.6 ONBOARDING
  Centred column (max 720). ProgressRing 96 with "3 of 5" (display 28) and title
  "Let's get your centre live" (display 32). 5 checklist cards (56-72 px): numbered
  circle -> check icon that DRAWS when done, title, helper, status chip, arrow.
  Locked step 5 shows a lock + missing steps. Awaiting approval: calm info card
  with hourglass, "Waiting for the department", relative time. LIVE: success card
  with check-ring draw, "Your centre is live" + "Go to home". Tip card (info
  tint): "You can try the Live room before approval." No confetti.
 6.7 CAMERAS + ROI EDITOR
  Cameras list = cards (thumbnail tile with a camera icon on surface-2 or the
  blurred reference frame, name, source kind chip, source mono 12, status chips,
  switch "Monitoring enabled", interval select). Add-camera dialog: segmented
  control for source type (This computer's webcam | Server webcam | Network
  camera | Sample video).
  ROI editor: two columns desktop (frame 8/12, panel 4/12), stacked on mobile
  with the panel BELOW the frame. Frame container: card, radius 20, padding 12,
  image radius 12. For BROWSER cameras the editor opens with a "Capture a
  reference picture" state: live preview in the same rounded frame, big Capture
  button, then Retake / Use this picture. Mode switch = segmented control
  ("Classroom area" | "Workstation zones"). Handles 16 px primary with 3 px
  white ring and 44 px touch padding; polygon fill accent-soft, stroke primary
  2 px non-scaling; zone label chip at the centroid. Quality panel = 3 rows
  (icon, label, verdict chip, advice). Buttons: ghost Undo/Clear, secondary Save
  draft, primary Submit (sticky bottom bar on mobile). ROI rules: container uses
  the reference image aspect ratio; overlay <svg viewBox="0 0 1 1"
  preserveAspectRatio="none"> with vector-effect non-scaling-stroke; handles are
  absolutely positioned HTML elements at left:x*100%, top:y*100%; points stored
  normalised 0..1 with 4 decimals; pointer events for mouse + touch; min 3
  points; area > 0.02; reload reproduces exactly. Helpers lib/roi.ts: toNorm(e,
  el), toPoints(poly), area(poly) (shoelace).
 6.8 SCHEDULE
  Left: batch cards. Right (desktop)/below (mobile): WEEK GRID, 7 columns Mon..Sun,
  time axis 6:00-20:00, batches as rounded blocks tinted accent-soft with name +
  time; holidays as hatched columns. Block entrance scaleY .9 -> 1 + fade, stagger
  .03 (max 10). Add/edit batch in a right drawer / bottom sheet.
 6.9 STAFF + FACE ENROL
  Staff = list rows (initials avatar, name, role chip, face status chip, active
  switch, kebab). Face enrol page: centred card (max 520): consent block first
  (surface bg, shield icon, plain text, required 28 px checkbox), then the same
  oval camera frame as 6.5. Capture -> preview thumbnail shown only in memory
  ("Enrol" / "Retake"); after Enrol the preview and stream are destroyed. Success
  tick draw; failure shake.
 6.10 TRAINEES
  Wide cap card "38 of 40 seats used" (display 28), Meter 10 px, right button
  "Add trainee" (at cap: "Request extra seats" with lock). Below: search + batch
  segmented filter, list rows (name, ID mono, batch chip, kebab -> Deactivate).
  CSV import dialog with preview table and result summary.
 6.11 EQUIPMENT
  Card grid (2-3 columns desktop, 1 mobile): label 14/600, big "declared /
  sanctioned" numerals (display 32), stepper (44 px +/-) to edit declared, observed
  status chip, "In use 63 % this week" with a Meter, last observed date. Mismatch =
  soft amber note. "Declare repair" and "Request more" as header buttons.
 6.12 REQUESTS, FLAGS, NOTICES
  Airy list pattern. Requests: segmented control by kind, status chips, officer
  comment in a quote block (3 px left border). FLAGS: each flag = card with type
  icon in a tinted square, plain-language title ("A difference between your
  attendance and the camera count"), numbers line, evidence strip (3 tiles 72 px,
  SignedImage, radius 12), status chip, "Respond" button, link "See this day".
  Detail = right drawer with why-text, lightbox, timeline rail, response form.
  Uncertain flags: violet dashed chip + reassurance sentence. NOTICES: inbox with
  level icon tiles (advisory/notice info, warning amber, suspension/termination
  red), unread dot, detail drawer with reply box.
 6.13 SETTINGS: card sections (Profile, Security, Appearance -> theme segmented
  Light/Dark/System, Privacy -> data-use notice, Session -> Logout).
 6.14 DEMO LAB (judges)
  Header chip "Demo". LEFT control card (camera, session, scenario as 5 selectable
  tile cards with small icons, claimed attendance input with +/-, primary "Run
  session analysis"). RIGHT "Pipeline" card: 6 steps as a vertical list; circle
  that fills + label + sentence. RESULT card: 3 blurred thumbnails, count-history
  bar chart with dashed claimed line, two big numbers (Claimed / Camera saw,
  display 48, CountUp), verdict banner ("Difference found: 5 fewer than claimed"
  amber, or "Matches" green), flags raised as chips. OFFLINE panel: switch
  "Simulate offline", counter "Unsynced records" (display 32), "Go online and
  sync", chain chip "Ledger verified". Honest label: "Step animation is
  illustrative; results are from the real run." Link card "Prefer a live demo?
  Open the Live room."
 6.15 PUBLIC /apply and /apply/track
  Calmer feel: slim top bar (brand + "Track application"), hero display 40 "Start
  a skilling centre". Form card centred (max 720, radius 28). Stepper =
  segmented progress bar with 5 labelled dots. Step panels slide with
  animateStep. Equipment rows show a "from template" chip. Plausibility hint =
  amber tinted note. Success = tracking-code card: serif "Application received",
  code mono 28 on a surface block, Copy, "What happens next" (3 numbered lines).
  TRACK: code + phone card; vertical status rail with officer comment in a quote
  block; resubmit form in a card below.

 6.16 LIVE ROOM  (/live; the most important new screen; make it feel alive)
  Header: eyebrow "Monitor", title (display 32) "Live room", description "Use
  this computer's camera to watch the room during a session." Right: LiveStateChip.
  PRE-FLIGHT STATE (before Start): centred card (max 640, radius 28) with a
  4-step checklist, each a row with a numbered circle -> check when done:
    1 Choose camera (select; "Add this computer as a camera" button)
    2 Session (active session label + time left, or "No session right now" +
      "Start a demo session" with 30 / 60 / 120 min segmented control)
    3 Check interval (segmented 5 s | 10 s | 30 s | 60 s)
    4 Allow camera (button; denied -> info callout with browser steps)
  Primary "Start monitoring" 56 px is disabled until 1, 2 and 4 are done.
  RUNNING STATE: two columns desktop (7/5), stacked on mobile (frame first).
   LEFT: rounded camera frame (4:3, radius 24, 1 px border, shadow-card) with the
   local <video> preview and a transparent <canvas> overlay. Boxes: people in
   --primary 2 px strokes, other classes in --info 2 px strokes, labels as small
   chips (12/600, card-colour backing) at the top-left of each box. The boxes
   glide to new positions with a 0.2 s GSAP tween (canvas redraw using lerped
   values) instead of jumping. Over the frame: top-left LiveStateChip, top-right
   mono time "9:42:15 am", bottom bar (card 90 % opacity) with "Sending every 10 s",
   a 10 px pulse dot that flashes once per accepted frame, and the Stop button.
   When tampered: a centred frosted-free message card "The picture looks too dark
   or covered. Check the lens and lighting." (amber tint).
   RIGHT: "Right now" card: People (display 64, CountUp 0.3 s) with label "people
   in the room", a thin line "Claimed 12" when a claim exists, then a 2-column
   grid of ItemTiles (Chairs, Desks, Monitors, others; max 6, then "+n"), then
   "Today so far" mini card: updates sent (CountUp), peak people, average, sparkline
   of the last 60 smoothed values.
   Below (full width): privacy block (shield, surface bg): "Camera pictures are
   analysed on the centre's server and discarded immediately. Only counts and
   blurred thumbnails are kept. Faces are never identified."
   BANNERS: "Reconnecting..." (warning) with backoff; "Session ended. Monitoring
   stopped." (info); "Keep this tab open and the screen awake" (info, dismissible).
   Mobile: frame full width, right column cards stacked, Start/Stop in a sticky
   bottom bar above the dock.
 6.17 CALENDAR  (/calendar; read-only; trainer and admin)
  Header: eyebrow "Monitor", title "Calendar", description "See what the camera
  recorded on any day." Controls row: month title (sans 20/600), prev/next icon
  buttons (44 px), "Today", segmented Month | Year, legend chips (All matched,
  Worth a look, Needs your response, No camera data, Holiday, Scheduled).
  Summary strip (card, 4 mini stats): Total updates, Days with data, Average
  people, Flags to respond to.
  MONTH GRID (card, radius 28, padding 24): weekday header (12 eyebrow), grid 7
  columns, gap 8. DAY CELL (button, radius 16, 1 px border, padding 12, min-height
  104 desktop / 68 mobile):
    top: date (mono 12), status icon (16) right;
    middle: "412" (sans 14/600 tabular) + "updates"; Users icon + average people;
    bottom: difference chip when claimed and camera exist ("2 fewer" amber,
      "Matched" green, "3 more" info) and a 6 px intensity bar (primary on
      surface-2, width = updates / month max, radius 999).
    background heat-<level>; holiday = hatched + CalendarOff icon; scheduled =
    dashed border + Clock icon; today = 2 px primary ring; selected = 2 px primary
    border + accent-soft layer. Mobile: show only date, status icon, a heat tint
    and the updates number; tapping opens the sheet.
  Status wording (with icons, never colour only): All matched (check), Worth a
  look (alert-triangle), Needs your response (alert-octagon), No camera data
  (minus), Holiday (calendar-off), Scheduled (clock).
  YEAR VIEW: 12 months in a 4x3 grid (2x6 mobile) of 12 px rounded squares with
  heat tints; tooltip "9 Oct: 412 updates"; click opens the month.
  DAY SHEET: right drawer 480 px (bottom sheet on mobile, 92 % height, handle).
  Header: date in display 28, status chip, previous/next day buttons. Stat row
  (4): Updates, People peak / average, Claimed vs Camera, Camera uptime. Tabs with
  sliding underline: Sessions | Timeline | Equipment | Flags | Pictures | Updates.
   Sessions: rail of session cards with claimed vs camera saw, range, staff
     verified tick, snapshots count and neutral sentence.
   Timeline: area chart of people over time (primary stroke 2 px, fill 10 %),
     session bands (accent-tint), claimed dashed line, class chips to add up to 3
     in-use lines; text summary below.
   Equipment: ItemTile-style rows: class, present avg/max, in-use % Meter, status
     chip.
   Flags: flag cards with "Respond" links.
   Pictures: 3-column grid of 16:9 SignedImage tiles (radius 12) with mono times
     and lightbox.
   Updates: segmented Feed | Raw snapshots. Feed = vertical rail (like 6.3).
     Raw = list rows (time mono, people, "Chairs 5/8, Monitors 4/6") with "Load
     more".
  Empty day: illustration-free empty state with the reason (Holiday / No session
  that day / The camera was not running).
  Selection is URL-driven (?date=YYYY-MM-DD) so Back closes the sheet.

7. ICONOGRAPHY, IMAGERY, COPY
------------------------------------------------------------------
 - lucide icons only, strokeWidth 1.75. Icon tiles: 40 px rounded-12 squares with
   accent-tint bg.
 - No stock photos, no emoji, no mascots. Illustration = the single static
   classroom-plan SVG (login) and empty-state icons.
 - Copy: warm, plain, second person ("You have 2 sessions today"). Never
   "violation", "fraud", "suspicious". Use "difference", "could not verify",
   "please review".
 - Privacy reassurance line (shield icon, surface block) on cameras, attendance,
   face enrol, Live room and demo pages.

8. ACCESSIBILITY AND RESPONSIVE
------------------------------------------------------------------
 - Primary green on white >= 4.5:1; dark mode uses dark text on bright green
   (tokens above). Re-check chips on tinted backgrounds and heat cells (text
   always foreground colour).
 - Touch targets >= 44 px; roster rows 60 px; dock items 48 px; calendar cells
   >= 44 px.
 - Bottom dock and sticky bars respect env(safe-area-inset-bottom).
 - Face, ROI and Live room screens work in portrait and landscape.
 - Focus ring visible on pill nav items, dock items and calendar cells.
 - Calendar grid: role="grid", roving tabindex, arrows/PageUp/PageDown/Home/End,
   full-sentence aria-labels ("9 October, 412 updates, 2 sessions, matched").
 - aria-live="polite" announces Live room state changes only (Monitoring,
   Paused, Camera problem), not every update.
 - Respect prefers-reduced-motion everywhere; canvas box tweening becomes an
   instant redraw.

9. GSAP ADDITIONS (build in lib/motion.tsx, extend 6B; same rules R1-R11)
------------------------------------------------------------------
 9.1 SLIDING PILL (top nav desktop; bottom dock mobile)
   export function useSlidingPill(activeKey: string, deps: any[] = []) {
     const listRef = useRef<HTMLElement>(null);
     const pillRef = useRef<HTMLSpanElement>(null);
     const first = useRef(true);
     useGSAP(() => {
       const a = listRef.current?.querySelector<HTMLElement>(`[data-nav="${activeKey}"]`);
       if (!a || !pillRef.current) { gsap.set(pillRef.current, { opacity: 0 }); return; }
       const to = { x: a.offsetLeft, y: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight, opacity: 1 };
       if (first.current || !motionOk()) { gsap.set(pillRef.current, to); first.current = false; }
       else gsap.to(pillRef.current, { ...to, duration: DUR.base, ease: EASE.out });
     }, { scope: listRef, dependencies: [activeKey, ...deps] });
     return { listRef, pillRef };
   }
   // Markup: <nav ref={listRef} className="relative ..."><span ref={pillRef}
   //   className="absolute left-0 top-0 rounded-full bg-card shadow-card" aria-hidden />
   //   items are position:relative z-10 with data-nav="<key>". On resize,
   //   recompute with a ResizeObserver calling gsap.set.
 9.2 HERO ENTRANCE (home): one timeline on first ready only
   useGSAP(() => { if (!ready || !motionOk()) return;
     gsap.timeline({ defaults: { ease: EASE.out } })
       .from("[data-hero-eyebrow]", { opacity: 0, y: 6, duration: DUR.base, clearProps: "transform,opacity" })
       .from("[data-hero-title]", { opacity: 0, y: 10, duration: DUR.page, clearProps: "transform,opacity" }, "-=0.15")
       .from("[data-hero-sub], [data-hero-action]", { opacity: 0, y: 8, duration: DUR.base, stagger: 0.05, clearProps: "transform,opacity" }, "-=0.2")
       .from("[data-stat]", { opacity: 0, y: 8, duration: DUR.base, stagger: 0.05, clearProps: "transform,opacity" }, "-=0.1");
   }, { scope: pageRef, dependencies: [ready] });
 9.3 SESSION / STATUS RAIL (home, flags drawer, track page, day sheet feed)
   export function useRail(ready: boolean) {
     const ref = useRef<HTMLDivElement>(null);
     useGSAP(() => { if (!ready || !motionOk() || !ref.current) return;
       const line = ref.current.querySelector("[data-rail-line]");
       const rows = gsap.utils.toArray<HTMLElement>("[data-rail-row]", ref.current).slice(0, 10);
       const tl = gsap.timeline({ defaults: { ease: EASE.out } });
       if (line) tl.fromTo(line, { scaleY: 0, transformOrigin: "top" }, { scaleY: 1, duration: 0.4, clearProps: "transform" });
       tl.from(rows, { opacity: 0, x: 8, duration: DUR.base, stagger: 0.035, clearProps: "transform,opacity" }, "-=0.25");
     }, { scope: ref, dependencies: [ready] });
     return ref;
   }
 9.4 FACE SCAN SWEEP (one shot 1.2 s, exception to the 0.4 s cap)
   export function scanSweep(line: Element | null, frame: Element | null, onDone: () => void) {
     if (!line || !frame || !motionOk()) { onDone(); return; }
     gsap.fromTo(line, { top: "0%", opacity: 1 }, { top: "100%", duration: 1.2, ease: "power1.inOut",
       onComplete: () => { gsap.set(line, { opacity: 0 }); onDone(); } });
   }
 9.5 DRAW-ON-SVG (login plan, checklist ticks, success rings)
   export function drawSvg(root: Element | null, sel = "[data-draw]", stagger = 0.08) {
     if (!root || !motionOk()) return;
     const els = gsap.utils.toArray<SVGGeometryElement>(sel, root);
     els.forEach(el => { const l = el.getTotalLength?.() ?? 0; gsap.set(el, { strokeDasharray: l, strokeDashoffset: l }); });
     gsap.to(els, { strokeDashoffset: 0, duration: 0.5, ease: EASE.out, stagger, clearProps: "strokeDasharray,strokeDashoffset" });
   }
 9.6 GENERAL
   - Card grids (equipment, cameras, flags): useStagger(ready) max 10.
   - Week-grid blocks: from { opacity:0, scaleY:.9, transformOrigin:"top" } stagger .03.
   - Drawers/sheets/dialogs: shadcn CSS only (Radix unmount).
   - Pipeline steps (demo): 6B section 9. Verdict banner: animateIn y:8 then flash().
   - Status banner: animateIn({ y:-8 }) once on mount.
   - No animation on polling refetch (R5). New list rows: flash() only.
 9.7 LIVE ROOM MOTION
   // box glide on the overlay canvas (called after each FrameResponse)
   export function tweenBoxes(state: { boxes: Box[] }, next: Box[], redraw: () => void) {
     if (!motionOk()) { state.boxes = next; redraw(); return; }
     const prev = state.boxes;                              // match by index + class
     const t = { k: 0 };
     gsap.to(t, { k: 1, duration: 0.2, ease: "none",
       onUpdate: () => { state.boxes = next.map((b, i) => {
           const p = prev[i]; return p && p.cls === b.cls
             ? { ...b, x1: p.x1 + (b.x1 - p.x1) * t.k, y1: p.y1 + (b.y1 - p.y1) * t.k,
                 x2: p.x2 + (b.x2 - p.x2) * t.k, y2: p.y2 + (b.y2 - p.y2) * t.k } : b; });
         redraw(); } });
   }
   // pulse dot: on each accepted frame gsap.fromTo(dot, { scale: 1.6, opacity: 1 }, { scale: 1, opacity: .6, duration: .3 })
   // numbers: CountUp 0.3 s; ItemTile Meter animates 0.4 s on change; chip change = flash()
   // pre-flight checklist: tick draws (drawSvg) when a step completes; "Start monitoring"
   //   button enabled state change is instant; entering RUNNING: pre-flight card fades out
   //   0.2 s then the two columns animateIn (y:6) once.
 9.8 CALENDAR MOTION (exception: up to 42 items, 0.008 s stagger)
   export function useCalendarEnter(monthKey: string, ready: boolean, dir: 1 | -1 = 1) {
     const ref = useRef<HTMLDivElement>(null);
     useGSAP(() => { if (!ready || !ref.current || !motionOk()) return;
       const cells = gsap.utils.toArray<HTMLElement>("[data-cell]", ref.current);
       gsap.fromTo(ref.current, { x: 12 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: DUR.base, ease: EASE.out, clearProps: "transform,opacity" });
       gsap.from(cells, { opacity: 0, y: 4, duration: DUR.base, stagger: 0.008, ease: EASE.out, clearProps: "transform,opacity" });
       gsap.from("[data-bar]", { scaleX: 0, transformOrigin: "left", duration: DUR.meter, stagger: 0.008, clearProps: "transform" });
     }, { scope: ref, dependencies: [monthKey, ready] });
     return ref;
   }   // runs only when the month changes or first becomes ready, never on polling
   // year view squares: from { opacity: 0 } stagger 0.002 once per year change
   // day sheet: Radix CSS slide; tab content animateIn; numbers CountUp; timeline draws once
 9.9 PER-SCREEN MOTION MAP (build every row; nothing extra)
   /login          login timeline + classroom-plan draw; shake on error
   /change-password card enter; strength Meter
   top nav/dock    sliding pill
   Home            hero timeline; stat CountUp; "Right now" CountUp; session rail; attention rows stagger
   Trainer home    session cards stagger; verify tick draw on success
   Attendance      animateStep between steps; scan sweep; roster instant; bottom-bar CountUp + flash on submit
   Onboarding      ProgressRing + CountUp; checklist stagger; tick draw; LIVE ring draw
   Cameras/ROI     card stagger; point scale-in 0.15 s; chips fade; capture-step crossfade
   Schedule        week-grid block stagger
   Staff/Face      row stagger; tick draw; shake on failure
   Trainees        cap Meter animate; rows stagger
   Equipment       card stagger; stepper CountUp 0.3 s; chip flash; in-use Meter 0.4 s
   Requests/Flags/Notices   row/card stagger; unread badge flash
   Demo Lab        pipeline (6B 9) + verdict banner + CountUp numbers
   Live room       9.7 (box glide, pulse dot, CountUp, tile Meters, pre-flight ticks)
   Calendar        9.8 (month enter, bars, year squares), sheet tabs animateIn, timeline draws once
   /apply          animateStep; success card scale .98 -> 1
   /apply/track    rail (9.3)

10. DO NOT (Centre-specific)
------------------------------------------------------------------
 No sidebar, no Inter, no DM Serif Display outside headings/hero numbers, no
 second brand colour, no hover transforms, no confetti, no stock photos or
 emoji, no accusatory words, no dense admin-style tables on mobile, no face
 previews or camera frames kept in state, no direct <img> to /files URLs, no
 framer-motion, no Supabase, no glassmorphism or heavy shadows, no looping
 decorative animation (only the CSS Live dot), no colour-only status.

11. DEFINITION OF DONE (Centre UI self-check)
------------------------------------------------------------------
 [ ] Plus Jakarta Sans + DM Serif Display + JetBrains Mono via next/font only
 [ ] Warm paper light theme and green-tinted dark theme both verified
 [ ] Top nav pill slides (desktop); floating dock with pill (mobile)
 [ ] Hero card, stat tiles, "Right now" card, session rail match section 6
 [ ] Attendance: oval face guide, one-shot scan sweep, 60 px roster rows, sticky
     bottom bar with CountUp
 [ ] ROI editor usable by touch at 390 px; round-trip exact; browser cameras can
     capture a reference picture
 [ ] Live room: pre-flight checklist, camera frame with glided boxes, ItemTiles,
     People 64, state chips, banners, sticky mobile controls
 [ ] Calendar: month grid with heat, status icons, difference chips, year view,
     day sheet with six tabs, keyboard navigation, URL-driven selection
 [ ] Equipment cards, trainee cap card, week grid implemented
 [ ] Demo Lab looks polished: tiles, pipeline, verdict, offline panel
 [ ] Every page has loading (mirrored), empty, error states
 [ ] Status and severity never colour-only; wording stays supportive
 [ ] No animation replays on polling; reduced motion respected
 [ ] Evidence and live images only via SignedImage; no face data or camera frames
     kept anywhere
 [ ] Spacing from 4/8/12/16/24/32/48 (+64 page top) only