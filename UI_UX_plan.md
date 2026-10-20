==================================================================
 DEV_SKILL UI/UX PLAN  (6A of 2) v2: DESIGN SYSTEM, LAYOUT, COMPONENTS
 Applies to dev_skill_gov AND dev_skill_center (shared language)
 Read together with 6B (GSAP motion), M5 (auth patch), page plan block.
==================================================================

0. RULES FOR THE AI BUILDER (read first, obey exactly)
------------------------------------------------------------------
 1. Stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui.
    Check the installed Tailwind version. v4: tokens go in globals.css
    with @theme inline (shown below). v3: map the same CSS variables in
    tailwind.config.ts.
 2. Animation: GSAP + @gsap/react ONLY (see 6B). Do NOT install
    framer-motion. CSS transitions ONLY for hover colour/border changes,
    focus rings and the CSS-only loops (skeleton shimmer, Live dot).
 3. Fonts: ONLY next/font/google (Inter + JetBrains_Mono). No <link>
    tags to Google, no @import url(...), no other fonts.
 4. One accent colour per app, stored in --primary.
    NOTE: in shadcn, --accent means "subtle hover surface". NEVER put
    the brand colour in --accent. Brand colour = --primary.
 5. Every colour comes from a CSS variable. No hard-coded hex inside
    components (except in globals.css).
 6. Every data page has 4 states: loading (skeleton), empty
    (EmptyState), error (ErrorState with Retry), success.
 7. Status and severity are never shown by colour alone: always colour
    + icon or text.
 8. All strings live in lib/strings.ts and lib/constants.ts.
 9. Do not add pages, features, colours or animations not listed.
10. Mobile first for the Centre app (trainers use phones). Test widths:
    390, 768, 1024, 1440.
11. NO SUPABASE. There is no supabase package, no lib/supabase.ts, no
    Supabase env var. Auth = lib/auth.ts + lib/api.ts (patch M5).
    Env file contains NEXT_PUBLIC_API_URL only.
12. Evidence/document images: relative signed URLs from the API must be
    loaded ONLY through hooks/useSignedImage.ts (fetch + ngrok header ->
    blob URL). Never use them directly in <img src> or next/image.
13. Visual quality bar: follow section 8B (Polish layer) on every page.
    A page that works but ignores 8B is not finished.

1. DESIGN PRINCIPLES
------------------------------------------------------------------
 - Calm, quiet, data-first. White space over decoration.
 - Flat surfaces, 1 px borders, no shadows except popovers/dialogs.
 - No gradients (exceptions: skeleton shimmer, login grid mask).
 - Colour only for meaning: status, severity, the primary action.
 - Each screen answers one question. Remove anything that does not.
 - Plain language: "Camera saw 7, centre claimed 12."
 - Premium comes from precision: consistent spacing, tight type
   hierarchy, aligned numbers, restrained colour, smooth purposeful motion.
 - Gov app tone: precise and neutral. Centre app tone: supportive,
   never accusatory ("We noticed a difference...").

2. PACKAGES (install commands)
------------------------------------------------------------------
 npm i gsap @gsap/react next-themes @tanstack/react-query \
   react-hook-form zod @hookform/resolvers recharts react-leaflet \
   leaflet lucide-react sonner clsx tailwind-merge \
   class-variance-authority
 npm i qrcode.react            # GOV app only (MFA QR)
 npm i -D @types/leaflet
 npx shadcn@latest init
 npx shadcn@latest add button input textarea select checkbox switch \
   tabs card table badge dialog sheet tooltip skeleton dropdown-menu \
   popover calendar separator sonner label form
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

 export const metadata: Metadata = {
   title: "Dev_Skill Government Portal",   // centre app: "Dev_Skill Centre Portal"
 };

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
 tracking codes, table timestamps = font-mono (JetBrains Mono).
 Weights: 400, 500, 600 only (Inter is variable; no weight list needed).
 Inter feature settings (globals.css): font-feature-settings:
 "cv11","ss01","tnum" is NOT global; apply tnum only via .tabular.

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
   --primary:#4338CA;     --primary-foreground:#FFFFFF;  /* GOV. Centre app: #0F766E */
   --accent-soft:rgba(67,56,202,0.08);                   /* Centre: rgba(15,118,110,0.08) */
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
   --primary:#6366F1;  /* Centre dark: #2DB5A8. Verify AA with white text; darken if it fails */
   --accent-soft:rgba(99,102,241,0.14);   /* Centre: rgba(45,181,168,0.14) */
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
 @media (prefers-reduced-motion: reduce) { .skeleton, .live-dot { animation:none; } }
 @media print { aside, header, nav, button { display:none !important; } body { font-size:12px; } }

 Scale: radius 8 px inputs/buttons, 12 px cards, 16 px dialogs, 999 px chips.
 Spacing: 4, 8, 12, 16, 24, 32, 48 (use ONLY these). Content max-width 1280.
 Type: 12 meta, 14 body, 16 inputs (prevents iOS zoom), 20 section title,
 28 page title, 36 hero numbers (login panel, big KPI). Icons: lucide-react,
 16 inline, 20 nav, strokeWidth 1.5. Shadow ONLY on popover/dialog.

5. FILE STRUCTURE (both apps)
------------------------------------------------------------------
 app/            layout.tsx, template.tsx (page enter), providers.tsx,
                 globals.css, (auth)/login, (app)/... pages
 components/ui/      shadcn generated (edit tokens only)
 components/shared/  AuthGate, AppShell, Sidebar, Topbar, BottomNav,
                     PageHeader, KpiCard, Sparkline, StatusChip, SeverityDot,
                     EmptyState, ErrorState, ConfirmDialog, CopyButton,
                     CredentialsModal, Stepper, ChartCard, ImageLightbox,
                     SignedImage, ProgressRing, Meter, DataTable,
                     DateRangePicker, BrandMark
 lib/            api.ts, auth.ts, gsap.ts, motion.tsx, strings.ts,
                 constants.ts, format.ts, utils.ts, roi.ts (centre app)
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

 // FILE: lib/format.ts
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
 // UI rule: show relative time, exact fmtIST() in a Tooltip on hover.

7. LAYOUT
------------------------------------------------------------------
 AppShell (client) = Sidebar + Topbar + <main>.
 Desktop >= 1024: sidebar 240 px (collapses to 64 px rail, state in
   localStorage "sidebar:collapsed"), topbar 56 px, content padding 32 px,
   max-width 1280 px centred.
 Tablet 768-1023: sidebar fixed as 64 px rail.
 Mobile < 768: no sidebar. Centre app: BottomNav with 4-5 items (icons +
   labels, 56 px, safe-area padding). Gov app: hamburger opens a Sheet
   with the full nav. Tables become stacked cards. Dialogs become bottom
   sheets (shadcn Sheet side="bottom").
 Topbar: breadcrumb (left), search (gov), bell with open-flag count badge
   (gov: open flags; centre: open flags + unread notices), theme toggle,
   profile menu (name, role, Settings, Logout). Topbar has a 1 px bottom
   border and background var(--background); no blur, no shadow.
 Page header: eyebrow (optional), title 28/600, muted description 14,
   primary action on the right, filters row below. Same on every page.
 Tables: max 8 columns, sticky header, row hover surface-hover, density
   toggle, secondary info in expandable row or drawer, overflow-x-auto
   wrapper; the page body never scrolls sideways.
 Forms: single column, max-width 640 px, label above, helper text under,
   error text (danger) under the field, validate on blur and submit,
   never clear typed values on error. Multi-step forms use Stepper.
 AuthGate (wraps (app) routes):
   no tokens.access -> redirect /login
   else GET /me (api() refreshes the token silently if expired)
   -> role check (wrong app -> logout() + message) -> render.
   While checking show the AppShell skeleton (never blank / spinner).
   Logout button: await logout(); router.push("/login").

8. COMPONENT KIT (build once, reuse everywhere)
------------------------------------------------------------------
 Button        primary | secondary | ghost | destructive; sizes sm/md/lg;
               loading = spinner + disabled + keeps width; press scale
               0.98 via CSS active state (allowed: instant, no transition
               longer than 100 ms).
 StatusChip    Live (green dot with .live-dot) | Setting up (grey) |
               Awaiting approval (amber) | Suspended (amber, pause icon)
               | Terminated (red, x icon). Flag status: Open amber,
               Resolved green, Dismissed grey, Escalated red.
               UNCERTAIN = violet text, DASHED border, help icon.
 SeverityDot   dot + icon + label (never colour only).
 KpiCard       eyebrow label, value (28/600 tabular via <CountUp/>),
               optional delta chip, optional <Sparkline/>, optional link
               arrow. Skeleton variant. Hover = .card-hover when linked.
 Sparkline     40 px high recharts LineChart, no axes, 1.5 px stroke in
               var(--primary), isAnimationActive only on first render.
 DataTable     generic: columns, rows, loading, empty, error, onRowClick,
               limit+cursor pagination ("Load more" or next/prev),
               sticky header, data-row-id on <tr>, row hover surface-hover.
 EmptyState    24 px line icon in a 48 px surface-2 circle + one teaching
               sentence + optional action. e.g. "No flags yet. Flags appear
               here when the camera disagrees with claimed data."
 ErrorState    human sentence + Retry button; never raw JSON or stack.
 ConfirmDialog normal and typed-confirmation variant (Terminate).
 CredentialsModal  see 6B section 7. Mono, copy buttons, locked until
               "I have saved it". Clear the password on close.
 CopyButton    icon button, toast "Copied", aria-label.
 Stepper       numbered steps, current highlighted, completed with check,
               thin connector line.
 ChartCard     title, optional range control, body, skeleton, empty text,
               text summary below the chart.
 SignedImage   wraps useSignedImage: skeleton while loading, error tile on
               failure, onClick opens ImageLightbox. The ONLY way images
               from /files are displayed.
 ImageLightbox lazy loaded; Esc closes; arrow keys navigate.
 BrandMark     small logomark (SVG, 24 px, currentColor) + "Dev_Skill"
               wordmark; used in sidebar header and login panel.
 ProgressRing / Meter   see 6B.
 Toasts        sonner, bottom-right, 4 s. Success / error / info only.

8B. POLISH LAYER (what makes it look premium; mandatory)
------------------------------------------------------------------
 1. LOGIN SCREEN = split layout (desktop). Left 45%: brand panel with
    background var(--surface), .login-grid layer, BrandMark, a 36 px
    headline ("Every claim, verified." gov / "Your centre, supported."
    centre), one muted sentence, and 3 small check-line points (anonymous
    counting, blurred evidence, tamper-evident records). Right 55%: the
    form card (max-width 400), centred. Mobile: form only, grid faint
    behind. Static, no animated shapes. Motion = login timeline (6B).
 2. SIDEBAR: BrandMark header (56 px), nav items 40 px high, 8 px radius,
    icon 20 px + label. Active item: text foreground, background
    accent-soft, plus a 3 px primary indicator bar on the left edge that
    SLIDES between items with GSAP (code below). Section dividers between
    nav groups (1 px border, 12 px margin). Footer: collapse toggle +
    environment tag ("Demo" chip, mono 12 px).
 3. KPI ROW: 5 equal cards, 16 px gap, 20 px padding, 1 px border,
    12 px radius. Eyebrow label top, number below, sparkline bottom right
    (last 14 values) when data exists, optional delta chip ("+3 today",
    success/danger text with arrow icon).
 4. CARDS: every card = bg card, 1 px border, 12 px radius, 20 px padding;
    linked cards use .card-hover. Card titles 14/600; secondary text 14
    muted. Never nest more than one border level (use surface-2 blocks
    or dividers inside cards).
 5. TABLES: header row bg surface, 12 px uppercase eyebrow text; body
    rows 48 px high (40 compact); first column slightly heavier (500);
    numbers right-aligned tabular; IDs mono muted; status via chips;
    row hover surface-hover with a 2 px primary left edge on hover for
    clickable rows; zebra stripes are NOT used.
 6. TYPOGRAPHY RHYTHM: page title 28 (tracking -0.02em), description
    muted 14, section titles 20, card titles 14/600, eyebrow 12 caps.
    Never more than 3 font sizes inside one card. Line length for prose
    max 65ch.
 7. NUMBERS: all numerals tabular; large numbers via CountUp; deltas with
    sign and arrow icon; units always shown ("7 people", "92 %").
 8. SEVERITY & STATUS CHIPS: 24 px high, 12 px text, 8 px horizontal
    padding, icon 12 px + label, soft tinted background (colour at 10 %)
    with 1 px border at 30 % of the same colour, text in the colour.
 9. EMPTY / ERROR / LOADING: skeletons mirror the real layout (same
    heights and column widths). Empty states are centred inside the card
    with generous 48 px padding.
10. DIALOGS & DRAWERS: 16 px radius, shadow-pop, header with title 20/600
    and muted description, footer actions right-aligned (secondary left,
    primary right), 24 px padding. Credentials modal: big mono values on
    surface-2 blocks, red note with alert icon.
11. CHARTS: no chart borders, light 1 px grid lines (var(--border)),
    12 px axis text muted, tooltips on popover tokens with 8 px radius,
    legend as chips above the chart, claimed = primary, observed =
    foreground, band = 12 % foreground. Max 3 series colours.
12. MAP: grayscale-ish OSM look is NOT allowed to be hacked with filters;
    use default tiles, but wrap in a 12 px radius card with 1 px border,
    custom divIcon pins (10 px dot + 2 px white ring), popup styled with
    popover tokens.
13. ICONS: lucide only, one stroke width (1.5), consistent sizes; icon-only
    buttons 36 px square with tooltip + aria-label.
14. SPACING DISCIPLINE: page section gap 24, card gap 16, label-to-input
    gap 8, never arbitrary values (no 13px, 22px etc.).
15. DARK MODE parity: every screen verified in both themes; borders stay
    visible; chart colours keep contrast; evidence thumbnails sit on
    surface-2 tiles.
 SIDEBAR INDICATOR (add to Sidebar.tsx; uses 6B helpers):
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
   // <ul ref={listRef} className="relative">
   //   <span ref={barRef} className="absolute left-0 top-0 w-[3px] rounded-full bg-primary" aria-hidden />
   //   items: <li><Link data-nav-active={isActive} ...></li>
   // Add this row to the 6B motion map: "sidebar: sliding active indicator".

9. KEY SCREEN WIREFRAMES
------------------------------------------------------------------
 GOV OVERVIEW
 +--------+---------------------------------------------------------+
 | logo   | Overview                              [search] (bell) (A)|
 | ------ |---------------------------------------------------------|
 | Overview| [Live 128] [Open flags 23] [High+ 6] [Cam off 4] [Pend 9]|
 | Applic. |---------------------------------------------------------|
 | Centres | +---------------- Map --------------+ Latest flags     |
 | Flags   | |   o  o     O(red)   o            | * A1 DSK-0012 2m  |
 | Cameras | |        o        o                | * E1 DSK-0007 9m  |
 | ...     | +-----------------------------------+ * C1 DSK-0003 1h  |
 |         | Highest risk centres        | Flags per day (stacked)  |
 +--------+---------------------------------------------------------+

 LOGIN (desktop split)
 +-------------------------+----------------------------------+
 | [grid] BrandMark        |                                  |
 |                         |        Government Monitoring     |
 | Every claim, verified.  |        Portal                    |
 | muted sentence          |        [Login ID        ]        |
 | v anonymous counting    |        [Password     (eye)]      |
 | v blurred evidence      |        [   Sign in   ]           |
 | v tamper-evident        |                                  |
 +-------------------------+----------------------------------+

 FLAG DETAIL
 +--------------------------------------------------------------+
 | A1 Attendance inflation  [High] [Flagged] [Open]              |
 | "Claimed 12, camera observed 7 (range 6-8, margin 2)"         |
 |--------------------------------------------------------------|
 | Evidence (3 blurred thumbs)   | Count history (bars + claim line)|
 |--------------------------------------------------------------|
 | Centre response               | Timeline                      |
 | [Acknowledge] [Resolve] [Dismiss as false positive] [Escalate]|
 +--------------------------------------------------------------+

 CENTRE ROI EDITOR
 +--------------------------------------------+-----------------+
 | [Classroom area] [Workstation zones]       | Quality         |
 | +----------------------------------------+ | Brightness  OK  |
 | |   reference frame + polygon + handles  | | Sharpness   OK  |
 | +----------------------------------------+ | Coverage   WARN |
 | [Undo] [Clear] [Close shape]               | [Save][Submit]  |
 +--------------------------------------------+-----------------+

 TRAINER ATTENDANCE (mobile first)
 Step 1 Verify yourself -> big camera preview + [Scan]
 Step 2 Roster: large rows with checkbox, sticky bottom bar
        "Present 24 / 30  [Submit]"

10. ROI EDITOR IMPLEMENTATION RULES (most delicate UI)
------------------------------------------------------------------
 - Container has the SAME aspect ratio as the reference frame
   (aspect-ratio from image natural size). Image fills it. The
   reference frame is loaded with useSignedImage / authenticated fetch.
 - Overlay = <svg viewBox="0 0 1 1" preserveAspectRatio="none"> holding
   <polygon>/<polyline> with vector-effect="non-scaling-stroke".
   Point HANDLES are absolutely positioned HTML divs at
   left: x*100%, top: y*100% (never distorted).
 - Points stored NORMALISED 0..1, 4 decimals: [[x,y],...].
 - Pointer events (mouse + touch): click empty area adds a point, drag a
   handle moves it, click first point (or "Close shape") closes it.
   Min 3 points. Undo removes last. Clear asks to confirm.
 - Two modes (tabs): "Classroom area" (exactly one polygon, required)
   and "Workstation zones" (many, each named). Warn if a zone vertex is
   outside the classroom polygon.
 - Reload must reproduce the shape exactly (round trip test).
 - Handles: 14 px circles (44 px touch target via padding), primary fill,
   2 px white ring; polygon fill accent-soft, stroke primary 2 px.
 // FILE: lib/roi.ts
 export function toNorm(e: { clientX: number; clientY: number }, el: HTMLElement): [number, number] {
   const r = el.getBoundingClientRect();
   const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
   const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
   return [Number(x.toFixed(4)), Number(y.toFixed(4))];
 }
 export const toPoints = (poly: [number, number][]) => poly.map(([x, y]) => `${x},${y}`).join(" ");
 export function area(poly: [number, number][]) {   // reject degenerate shapes
   let a = 0;
   for (let i = 0; i < poly.length; i++) {
     const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
     a += x1 * y2 - x2 * y1;
   }
   return Math.abs(a / 2);          // must be > 0.02 (2% of frame)
 }
 - Quality panel: Brightness / Sharpness / Coverage rows with
   green/amber/red chip + advice text ("Too dark: add light or move the
   camera"). Values come from the API.

11. UX BEHAVIOURS
------------------------------------------------------------------
 - Optimistic UI only for safe actions (acknowledge flag, tick roster).
   Everything else waits for the server and shows a button spinner.
 - Never lose typed data on error. Destructive actions use ConfirmDialog.
 - Every error: one human sentence + next step. Map API codes in
   lib/strings.ts: ENROLMENT_CAP_REACHED, CLAIM_LOCKED, WRONG_CENTRE,
   FORBIDDEN, CREDENTIALS_EXPIRED, PASSWORD_CHANGE_REQUIRED (redirect),
   INVALID_CREDENTIALS ("Incorrect ID or password"), ACCOUNT_LOCKED
   ("Too many attempts. Try again in a few minutes."), BAD_MFA,
   WEAK_PASSWORD, SAME_PASSWORD, BAD_STATE ("Already processed"),
   LINK_EXPIRED (refetch parent query), TOKEN_EXPIRED (silent refresh).
 - Keyboard: Esc closes dialogs, Enter submits, logical tab order,
   visible focus ring (2 px primary, 2 px offset).
 - Live lists poll every 15 s (React Query refetchInterval); new rows get
   flash() but NEVER re-run entrance animations (6B rule R5).
 - Numbers: tabular, en-IN separators, units always shown.
 - Privacy line on camera and attendance pages:
   "Cameras count people anonymously. Trainee faces are never identified."
 - No faces or trainee photos anywhere in the UI.

12. ACCESSIBILITY
------------------------------------------------------------------
 WCAG AA contrast (check primary on both themes), aria-label on every
 icon-only button, aria-live="polite" on toast region and count updates,
 charts have a text summary below, tables have captions or aria-label,
 dialogs trap focus (Radix does this; do not override), form errors
 linked with aria-describedby, touch targets >= 44 px on mobile,
 status never by colour alone.

13. PERFORMANCE
------------------------------------------------------------------
 dynamic import (ssr:false) for react-leaflet and heavy charts, lazy
 lightbox, React Query staleTime 15 s on live lists / 5 min on static
 data, import only needed GSAP features, blob URLs revoked on unmount
 (useSignedImage does this), Lighthouse Performance and Accessibility
 >= 90 on login, overview, flags list.

14. DO NOT
------------------------------------------------------------------
 No glassmorphism, neon, heavy shadows, emoji icons, parallax,
 auto-playing carousels, looping decorative animation, second accent
 colour, tables wider than their container, raw JSON/stack traces in the
 UI, face images, framer-motion, supabase, external font links,
 arbitrary spacing values, direct <img src> to /files URLs.

15. DEFINITION OF DONE (builder self-check)
------------------------------------------------------------------
 [ ] Fonts through next/font/google only; mono for IDs/passwords/hashes
 [ ] Light and dark both correct; no hard-coded colours in components
 [ ] Every page has loading, empty, error states with mirrored skeletons
 [ ] Status/severity never colour-only
 [ ] 390 px layout works (stacked cards, bottom nav on centre app)
 [ ] Focus ring visible; Esc/Enter behave
 [ ] No animation runs on polling refetch
 [ ] Reduced-motion disables transforms
 [ ] Login split layout, sliding nav indicator, KPI sparklines present
 [ ] Evidence shown only via SignedImage; no ngrok warning page images
 [ ] No supabase or framer-motion in package.json
 [ ] Spacing only from the 4/8/12/16/24/32/48 scale


 UI/UX v4 ADDITIONS  (apply to 6A Gov and 6C Centre; nothing else in them changes)

1. CONSTANTS  (lib/constants.ts)
 FLAG_TYPES += M1: { name: "Session not held", hint: "A scheduled session ended with no camera data" }
 SESSION_STATUS = {
   scheduled: { label: "Upcoming",  icon: "Clock",     tone: "muted"   },
   running:   { label: "Running",   icon: "Radio",     tone: "success" },   // live dot
   closed:    { label: "Held",      icon: "CheckCircle2", tone: "success" },
   missed:    { label: "Not held",  icon: "CalendarX2",   tone: "danger"  },
   cancelled: { label: "Cancelled", icon: "Ban",          tone: "muted"   } }   // line-through title
 DAY_STATUS += missed { "Not held", CalendarX2 } , partial { "Partly held", CircleDashed },
               cancelled { "Cancelled", Ban }   (existing ok/attention/critical/no_data/holiday/upcoming/none stay)
 RUN_END_REASON = { manual: "Stopped by user", timeout: "Timed out", session_end: "Session ended",
   error: "Error", system: "System" }
 SESSION_KIND = { scheduled: "Recurring", oneoff: "One-off", adhoc: "Demo" }
 Centre app wording for DAY_STATUS: ok "All matched", attention "Worth a look", critical "Needs your response",
   missed "Not held", partial "Partly held", cancelled "Cancelled".
 Add the face/schedule error strings from the page plans to lib/strings.ts (with advice shown under the message).

2. FORMAT HELPERS  (lib/format.ts)
 export const fmtDuration = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
   return h ? `${h} h ${String(m).padStart(2,"0")} min` : m ? `${m} min` : `${Math.max(0, Math.round(s))} s`; };
 export const fmtClock = (s: number) => [Math.floor(s/3600), Math.floor((s%3600)/60), Math.floor(s%60)]
   .map(n => String(n).padStart(2,"0")).join(":");           // "00:42:10", used by the timers
 export const fmtTime = (d) => new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(d));
 hooks/useNow.ts: one shared 1 s interval returning Date.now(); elapsed = server elapsed_s + (now - fetchedAt)/1000.

3. NEW SHARED COMPONENTS
 SessionStatusChip   chip from SESSION_STATUS (icon + label; Running has the pulsing live dot; Cancelled title is
                     line-through where used in lists).
 ElapsedTimer        shows fmtClock(elapsed) in mono, aria-live off (no per-second announcements).
 LiveDataCard (Gov)  card described in the Gov /live spec: state chip, timer, People number, sparkline, claimed bar,
                     equipment mini-tiles, footer. NO image area. Skeleton mirrors these rows.
 EquipmentMiniTile   label + "5 / 8 in use" + 4 px Meter (+ "x off" chip).
 RunList / RunRow    started - ended (or "Running" with live dot) - duration - end-reason chip - by - frames.
 SessionDrawer       (Gov) stat row + runs + summary.
 ScheduleWeekGrid    7 columns, 6:00-20:00, status-tinted blocks, hatched holidays (entrance: scaleY .9 -> 1, stagger .03).
 SessionForm         (Centre) react-hook-form + zod with the server rules and the live summary line.
 FaceCapture         (Centre, staff screens only) oval frame, 3-frame capture helper lib/capture.ts
                     (grabFrames(video, 3, 600) -> data URLs), cleans streams/canvases on unmount.
 MonitoringClock     (Centre /live) start time, ticking timer, session progress bar, updates sent.
 DiagnosticsPanel    (Centre /live) checklist + advice list.
 SystemCheckCard     (Centre /settings) atlas / counter / staff face service rows.

4. VISUAL RULES FOR THE NEW STATES (no new colours)
 Not held   = danger text + dashed danger border + CalendarX2 (tint 10 %).
 Partly held= warning text + solid warning border + CircleDashed.
 Cancelled  = muted text + diagonal-line pattern (repeating-linear-gradient with var(--border-strong)) + Ban icon.
 Running    = success text + live dot (the only pulsing element).
 Late start chip: amber "+7 min" when > 5 min, otherwise muted "On time".
 Coverage Meter: success >= 90 %, warning 60-89 %, danger < 60 %, always with the % text.
 Calendar legend, year-view corner dot (missed/partial) and heat classes (.heat-0..4) as in the page plans.

5. MOTION ADDITIONS (GSAP; same rules R1-R11)
 /live (Gov)       card stagger first ready only (max 12); CountUp 0.3 s; chip flash; timer ticks without animation.
 /sessions         row stagger first ready (max 10); drawer opens by Radix CSS; stat numbers CountUp; run rows stagger.
 Centre Schedule tab (Gov) / /schedule (Centre)   week-grid block stagger; session cards useStagger; drawer by Radix CSS.
 Centre /live      MonitoringClock appears with animateIn (y 6) once on START; summary dialog by Radix CSS with
                   stat numbers CountUp; pulse dot on each accepted frame; box glide as in 6C 9.7.
 Face screens      tick draw on success; shake on failure (existing helpers).
 Calendar          useCalendarEnter on month change; new statuses need no extra motion.

6. LIVE ROOM (Centre) COPY
 Privacy line: "Camera pictures are analysed on the centre's server and discarded immediately. We count people and
 equipment. We never identify trainees. Only counts and blurred thumbnails are kept."