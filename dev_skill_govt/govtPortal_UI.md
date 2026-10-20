==================================================================
 DEV_SKILL UI/UX PLAN  (6A of 2) v3: DESIGN SYSTEM, LAYOUT, COMPONENTS
 Applies to dev_skill_gov (Government portal). The Centre portal has its
 own theme file (6C v3) and only reuses the shared RULES below.
 Read together with 6B (GSAP motion), M5 (auth patch), Gov page plan v3.
==================================================================

0. RULES FOR THE AI BUILDER (read first, obey exactly)
------------------------------------------------------------------
 1. Stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui.
    Check the installed Tailwind version. v4: tokens go in globals.css
    with @theme inline (shown below). v3: map the same CSS variables in
    tailwind.config.ts.
 2. Animation: GSAP + @gsap/react ONLY (6B + section 8C). Do NOT install
    framer-motion. CSS transitions ONLY for hover colour/border changes,
    focus rings and the CSS-only loops (skeleton shimmer, Live dot).
 3. Fonts: ONLY next/font/google (Inter + JetBrains_Mono). No <link> tags
    to Google, no @import url(...), no other fonts.
 4. One accent colour per app, stored in --primary. In shadcn --accent means
    "subtle hover surface". NEVER put the brand colour in --accent.
 5. Every colour comes from a CSS variable. No hard-coded hex inside
    components (except in globals.css).
 6. Every data page has 4 states: loading (skeleton), empty (EmptyState),
    error (ErrorState with Retry), success.
 7. Status and severity are never shown by colour alone: colour + icon or text.
 8. All strings live in lib/strings.ts and lib/constants.ts.
 9. Do not add pages, features, colours or animations not listed.
10. Test widths: 390, 768, 1024, 1440, in light AND dark.
11. NO SUPABASE. Auth = lib/auth.ts + lib/api.ts (patch M5). Env file
    contains NEXT_PUBLIC_API_URL only.
12. Evidence, live thumbnails and document images: relative signed URLs must
    be loaded ONLY through hooks/useSignedImage.ts (fetch + ngrok header ->
    blob URL). Never use them in <img src> or next/image.
13. Visual quality bar: follow section 8B (Polish layer) and 8C (Live and
    Calendar) on every page. A page that works but ignores them is not finished.
14. LIVE DATA IS NEVER REPLAYED AS ANIMATION: polling updates only change
    numbers (CountUp), chips (flash) and thumbnails (crossfade).

1. DESIGN PRINCIPLES
------------------------------------------------------------------
 - Calm, quiet, data-first. White space over decoration.
 - Flat surfaces, 1 px borders, no shadows except popovers/dialogs.
 - No gradients (exceptions: skeleton shimmer, login grid mask).
 - Colour only for meaning: status, severity, the primary action.
 - Each screen answers one question. Remove anything that does not.
 - Plain language: "Camera saw 7, centre claimed 12."
 - Premium comes from precision: consistent spacing, tight type hierarchy,
   aligned numbers, restrained colour, smooth purposeful motion.
 - Gov tone: precise and neutral.

2. PACKAGES (install commands)
------------------------------------------------------------------
 npm i gsap @gsap/react next-themes @tanstack/react-query \
   react-hook-form zod @hookform/resolvers recharts react-leaflet \
   leaflet lucide-react sonner clsx tailwind-merge \
   class-variance-authority qrcode.react
 npm i -D @types/leaflet
 npx shadcn@latest init
 npx shadcn@latest add button input textarea select checkbox switch \
   tabs card table badge dialog sheet tooltip skeleton dropdown-menu \
   popover calendar separator sonner label form toggle-group
 (GSAP and its plugins are free in current releases.)

3. FONTS (next/font/google)  ---  FILE: app/layout.tsx
------------------------------------------------------------------
 import type { Metadata } from "next";
 import { Inter, JetBrains_Mono } from "next/font/google";
 import { ThemeProvider } from "next-themes";
 import Providers from "./providers";      // React Query + Toaster
 import "./globals.css";
 const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
 const jbmono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jbmono" });
 export const metadata: Metadata = { title: "Dev_Skill Government Portal" };
 export default function RootLayout({ children }: { children: React.ReactNode }) {
   return (
     <html lang="en" className={`${inter.variable} ${jbmono.variable}`} suppressHydrationWarning>
       <body>
         <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
           <Providers>{children}</Providers>
         </ThemeProvider>
       </body>
     </html>
   );
 }
 Usage: body = font-sans (Inter). Centre ID, temporary password, hashes,
 tracking codes, table timestamps, calendar dates = font-mono. Weights
 400, 500, 600 only. Tabular numbers only via .tabular.

4. DESIGN TOKENS  ---  FILE: app/globals.css
------------------------------------------------------------------
 @import "tailwindcss";
 @import "tw-animate-css";      /* shadcn v4. On v3 use tailwindcss-animate */
 @custom-variant dark (&:is(.dark *));
 :root {
   --background:#FFFFFF;  --foreground:#09090B;
   --card:#FFFFFF;        --card-foreground:#09090B;
   --popover:#FFFFFF;     --popover-foreground:#09090B;
   --surface:#FAFAFA;     --surface-2:#F4F4F5;   --surface-hover:#F7F7F8;
   --secondary:#F4F4F5;   --secondary-foreground:#09090B;
   --muted:#F4F4F5;       --muted-foreground:#71717A;
   --accent:#F4F4F5;      --accent-foreground:#09090B;   /* hover surface, NOT brand */
   --border:#E4E4E7;      --border-strong:#D4D4D8;  --input:#E4E4E7;  --ring:var(--primary);
   --primary:#4338CA;     --primary-foreground:#FFFFFF;
   --accent-soft:rgba(67,56,202,0.08);
   --success:#16A34A; --warning:#D97706; --danger:#DC2626;
   --uncertain:#7C3AED; --info:#0284C7;
   --sev-low:#64748B; --sev-medium:#D97706; --sev-high:#EA580C; --sev-critical:#DC2626;
   --shadow-pop:0 8px 24px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
   --radius:0.5rem;
 }
 .dark {
   --background:#0A0A0B; --foreground:#FAFAFA;
   --card:#111113; --card-foreground:#FAFAFA;
   --popover:#111113; --popover-foreground:#FAFAFA;
   --surface:#111113; --surface-2:#18181B; --surface-hover:#151518;
   --secondary:#18181B; --secondary-foreground:#FAFAFA;
   --muted:#18181B; --muted-foreground:#A1A1AA;
   --accent:#18181B; --accent-foreground:#FAFAFA;
   --border:#27272A; --border-strong:#3F3F46; --input:#27272A;
   --primary:#6366F1;  /* verify AA with white text; darken if it fails */
   --accent-soft:rgba(99,102,241,0.14);
   --shadow-pop:0 8px 24px rgba(0,0,0,.5);
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
   --color-accent-soft:var(--accent-soft);
   --color-success:var(--success); --color-warning:var(--warning);
   --color-danger:var(--danger); --color-uncertain:var(--uncertain); --color-info:var(--info);
   --color-sev-low:var(--sev-low); --color-sev-medium:var(--sev-medium);
   --color-sev-high:var(--sev-high); --color-sev-critical:var(--sev-critical);
   --font-sans:var(--font-inter); --font-mono:var(--font-jbmono);
   --radius-sm:6px; --radius-md:8px; --radius-lg:12px; --radius-xl:16px;
   --shadow-pop:var(--shadow-pop);
 }
 @layer base {
   * { border-color: var(--border); }
   html { scroll-behavior: smooth; }
   body { background:var(--background); color:var(--foreground);
          font-family:var(--font-sans); font-size:14px; line-height:1.5;
          -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
   h1,h2,h3 { letter-spacing:-0.02em; font-weight:600; }
   :focus-visible { outline:2px solid var(--ring); outline-offset:2px; }
   ::selection { background:var(--accent-soft); }
 }
 .tabular { font-variant-numeric: tabular-nums; }
 .eyebrow { font-size:12px; font-weight:500; letter-spacing:.04em; text-transform:uppercase; color:var(--muted-foreground); }
 .card-hover { transition: border-color .15s ease, background-color .15s ease; }
 .card-hover:hover { border-color: var(--border-strong); background: var(--surface-hover); }
 .skeleton { background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface) 50%,var(--surface-2) 75%);
             background-size:200% 100%; animation:shimmer 1.4s linear infinite; border-radius:8px; }
 @keyframes shimmer { to { background-position:-200% 0; } }
 .live-dot { animation:pulse-soft 2s ease-in-out infinite; }
 @keyframes pulse-soft { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.85)} }
 .login-grid { background-image:
     linear-gradient(var(--border) 1px, transparent 1px),
     linear-gradient(90deg, var(--border) 1px, transparent 1px);
   background-size:48px 48px;
   -webkit-mask-image:radial-gradient(ellipse at center, #000 20%, transparent 70%);
           mask-image:radial-gradient(ellipse at center, #000 20%, transparent 70%); opacity:.5; }
 /* heat tints for calendar cells and year squares (level 0..4) */
 .heat-0 { background:transparent; }
 .heat-1 { background:color-mix(in srgb, var(--primary) 6%,  transparent); }
 .heat-2 { background:color-mix(in srgb, var(--primary) 12%, transparent); }
 .heat-3 { background:color-mix(in srgb, var(--primary) 20%, transparent); }
 .heat-4 { background:color-mix(in srgb, var(--primary) 32%, transparent); }
 @media (prefers-reduced-motion: reduce) { .skeleton, .live-dot { animation:none; } }
 @media print { aside, header, nav, button { display:none !important; } body { font-size:12px; } }
 Scale: radius 8 inputs/buttons, 12 cards, 16 dialogs, 999 chips.
 Spacing: 4, 8, 12, 16, 24, 32, 48 (use ONLY these). Content max-width 1280.
 Type: 12 meta, 14 body, 16 inputs, 20 section title, 28 page title, 36 hero
 numbers (login panel, big KPI, live people count). Icons: lucide-react,
 16 inline, 20 nav, strokeWidth 1.5. Shadow ONLY on popover/dialog.

5. FILE STRUCTURE
------------------------------------------------------------------
 app/            layout.tsx, template.tsx, providers.tsx, globals.css,
                 (auth)/login, (app)/... pages
 components/ui/      shadcn generated (edit tokens only)
 components/shared/  AuthGate, AppShell, Sidebar, Topbar, PageHeader,
                     KpiCard, Sparkline, StatusChip, SeverityDot,
                     EmptyState, ErrorState, ConfirmDialog, CopyButton,
                     CredentialsModal, Stepper, ChartCard, ImageLightbox,
                     SignedImage, ProgressRing, Meter, DataTable,
                     DateRangePicker, BrandMark,
                     LiveRoomCard, LiveStateChip, ItemChips, UsageTable,
                     CalendarHeatmap, YearHeat, DayDrawer, TimelineChart
 lib/            api.ts, auth.ts, gsap.ts, motion.tsx, strings.ts,
                 constants.ts, format.ts, utils.ts, calendar.ts
 hooks/          useMe.ts, useDebounced.ts, useSignedImage.ts

6. CONSTANTS AND FORMATTERS (build first)
------------------------------------------------------------------
 // FILE: lib/constants.ts
 export const FLAG_TYPES: Record<string, { name: string; hint: string }> = {
   A1: { name: "Attendance inflation",     hint: "Claimed attendance is higher than the camera count" },
   A2: { name: "Over capacity",            hint: "More people observed than the sanctioned maximum" },
   A3: { name: "Enrolment mismatch",       hint: "Claimed attendance is higher than enrolled trainees" },
   A4: { name: "Ghost session",            hint: "Attendance claimed but nobody observed" },
   A5: { name: "Unregistered attendees",   hint: "Camera saw more people than were claimed" },
   E1: { name: "Equipment missing",        hint: "Fewer items seen than sanctioned" },
   E2: { name: "Equipment non-operational",hint: "Item present but appears switched off or unused" },
   E3: { name: "Declaration mismatch",     hint: "Declared inventory differs from sanctioned" },
   S1: { name: "Trainer not verified",     hint: "No face-verified trainer for this session" },
   C1: { name: "Camera problem",           hint: "Camera offline, covered, moved, frozen or dark" },
   C2: { name: "Replay suspicion",         hint: "Footage looks repeated from an earlier session" },
   C3: { name: "Missed capture windows",   hint: "Fewer captures than planned" },
   D1: { name: "Data integrity",           hint: "Record chain or signature failed verification" },
   U1: { name: "Unverifiable count",       hint: "Counts unstable; needs human review" },
   P1: { name: "Capacity implausible",     hint: "Equipment does not match trainee capacity" },
 };
 export const SEVERITY = {
   low:      { label: "Low",      cssVar: "--sev-low",      icon: "Minus" },
   medium:   { label: "Medium",   cssVar: "--sev-medium",   icon: "ChevronUp" },
   high:     { label: "High",     cssVar: "--sev-high",     icon: "ChevronsUp" },
   critical: { label: "Critical", cssVar: "--sev-critical", icon: "AlertOctagon" },
 } as const;
 export const FLAG_STATUS_LABEL = {
   open:"Open", acknowledged:"Acknowledged", centre_responded:"Centre responded",
   under_review:"Under review", resolved:"Resolved", dismissed:"Dismissed", escalated:"Escalated" };
 export const CENTRE_STATUS_LABEL = {
   pending_setup:"Setting up", awaiting_camera_approval:"Awaiting camera approval",
   live:"Live", suspended:"Suspended", terminated:"Terminated" };
 export const LIVE_STATE = {            // label, icon (lucide), tone
   live:        { label: "Live",          icon: "Radio",         tone: "success" },
   idle:        { label: "Idle",          icon: "Pause",         tone: "muted" },
   offline:     { label: "Offline",       icon: "WifiOff",       tone: "muted" },
   tampered:    { label: "Camera problem",icon: "AlertTriangle", tone: "warning" },
   provisional: { label: "Setup pending", icon: "Clock",         tone: "uncertain" },
 } as const;
 export const DAY_STATUS = {            // calendar day status
   ok:        { label: "OK",         icon: "CheckCircle2" },
   attention: { label: "Attention",  icon: "AlertTriangle" },
   critical:  { label: "Critical",   icon: "AlertOctagon" },
   no_data:   { label: "No data",    icon: "Minus" },
   holiday:   { label: "Holiday",    icon: "CalendarOff" },
   upcoming:  { label: "Scheduled",  icon: "Clock" },
   none:      { label: "No session", icon: "Minus" },
 } as const;
 export const ITEM_LABEL: Record<string,string> = { person:"People", chair:"Chair", desk:"Desk",
   monitor:"Monitor", laptop:"Laptop", keyboard:"Keyboard", mouse:"Mouse", "cell phone":"Phone",
   book:"Book", bottle:"Bottle", bench:"Bench", couch:"Couch", "sewing machine":"Sewing machine" };

 // FILE: lib/format.ts   (unchanged helpers: fmtIST, fmtDate, timeAgo, fmtNum)
 const IST = "Asia/Kolkata";
 export const fmtIST = (d: string | Date) =>
   new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short",
     year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
 export const fmtDate = (d: string | Date) =>
   new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
 export function timeAgo(d: string | Date) {
   const s = Math.round((new Date(d).getTime() - Date.now()) / 1000);
   const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
   const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60,"second"],[3600,"minute"],[86400,"hour"],[604800,"day"]];
   for (const [lim, unit] of steps) if (Math.abs(s) < lim) {
     const div = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400;
     return rtf.format(Math.round(s / div), unit);
   }
   return fmtDate(d);
 }
 export const fmtNum = (n: number) => n.toLocaleString("en-IN");

 // FILE: lib/calendar.ts   (date-only strings, NO timezone conversion)
 export const pad = (n: number) => String(n).padStart(2, "0");
 export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;      // m is 1-12
 export const monthRange = (y: number, m: number) => ({ from: ymd(y, m, 1), to: ymd(y, m, new Date(y, m, 0).getDate()) });
 export const isoDow = (y: number, m: number, d: number) => ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;   // Mon=1
 export const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());   // YYYY-MM-DD
 export function monthGrid(y: number, m: number) {                // leading blanks + days, Monday first
   const lead = isoDow(y, m, 1) - 1, n = new Date(y, m, 0).getDate();
   return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => ymd(y, m, i + 1))];
 }
 export function heatLevel(updates: number, max: number) {         // 0..4
   if (!updates || !max) return 0; const r = updates / max;
   return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
 }
 // UI rule: relative time in lists, exact fmtIST() in a Tooltip.

7. LAYOUT
------------------------------------------------------------------
 AppShell (client) = Sidebar + Topbar + <main>.
 Desktop >= 1024: sidebar 240 px (collapses to 64 px rail, state in
   localStorage "sidebar:collapsed"), topbar 56 px, content padding 32 px,
   max-width 1280 px centred.
 Tablet 768-1023: sidebar fixed as 64 px rail.
 Mobile < 768: no sidebar; hamburger opens a Sheet with the full nav.
   Tables become stacked cards. Dialogs become bottom sheets.
 Topbar: breadcrumb (left), search, bell with open-flag count badge, theme
   toggle, profile menu. 1 px bottom border, background var(--background);
   no blur, no shadow.
 Page header: eyebrow (optional), title 28/600, muted description 14, primary
   action right, filters row below. Same on every page.
 Tables: max 8 columns, sticky header, row hover surface-hover, density toggle,
   overflow-x-auto wrapper; the page body never scrolls sideways.
 Forms: single column, max-width 640 px, label above, helper under, error
   under, validate on blur and submit, never clear typed values on error.
 AuthGate: no tokens.access -> /login; else GET /me (api() refreshes silently)
   -> role check (wrong app -> logout() + message) -> render; while checking
   show the AppShell skeleton. Logout: await logout(); router.push("/login").

8. COMPONENT KIT (build once, reuse everywhere)
------------------------------------------------------------------
 Button        primary | secondary | ghost | destructive; sizes sm/md/lg;
               loading = spinner + disabled + keeps width; :active scale .98
               (<= 100 ms).
 StatusChip    Live (green dot with .live-dot) | Setting up (grey) | Awaiting
               approval (amber) | Suspended (amber, pause icon) | Terminated
               (red, x icon). Flag status: Open amber, Resolved green,
               Dismissed grey, Escalated red. UNCERTAIN = violet text, DASHED
               border, help icon.
 SeverityDot   dot + icon + label.
 KpiCard       eyebrow label, value (28/600 tabular via <CountUp/>), optional
               delta chip, optional <Sparkline/>, optional link arrow.
 Sparkline     40 px recharts LineChart, no axes, 1.5 px stroke var(--primary),
               isAnimationActive only on first render.
 DataTable     columns, rows, loading, empty, error, onRowClick, limit+cursor
               pagination, sticky header, data-row-id on <tr>.
 EmptyState    24 px line icon in a 48 px surface-2 circle + one teaching
               sentence + optional action.
 ErrorState    human sentence + Retry; never raw JSON.
 ConfirmDialog normal and typed-confirmation variant (Terminate).
 CredentialsModal  see 6B section 7.
 CopyButton, Stepper, ChartCard (title, range control, body, skeleton, empty
               text, text summary below).
 SignedImage   wraps useSignedImage: skeleton while loading, error tile on
               failure, onClick opens ImageLightbox; supports prop
               crossfade (see 8C) for live thumbnails. The ONLY way images
               from /files are displayed.
 ImageLightbox lazy; Esc closes; arrows navigate.
 BrandMark     24 px SVG logomark (currentColor) + "Dev_Skill" wordmark.
 ProgressRing / Meter   see 6B.
 Toasts        sonner, bottom-right, 4 s. Success / error / info only.
 LiveStateChip chip from LIVE_STATE: icon + label; "Live" has the pulsing dot;
               offline shows "Last seen 4 min ago" in a Tooltip and as sub-text.
 ItemChips     compact chips "Chair 8 (5 in use)"; screen classes read
               "Monitor 6 (4 on)"; max 4 visible + "+n" popover.
 LiveRoomCard  see 8C. UsageTable: class | present | in use | idle | off with a
               usage Meter per row.
 CalendarHeatmap, YearHeat, DayDrawer, TimelineChart: see 8C.

8B. POLISH LAYER (what makes it look premium; mandatory)
------------------------------------------------------------------
 1. LOGIN = split layout (desktop). Left 45 %: background var(--surface),
    .login-grid layer, BrandMark, 36 px headline "Every claim, verified.",
    one muted sentence, 3 small check-line points (anonymous counting, blurred
    evidence, tamper-evident records). Right 55 %: form card (max-width 400),
    centred. Mobile: form only, grid faint behind. Static. Motion = login
    timeline (6B).
 2. SIDEBAR: BrandMark header (56 px), nav items 40 px high, 8 px radius,
    icon 20 + label. Active item: text foreground, background accent-soft, plus
    a 3 px primary indicator bar on the left edge that SLIDES between items with
    GSAP (code below). Group dividers (1 px, 12 px margin). Footer: collapse
    toggle + environment tag ("Demo" chip, mono 12). The "Live" item shows a
    small live dot when at least one room is live (from GET /live counts,
    polled 15 s).
 3. KPI ROW: 5 equal cards, 16 gap, 20 padding, 1 px border, 12 radius.
    Eyebrow label, number, sparkline bottom-right, optional delta chip.
 4. CARDS: bg card, 1 px border, 12 radius, 20 padding; linked cards use
    .card-hover. Titles 14/600; secondary 14 muted. One border level only.
 5. TABLES: header bg surface, 12 px uppercase eyebrow; rows 48 px (40 compact);
    first column 500; numbers right-aligned tabular; IDs mono muted; status via
    chips; clickable rows show a 2 px primary left edge on hover; no zebra.
 6. TYPOGRAPHY RHYTHM: page title 28, description 14 muted, section titles 20,
    card titles 14/600, eyebrow 12 caps; max 3 sizes per card; prose <= 65ch.
 7. NUMBERS: tabular; large numbers via CountUp; deltas with sign and arrow;
    units always shown ("7 people", "92 %").
 8. CHIPS: 24 px high, 12 px text, 8 px horizontal padding, icon 12 + label,
    tinted bg (colour 10 %), 1 px border (colour 30 %), text in the colour.
 9. EMPTY / ERROR / LOADING: skeletons mirror real layout; empty states centred
    with 48 px padding.
10. DIALOGS & DRAWERS: 16 radius, shadow-pop, header title 20/600 + muted
    description, footer actions right-aligned, 24 padding.
11. CHARTS: no chart borders, 1 px grid lines (var(--border)), 12 px muted axis
    text, popover-token tooltips (8 radius), legend chips above, claimed =
    primary, observed = foreground, band = 12 % foreground. Max 3 series colours.
12. MAP: default OSM tiles in a 12-radius bordered card; divIcon pins (10 px dot
    + 2 px white ring); popups on popover tokens.
13. ICONS: lucide only, stroke 1.5; icon buttons 36 px square with tooltip +
    aria-label.
14. SPACING: section gap 24, card gap 16, label-to-input 8; no arbitrary values.
15. DARK MODE parity on every screen; thumbnails sit on surface-2 tiles.
 SIDEBAR INDICATOR (Sidebar.tsx):
   const listRef = useRef<HTMLUListElement>(null);
   const barRef = useRef<HTMLSpanElement>(null);
   const firstBar = useRef(true);
   useGSAP(() => {
     const a = listRef.current?.querySelector<HTMLElement>('[data-nav-active="true"]');
     if (!a || !barRef.current) { gsap.set(barRef.current, { opacity: 0 }); return; }
     const to = { y: a.offsetTop + 8, height: a.offsetHeight - 16, opacity: 1 };
     if (firstBar.current || !motionOk()) { gsap.set(barRef.current, to); firstBar.current = false; }
     else gsap.to(barRef.current, { ...to, duration: DUR.base, ease: EASE.out });
   }, { scope: listRef, dependencies: [pathname, collapsed] });

8C. LIVE AND CALENDAR VISUALS (Government portal; mandatory)
------------------------------------------------------------------
 LIVE ROOM CARD (/live grid, overview card)
   Card 12 radius, 1 px border, no padding on the image. Layout (top to bottom):
   - Thumbnail 16:9 on a surface-2 tile (SignedImage with crossfade). Overlays:
     top-left LiveStateChip (on a 90 % card-colour backing), top-right age chip
     "4 s ago" (mono 12). Non-live states desaturate the thumbnail with opacity
     .6 (not a filter) and show the state sentence centred.
   - Body padding 16: row 1 = People number (36/600 tabular, CountUp) + "people"
     label (12 muted) at left; right-aligned sparkline (last 30 values, 96x32).
     Row 2 = claimed vs observed line (14): "Claimed 12 / Camera saw 7" with a thin
     two-bar comparison (4 px) and the neutral sentence "5 fewer than claimed".
     Row 3 = ItemChips. Row 4 (12 muted) = centre name, code (mono), session
     label; link arrow.
   - Hover: .card-hover. Whole card is a link to /centres/[id]?tab=live.
   - Live data changes: CountUp for numbers (0.3 s), flash() on a chip whose
     in-use value changed, thumbnail crossfade 0.15 s. Never re-run the card
     entrance on refetch.
   LIVE TAB (centre) layout: grid 8/4 on desktop. Left: image card (16:9) with a
   camera switcher (segmented control) and state/age row beneath. Right: "Right
   now" card (People 36 + claimed vs observed + UsageTable). Full width below:
   ChartCard "Today so far" (TimelineChart) and the latest flags list.
 TIMELINE CHART (recharts, shared by Live tab and Day drawer)
   AreaChart: people over time (stroke var(--foreground) 1.5 px, fill 12 %
   foreground), ReferenceArea per session (fill accent-soft), ReferenceLine
   y=claimed per session (dashed, danger), X axis HH:mm (mono 12), tooltip lists
   time, people, and per-class "present / in use". Class chips above the chart
   toggle up to 3 extra lines (in-use per class, series colours: primary, info,
   warning). Text summary below ("People peaked at 9 at 10:35 am").
   isAnimationActive only on first render (700 ms window).
 CALENDAR HEATMAP (month)
   Container: card, padding 20. Header: month title (20/600), icon buttons
   prev/next (36 px), "Today" secondary button, ToggleGroup Month | Year, legend
   chips. Summary strip: 5 mini stats (12 eyebrow + 20/600 number).
   Weekday header row: Mon..Sun (12 eyebrow). Grid: CSS grid 7 cols, gap 4.
   Cell (button, role="gridcell", 12 radius, 1 px border var(--border), padding 8,
   min-height 96 desktop / 64 mobile):
     top row: date (12 mono) left, status icon (16) right;
     middle: "412" (14/600 tabular) + "updates" (12 muted) (hide the word on
       mobile); Users icon + average people (12);
     bottom: delta chip (when claimed & observed exist) and a 4 px intensity bar
       (width = updates / month max, bg primary, track surface-2).
   Cell background = heat-<level> class from heatLevel(); holiday cells use a
   hatched pattern (repeating-linear-gradient var(--border) 1 px) + CalendarOff
   icon; upcoming cells are dashed-border; none cells are plain surface.
   States: hover surface-hover border-strong; focus ring; today = 2 px primary
   ring (inset); selected = 2 px primary border + accent-soft background layer.
   Roving tabindex: arrows move between cells, PageUp/PageDown = month,
   Home/End = row start/end, Enter/Space opens the drawer.
 YEAR HEAT
   12 month blocks in a 4x3 grid (desktop) / 2x6 (mobile). Each block: month label
   + 7-row grid of 12 px squares (radius 3, gap 3) with heat-<level>. Hover =
   Tooltip "9 Oct 2026: 412 updates, 1 open flag". Click = open that month.
 DAY DRAWER
   Radix Sheet right 560 px (bottom sheet <768 px, 90 % height, drag handle).
   Header: date ("Friday, 9 October 2026"), DAY_STATUS chip, prev/next day icon
   buttons. Stat row (5 stats, 12 eyebrow + 20/600): Updates, People max/avg,
   Claimed vs Observed, Flags, Camera uptime %. Tabs with the sliding underline
   (useTabUnderline): Sessions | Timeline | Equipment | Flags | Evidence |
   Updates. Content gets animateIn on tab change; lists useStagger (max 10).
   Evidence grid: 3 columns of 16:9 SignedImage tiles with mono time labels.
   Updates tab: ToggleGroup Feed | Raw snapshots; feed = vertical rail (2 px line
   + nodes with icon, time mono 12, sentence 14); raw = DataTable with
   "Load more".
 STATE MAPPING
   Never colour only: day status icons per DAY_STATUS; live state icons per
   LIVE_STATE; delta chips carry sign text ("+3 / 0 / -2"); uncertain = dashed.

 GSAP ADDITIONS (add to lib/motion.tsx; same rules R1-R11 of 6B)
   // crossfade two stacked images (live thumbnail swap)
   export function crossfade(prev: Element | null, next: Element | null) {
     if (!next) return; if (!prev || !motionOk()) { gsap.set(next, { opacity: 1 }); return; }
     gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration: DUR.micro, ease: "none" });
   }   // SignedImage keeps the old blob URL under the new one until the new one is loaded
   // calendar month entrance + month change (exception: up to 42 items, 0.008 s stagger)
   export function useCalendarEnter(monthKey: string, ready: boolean, dir: 1 | -1 = 1) {
     const ref = useRef<HTMLDivElement>(null);
     useGSAP(() => { if (!ready || !ref.current || !motionOk()) return;
       const cells = gsap.utils.toArray<HTMLElement>("[data-cell]", ref.current);
       gsap.fromTo(ref.current, { x: 12 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: DUR.base, ease: EASE.out, clearProps: "transform,opacity" });
       gsap.from(cells, { opacity: 0, y: 4, duration: DUR.base, stagger: 0.008, ease: EASE.out, clearProps: "transform,opacity" });
     }, { scope: ref, dependencies: [monthKey, ready] });
     return ref;
   }   // runs only when the MONTH changes or first becomes ready; polling refetch must not change monthKey
   // intensity bar grow on month enter: gsap.from("[data-bar]", { scaleX: 0, transformOrigin: "left", duration: DUR.meter, stagger: 0.008, clearProps: "transform" })
   // year view: squares fade in with stagger 0.002 (max 371), once per year change
   // drawer content: animateIn on tab change; useStagger for lists (max 10)
   // live updates: CountUp for people/in-use numbers, flash() for changed chips, crossfade for thumbnails
 PER-SCREEN MOTION ADDITIONS
   /live            card stagger (first ready only, max 12 cards); CountUp; chip flash; crossfade
   Overview "Live rooms now"   row stagger first ready; CountUp
   Centre Live tab  CountUp; usage Meters animate 0.4 s on value change; chart draws once
   Calendar         useCalendarEnter on month/year change; drawer slides (Radix CSS);
                    stat numbers CountUp; timeline draws once per drawer open

9. KEY SCREEN WIREFRAMES
------------------------------------------------------------------
 GOV OVERVIEW
 +--------+---------------------------------------------------------+
 | logo   | Overview                              [search] (bell) (A)|
 | ------ |---------------------------------------------------------|
 | Overview| [Live 128] [Open flags 23] [High+ 6] [Cam off 4] [Pend 9]|
 | Live ●  |---------------------------------------------------------|
 | Applic. | +---------------- Map --------------+ Live rooms now    |
 | Centres | |   o  o     O(red)   o            | [img] DSK-12  9    |
 | Flags   | |        o        o                | [img] DSK-07  6    |
 | Cameras | +-----------------------------------+ Latest flags     |
 | ...     | Highest risk centres        | Flags per day (stacked)  |
 +--------+---------------------------------------------------------+

 LIVE WALL
 +--------+---------------------------------------------------------+
 | sidebar| Live rooms           [Live 12][Idle 3][Offline 2] [Grid|Table]|
 |        | [district v] [state v] [search........]                  |
 |        | +----------------+ +----------------+ +----------------+ |
 |        | |[Live]  4 s ago | |[Live]  2 s ago | |[Offline]       | |
 |        | |   thumbnail    | |   thumbnail    | |   thumbnail    | |
 |        | | 7 people ~~~~  | | 12 people ~~~~ | | -- last seen   | |
 |        | | Claimed 12 / saw 7                  |                  | |
 |        | | Chair 8 (5)  Monitor 6 (4 on) +2    |                  | |
 |        | | DSK-WB-0012 · Morning batch  ->     |                  | |
 |        | +----------------+ +----------------+ +----------------+ |
 +--------+---------------------------------------------------------+

 CENTRE CALENDAR + DAY DRAWER
 +------------------------------------------------+-----------------+
 | October 2026  < >  [Today]  [Month|Year]        | Fri 9 Oct [OK]  |
 | 412 updates · 22 days · avg 7.4 · 3 open flags  | Updates People  |
 | Mon Tue Wed Thu Fri Sat Sun                     | Claimed vs seen |
 | [ 1 ✓ 380 ][ 2 ✓ 402 ][ 3 ! 120 ] ...           | Sessions|Timeline|
 | [ 9 ✓ 412 7.4 +2 ▇▇▇▇▇▇ ] ...                   | Equipment|Flags..|
 +------------------------------------------------+-----------------+

 FLAG DETAIL
 +--------------------------------------------------------------+
 | A1 Attendance inflation  [High] [Flagged] [Open]              |
 | "Claimed 12, camera observed 7 (range 6-8, margin 2)"         |
 |--------------------------------------------------------------|
 | Evidence (3 blurred thumbs)   | Count history (bars + claim line)|
 | Centre response               | Timeline                      |
 | [Acknowledge] [Resolve] [Dismiss as false positive] [Escalate]|
 +--------------------------------------------------------------+

 LOGIN (desktop split)
 +-------------------------+----------------------------------+
 | [grid] BrandMark        |        Government Monitoring     |
 | Every claim, verified.  |        Portal                    |
 | v anonymous counting    |        [Login ID        ]        |
 | v blurred evidence      |        [Password     (eye)]      |
 | v tamper-evident        |        [   Sign in   ]           |
 +-------------------------+----------------------------------+

10. UX BEHAVIOURS
------------------------------------------------------------------
 - Optimistic UI only for safe actions (acknowledge flag). Everything else
   waits for the server with a button spinner.
 - Never lose typed data on error. Destructive actions use ConfirmDialog.
 - Every error: one human sentence + next step. Map API codes in lib/strings.ts:
   ENROLMENT_CAP_REACHED, CLAIM_LOCKED, WRONG_CENTRE, FORBIDDEN,
   CREDENTIALS_EXPIRED, PASSWORD_CHANGE_REQUIRED (redirect),
   INVALID_CREDENTIALS, ACCOUNT_LOCKED, BAD_MFA, WEAK_PASSWORD, SAME_PASSWORD,
   BAD_STATE ("Already processed"), LINK_EXPIRED (refetch parent query),
   TOKEN_EXPIRED (silent refresh), NOT_FOUND.
 - Keyboard: Esc closes dialogs/drawers, Enter submits, logical tab order,
   visible focus ring.
 - Live lists poll 15 s (live pages 5 s); new rows flash() but NEVER re-run
   entrance animations. Background tabs do not poll (refetchIntervalInBackground
   false).
 - Calendar selection is URL-driven (?tab=calendar&date=YYYY-MM-DD) so a day can
   be shared and the Back button closes the drawer.
 - Numbers: tabular, en-IN separators, units always shown.
 - No faces or trainee photos anywhere in the UI.

11. ROI READ-ONLY OVERLAY (Cameras tab)
------------------------------------------------------------------
 Show the blurred reference frame with an SVG overlay (viewBox "0 0 1 1",
 preserveAspectRatio "none") drawing the classroom polygon (accent-soft fill,
 primary 2 px non-scaling stroke) and zones; zone names as chips at centroids.

12. ACCESSIBILITY
------------------------------------------------------------------
 WCAG AA contrast (check primary on both themes), aria-label on every
 icon-only button, aria-live="polite" on toast region and count updates (not on
 every live tick: announce only state changes), charts have a text summary,
 tables have captions or aria-label, calendar grid has role="grid" with
 roving tabindex and full-sentence aria-labels, dialogs trap focus, form errors
 linked with aria-describedby, touch targets >= 44 px on mobile.

13. PERFORMANCE
------------------------------------------------------------------
 dynamic import (ssr:false) for react-leaflet and heavy charts, lazy lightbox,
 React Query staleTime 15 s on live lists / 5 s on live pages / 60 s on calendar
 month / 5 min on static data, calendar year view fetches compact range once
 per year (staleTime 5 min), blob URLs revoked on unmount, import only needed
 GSAP features, Lighthouse Performance and Accessibility >= 90 on login,
 overview, flags list.

14. DO NOT
------------------------------------------------------------------
 No glassmorphism, neon, heavy shadows, emoji icons, parallax, auto-playing
 carousels, looping decorative animation (except the CSS Live dot), second
 accent colour, tables wider than their container, raw JSON/stack traces in the
 UI, face images or raw video anywhere, framer-motion, supabase, external font
 links, arbitrary spacing values, direct <img src> to /files URLs, colour-only
 status.

15. DEFINITION OF DONE (builder self-check)
------------------------------------------------------------------
 [ ] Fonts through next/font/google only; mono for IDs/passwords/hashes/dates
 [ ] Light and dark both correct; no hard-coded colours in components
 [ ] Every page has loading, empty, error states with mirrored skeletons
 [ ] Status/severity/day status never colour-only
 [ ] 390 px layout works (stacked cards, sheet nav, bottom-sheet drawer)
 [ ] Focus ring visible; Esc/Enter/arrow keys behave (incl. calendar grid)
 [ ] No animation runs on polling refetch; numbers tick, thumbnails crossfade
 [ ] Reduced motion disables transforms
 [ ] Login split layout, sliding nav indicator, KPI sparklines present
 [ ] Live wall cards, Live tab, month calendar, year heat, day drawer match 8C
 [ ] Evidence/live images only via SignedImage
 [ ] No supabase or framer-motion in package.json
 [ ] Spacing only from the 4/8/12/16/24/32/48 scale