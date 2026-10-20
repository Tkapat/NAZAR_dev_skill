==================================================================
 DEV_SKILL: AI VIDEO-ANALYTICS COMPLIANCE MONITOR FOR SKILLING CENTRES
 TEAM WORKFLOW + TECHNOLOGY GUIDE   (SIH build)   v2: MongoDB + GSAP
==================================================================

1. WHAT WE ARE BUILDING
------------------------------------------------------------------
 Government funds skilling centres. Some centres inflate trainee
 attendance and claim equipment they do not have or do not maintain.
 We check every centre's CCTV automatically and compare what the
 camera SEES with what the centre CLAIMS and what govt SANCTIONED.
 Mismatches appear as explainable flags on a govt dashboard.
 No one watches raw footage. Raw footage never leaves the centre.

 THREE-WAY INTEGRITY CHECK (the heart of the project)
   SANCTIONED = approved application + scheme template
                (max trainees, equipment list and quantities)
   CLAIMED    = what the centre reports (trainer's roster count,
                equipment declared)
   OBSERVED   = what the camera pipeline measures
                (anonymous, aggregate, with confidence interval)
 Every flag is a disagreement between two of these three.

2. FOLDER STRUCTURE
------------------------------------------------------------------
 Dev_Skill/
   dev_skill_gov/      Next.js app  -> Government portal
   dev_skill_center/   Next.js app  -> Centre portal (+ public apply pages)
   dev_skill_backend/  Python FastAPI -> API, auth, vision pipeline, sync
     app/core (config, deps, security, audit)   app/db (mongo.py, local.py)
     app/routers (auth, applications, centres, schemes, cameras, schedule,
       trainees, attendance, staff, equipment, requests, flags, notices,
       reports, files, edge)
     app/services (credentials, ledger, sync, consolidate, flag_engine,
       face, plausibility, scheduler, pipeline, dbfuncs, vision/*)
     scripts/init_db.py   sample_videos/   data/   eval/   models/

3. TECHNOLOGY AND WHY
------------------------------------------------------------------
 Frontends : Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui,
             GSAP + @gsap/react (ALL animation), next-themes (dark mode),
             next/font/google (Inter + JetBrains Mono), TanStack Query,
             react-hook-form + zod, recharts, react-leaflet, lucide-react,
             sonner, qrcode.react (gov MFA only)
 Auth      : OWN backend auth. Argon2 password hashes, JWT access token
             (30 min) + rotating refresh token (7 days), TOTP MFA for govt
             users, account lockout after 5 failures.
 Database  : MongoDB Atlas (one cluster, db "devskill") via PyMongo.
             Evidence thumbnails (<=60 KB, TTL 90 days) stored in MongoDB;
             application documents stored in GridFS.
 Backend   : Python 3.10/3.11, FastAPI, Uvicorn, APScheduler, slowapi
 Vision    : Ultralytics YOLO (person, chair, laptop, tv), YOLO-World for
             classes not in COCO (sewing machine, workbench), OpenCV,
             tiling for small objects
 Face (staff only): InsightFace (ArcFace embeddings, onnxruntime CPU),
             embeddings encrypted with Fernet
 Integrity : SHA-256 hash chain + Ed25519 signatures, local SQLite ledger
 Hosting   : Frontends on Vercel; backend on a laptop exposed by ngrok

 ARCHITECTURE
   [Browser: Gov app]----\
                          >--HTTPS (ngrok)-->[FastAPI backend = "edge node"]
   [Browser: Centre app]-/   (only NEXT_PUBLIC_API_URL)   |  vision worker (YOLO)
                                                          |  local SQLite ledger
                                                          |  sync agent (store+forward)
                                                          v
                                           [MongoDB Atlas: ONE shared database]
 - Frontends hold NO database or auth-provider keys.
 - Backend alone knows MONGODB_URI, JWT_SECRET, FERNET_KEY, FILE_URL_SECRET.
 - Videos stay on the backend machine. Only counts, flags and blurred
   thumbnails are uploaded to Atlas.
 - Govt and centre users share one "users" collection and are separated
   by role. The backend enforces role and centre scoping on every route.

4. ROLES
------------------------------------------------------------------
 Govt app   : super_admin, scheme_officer, auditor (read-only)
 Centre app : centre_admin, trainer (trainers and officials who mark
              attendance get a trainer login)
 Public     : applicant (no login; applies and tracks by tracking code)

5. END-TO-END WORKFLOW
------------------------------------------------------------------
 PHASE A: SETUP AND ONBOARDING
  A1 Super admin creates Scheme + Trade Template
     (equipment classes, ratio per trainee, operability rule, presence
      rule, count tolerance).
  A2 Two entry paths into the same form:
     (a) Applicant (municipality / panchayat / NGO) submits the public
         form and gets a tracking code
     (b) Govt creates a centre directly (skips review, audit-logged)
  A3 Officer reviews: sees plausibility warnings (e.g. 30 trainees but
     10 machines). Approve / Reject / Raise query.
  A4 On approval the system atomically creates the centre and its login.
     The temporary password is shown ONCE on screen. Officer shares it
     with the centre contact personally. Expires in 72 h; password
     change forced at first login. If lost, officer clicks Reset.
  A5 Centre admin logs in, changes password, accepts the data-use
     notice, then completes the onboarding checklist:
       - registers camera, draws classroom ROI and workstation zones
       - sets batches and session timetable
       - adds trainers/officials and enrols their faces (with consent)
       - declares equipment inventory
  A6 Govt approves camera setup -> centre status becomes LIVE.

 PHASE B: DAILY OPERATION
  B1 Trainer logs in, scans own face (1:1) when the session opens
     -> staff attendance + proof the trainer is present.
  B2 Trainer ticks present trainees on the roster and submits
     -> CLAIMED headcount (locked after submit; edits need a reason
        and are logged).
  B3 Scheduler picks random capture times inside the session window.
  B4 Pipeline per frame: quality gate -> detect -> cleanup -> equipment
     status -> blur faces -> keep only blurred thumbnail -> delete raw.
  B5 Hourly consolidation: mode of counts with tolerance; if frames
     disagree capture more frames up to a cap; after the cap mark
     UNCERTAIN (never silently guess).
  B6 Flag engine compares sanctioned / claimed / observed.
  B7 Each record is signed and hash-chained in the local ledger.
  B8 Sync agent uploads to Atlas when internet exists (flags first,
     idempotent, no duplicates).
  B9 Gov dashboard shows alerts + blurred evidence (polls every 15 s).

 PHASE C: FLAG HANDLING
  C1 Flag raised; centre sees it in its portal.
  C2 Centre explains, uploads proof or files a time-limited repair
     declaration (needs govt approval; suppresses only the matching
     equipment flag until expiry, max 30 days).
  C3 Officer reviews: Resolve / Dismiss (false positive) / Escalate.
  C4 Repeated or critical flags -> enforcement ladder:
     Advisory -> Notice -> Warning -> Suspension -> Termination
     (each step logged with evidence).
  C5 Dismissed flags feed the false-positive log used in the
     accuracy report.

 PHASE D: CHANGE MANAGEMENT
  Centre requests extra equipment / extra enrolment / new batch /
  camera change -> Govt decides -> centre unlocked only after approval.

 PHASE E: REPORTING AND AUDIT
  District / scheme rollups, risk ranking, CSV export, insert-only
  audit log.

6. FACE-SCAN AND PRIVACY POLICY
------------------------------------------------------------------
 WHAT IS IDENTIFIED                    WHAT IS NOT
 - Trainer / official (1:1 face        - Trainee faces (never matched)
   verification, consented, own        - Individual trainee movement
   embedding only)                     - Raw video leaving the centre
 - Trainee NAME (roster only)          - Raw frames after processing
 - Centre / camera identity            - Face images stored anywhere
                                         (only encrypted embeddings of
                                         staff are kept)
 Controls: head-region blur on every detected person, raw frame deleted
 immediately, aggregate counts upstream, role-based access, evidence
 auto-deleted after 90 days (TTL index), consent captured, staff
 embedding deleted when staff is deactivated, DPDP Act 2023 alignment.

7. LOW-BANDWIDTH AND OFFLINE MODE
------------------------------------------------------------------
 - All inference runs locally; no video is streamed.
 - Upload only: hourly summaries (KBs), flags, 1-3 blurred thumbnails
   per flag (<=60 KB each), compressed JSON.
 - Local SQLite ledger is the buffer and proof; sync is store-and-forward,
   retried, idempotent (unique hash), flags prioritised over routine.
 - A "Simulate offline" toggle in Demo Lab proves it.

8. SECURITY SUMMARY
------------------------------------------------------------------
 - DB credentials and JWT secret only in backend .env. Atlas user has
   readWrite on db "devskill" only. Frontends have no secrets.
 - Argon2 hashing, login lockout, rate limits, rotating refresh tokens,
   password change revokes all older tokens.
 - Backend verifies every token and enforces role + centre scoping.
 - Generated passwords: random, shown once, expire 72 h, forced change.
 - Signed hash-chained ledger; central side can re-verify the chain.
 - Evidence and documents served only through 60-second HMAC-signed URLs.
 - Tamper checks: dark/covered/blurred/frozen/moved camera, replay
   (repeating frame fingerprints), random capture times, clock drift.
 - Insert-only audit log for every officer action.

9. BUILD PHASES (suggested order and ownership)
------------------------------------------------------------------
 P0 Setup (0.5 day): Atlas cluster + user + network access, repos, env
    files, ngrok, CORS, run scripts/init_db.py (indexes, validators,
    seed schemes, first super admin).
 P1 Foundation (1.5 days): auth endpoints, roles, /me, change password,
    credential generation. Both apps: login + layout shell + design
    system + GSAP helpers.
 P2 Govt + Centre core flows (3 days): applications, approvals,
    centres, schemes/templates, enrolment with cap, schedule,
    equipment register, requests.
 P3 Vision pipeline (3 days, parallel, vision teammate): detector,
    tiling, cleanup, blur, equipment status, consolidation, quality gate.
 P4 Flag engine + dashboards (2 days): flags, console, evidence viewer,
    charts, camera health, notices/enforcement.
 P5 Integrity + sync (1.5 days): ledger, signing, outbox sync,
    offline toggle, replay/tamper checks, staff face attendance.
 P6 Evaluation + polish (2 days): labelled frames, FP/FN report,
    privacy note, animation review, demo script rehearsal.
 Suggested split: Teammate 1 = Govt app, Teammate 2 = Centre app,
 Teammate 3 = vision + evaluation, Teammate 4 = backend APIs + DB.

10. WHICH BLOCK GOES TO WHICH BUILDER AI
------------------------------------------------------------------
 Backend AI : Backend plan (Block 2, minus its Supabase schema/code) +
              Backend key code + M1 + M2 + M3 + M4 + test checklist.
 Gov UI AI  : Gov page plan v2 + 6A v2 + 6B + M5 (frontend patch).
 Centre UI AI: Centre page plan v2 + 6A v2 + 6B + M5 (frontend patch).
 Team       : this document.

11. DEMO SCRIPT (5 minutes)
------------------------------------------------------------------
 1 Govt approves an application -> credentials modal.
 2 Centre logs in -> onboarding checklist -> camera ROI -> LIVE.
 3 Trainer face scan + roster claim (e.g. claims 12).
 4 Demo Lab runs the sample video (camera sees 7).
 5 Flag A1 appears on Gov dashboard with blurred evidence and why-text.
 6 Run "hide equipment" scenario -> E1 flag.
 7 Run "cover camera" scenario -> C1 flag.
 8 Toggle offline, run session, toggle online -> sync catch-up.
 9 Show accuracy page (FP/FN) and privacy matrix.

12. PROBLEM-STATEMENT COVERAGE (no compromise)
------------------------------------------------------------------
 Estimate attendance + cross-check with records -> hourly consolidation + flag A1-A4
 Presence + apparent operability of equipment   -> equipment status + E1-E3
 Flags to dashboard, no manual footage review   -> flag console + blurred evidence
 Rural bandwidth and camera quality limits      -> edge inference, quality gate, sync
 Privacy, aggregate not facial                  -> blur, discard, staff-only 1:1 face
 Deliverable: working pipeline on sample footage-> Demo Lab
 Deliverable: dashboard                         -> Gov app
 Deliverable: privacy design note               -> section 6 + docs
 Deliverable: FP/FN accuracy assessment         -> eval/ + Gov /accuracy page
 Deliverable: low-bandwidth mode                -> section 7

13. KNOWN LIMITATIONS (say these honestly to judges)
------------------------------------------------------------------
 - Operability from video is heuristic: screens on/off, machine in use
   at least once per session. Mechanical faults cannot be seen.
 - Crowded or occluded rooms raise UNCERTAIN rate; those go to review,
   not automatic accusation.
 - Demo uses sample/simulated footage; one backend plays the edge node.
 - Login and attendance claims need Atlas (internet). Capture, vision
   pipeline and ledger keep working offline and sync later.
 - Free ngrok URLs may change on restart; update NEXT_PUBLIC_API_URL.
 - Tokens are kept in browser storage for the demo; production would
   use httpOnly cookies on a shared domain.
 - Atlas free tier has 512 MB; evidence has a 90-day TTL and thumbnails
   are capped at 60 KB.