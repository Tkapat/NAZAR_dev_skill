# Dev_Skill SIH 2026 — Smart India Hackathon Project

**Real-time Attendance & Compliance Monitoring System** for skill development centres using AI-powered camera analytics.

---

## 📁 Repository Structure

```
dev_skill/
├── .gitignore                          # Root gitignore (this file)
├── README.md                           # This file
├── detection.md                        # Detection system documentation
├── schema.md                           # Database schema
├── totalWorkflow.md                    # Complete workflow documentation
│
├── dev_skill_backend/                  # FastAPI + MongoDB Backend
│   ├── app/
│   │   ├── core/                       # Config, DB, Auth, Rate limiting
│   │   ├── db/                         # MongoDB connection + serialization
│   │   ├── models/                     # Pydantic models
│   │   ├── routers/                    # API endpoints
│   │   │   ├── attendance.py           # Attendance claims
│   │   │   ├── cameras.py              # Camera CRUD + approval
│   │   │   ├── calendar.py             # Calendar + timeline
│   │   │   ├── centre.py               # Centre management
│   │   │   ├── compliance.py           # Compliance computation
│   │   │   ├── edge.py                 # Edge device endpoints
│   │   │   ├── equipment.py            # Equipment declarations
│   │   │   ├── live.py                 # Live frames + status
│   │   │   ├── reports.py              # Centre reports
│   │   │   ├── schedule.py             # Sessions + batches
│   │   │   ├── schemes.py              # Trade templates
│   │   │   └── applications.py         # Centre applications
│   │   ├── services/
│   │   │   ├── live.py                 # Core detection processing
│   │   │   ├── vision/
│   │   │   │   ├── detector.py         # YOLOv8 wrapper
│   │   │   │   ├── cleanup.py          # Detection filtering
│   │   │   │   └── privacy.py          # Blur/thumbnails
│   │   │   ├── consolidation.py        # Statistical consolidation
│   │   │   ├── monitor.py              # Run management
│   │   │   └── dbfuncs.py              # Risk, sessions, attendance
│   │   └── main.py                     # FastAPI app entry
│   ├── scripts/
│   │   ├── init_db.py                  # Database initialization
│   │   ├── repair_cameras.py           # Camera deduplication
│   │   └── repair_sessions.py          # Session repair
│   ├── requirements.txt                # Python dependencies
│   ├── pyproject.toml                  # Project config
│   └── README.md                       # Backend-specific docs
│
├── dev_skill_center/                   # Centre Portal (Next.js 16 + React 19)
│   ├── app/
│   │   ├── (app)/                      # Authenticated routes
│   │   │   ├── live/                   # Live Monitor (streaming)
│   │   │   ├── cameras/                # Camera setup + zones
│   │   │   ├── schedule/               # Calendar + sessions
│   │   │   ├── trainees/               # Trainee management
│   │   │   ├── staff/                  # Staff + face enrolment
│   │   │   ├── equipment/              # Equipment declarations
│   │   │   ├── flags/                  # Compliance flags
│   │   │   ├── notices/                # Govt notices
│   │   │   ├── requests/               # Change requests
│   │   │   ├── settings/               # Centre settings
│   │   │   └── onboarding/             # First-time setup
│   │   ├── login/                      # Login page
│   │   └── change-password/            # Password change
│   ├── components/
│   │   ├── shared/                     # Reusable UI components
│   │   │   ├── ComplianceBoard.tsx     # Real-time compliance
│   │   │   ├── StatusChip.tsx          # Status indicators
│   │   │   ├── PageHeader.tsx
│   │   │   └── ...
│   │   └── ui/                         # shadcn/ui primitives
│   ├── hooks/                          # Custom React hooks
│   ├── lib/                            # Utilities, API, constants
│   ├── public/                         # Static assets
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
│
└── dev_skill_govt/                     # Government Portal (Next.js 16 + React 19)
    ├── app/
    │   ├── (app)/                      # Authenticated routes
    │   │   ├── live/                   # Live wall (all centres)
    │   │   ├── centres/                # Centre list + detail
    │   │   │   ├── [id]/               # Centre detail tabs
    │   │   │   │   ├── live-tab.tsx    # Live monitoring + compliance
    │   │   │   │   ├── calendar-tab.tsx
    │   │   │   │   ├── schedule-tab.tsx
    │   │   │   │   └── page.tsx
    │   │   │   └── page.tsx
    │   │   ├── overview/               # Dashboard with map
    │   │   ├── sessions/               # Session board
    │   │   ├── flags/                  # Flag management
    │   │   ├── cameras/                # Camera approvals
    │   │   ├── applications/           # Centre applications
    │   │   ├── schemes/                # Trade templates
    │   │   ├── reports/                # Analytics
    │   │   ├── enforcement/            # Notices
    │   │   └── settings/               # Govt settings
    │   ├── login/
    │   └── change-password/
    ├── components/
    │   ├── shared/                     # Reusable UI components
    │   │   ├── ComplianceBoard.tsx     # Govt compliance view
    │   │   ├── MapComponent.tsx        # Centre locations map
    │   │   ├── StatusChip.tsx
    │   │   ├── PageHeader.tsx
    │   │   └── ...
    │   └── ui/                         # shadcn/ui primitives
    ├── hooks/
    ├── lib/                            # Utilities, API, constants
    ├── public/
    ├── types/                          # Shared TypeScript types
    ├── package.json
    ├── next.config.ts
    └── tsconfig.json
```

---

## 🔄 Complete Workflow

### 1. Centre Setup (One-time)
```
Centre Admin → Registers on Govt Portal
     ↓
Govt Officer → Reviews Application → Approves
     ↓
Centre → Completes Onboarding:
    • Adds batches (weekdays, timings)
    • Declares equipment (sanctioned + actual)
    • Submits camera setup (RTSP / Browser / Webcam / Sample video)
     ↓
Govt → Approves Camera → Centre goes LIVE
```

### 2. Live Monitoring Session
```
Centre Portal (Live Monitor)                          Govt Portal (Live Wall)
┌─────────────────────────────────────┐               ┌─────────────────────────────────────┐
│ 1. Select/Start Session             │               │ 1. Auto-polls /live (5s)           │
│ 2. Auto-creates "This computer"     │               │ 2. Shows all centres' live cams    │
│    browser camera                   │               │ 3. Compliance verdict chips        │
│ 3. Starts camera (getUserMedia)     │               │ 4. Opens /centres/{id}/live for    │
│ 4. POST /my/cameras/{id}/frame      │               │    detailed compliance board       │
│    every 10s (configurable)         │               └─────────────────────────────────────┘
│ 5. Draws YOLO boxes on canvas       │
│ 6. Shows People/Equipment counts    │
└─────────────────────────────────────┘
```

### 3. Detection Pipeline (Backend)
```
Frame Upload (POST /my/cameras/{cid}/frame)
         │
         ▼
┌──────────────────────────────────────────────┐
│ _process(cam, frame)                         │
│   1. Get active session                      │
│   2. Load trade template (detector_classes)  │
│   3. YOLOv8 detect() → raw detections       │
│   4. cleanup(dets, presence_rule)            │
│      • ROI filter                            │
│      • Presence rule: any | seated | zone    │
│      • Staff subtraction (verified trainer)  │
│   5. item_usage() → equipment in_use/idle   │
│   6. Count people = counted people          │
│   7. Save blurred thumbnail                  │
│   8. Upsert live_status (MongoDB)            │
│   9. Record snapshot (if session)           │
│  10. Return {people, items, boxes, state}   │
└──────────────────────────────────────────────┘
```

### 4. Session Consolidation & Compliance
```
Per Frame → Snapshot (people, items, quality)
     ↓
Every 5 frames → consolidate_session()
     • Statistical consolidation (tolerance + agree_ratio)
     • Output: observed, ci_low, ci_high, consistent
     ↓
Session End → Final consolidation (all cameras)
     ↓
Compliance (on-demand GET /centres/{id}/compliance)
     People: enrolled, claimed, counted, delta, verdict
     Equipment: sanctioned, declared, seen, in_use, verdict
     Flags: A1-A5, E1-E3, C1-C3, M1, U1, D1, P1
     Summary: level (waiting/ok/attention/critical)
```

### 5. Flag Generation (Real-time)
```
During session:
  A1 - Attendance Inflated    (claimed > counted + margin)
  A2 - Over Capacity          (counted > sanctioned_max)
  A4 - Ghost Session          (claimed > 0, counted == 0)
  A5 - Unregistered           (counted > claimed + margin)
  U1 - Unverifiable           (counts inconsistent)
  E1 - Equipment Missing      (seen < sanctioned)
  E3 - Declaration Mismatch   (declared ≠ sanctioned)
  C2 - Replay Suspicion       (duplicate frames)
  C3 - Missed Capture         (no camera data, claim exists)
  M1 - Session Not Held       (scheduled, no snapshots)
```

---

## 🛠 Technology Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI (Python 3.11+), MongoDB (Atlas), Motor/PyMongo |
| **AI/ML** | YOLOv8/YOLO11 (ultralytics), OpenCV, TorchVision |
| **Centre Portal** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| **Govt Portal** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| **UI Components** | shadcn/ui, Radix UI, Lucide Icons |
| **State/Query** | TanStack Query (React Query), React Compiler compatible |
| **Animations** | GSAP (only), Framer Motion removed |
| **Charts** | Recharts, Sparklines |
| **Auth** | JWT (access + refresh), HttpOnly cookies |
| **Rate Limiting** | SlowAPI (Redis-backed) |
| **Deployment** | Vercel (frontends), Docker/VM (backend) |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- pnpm 9+
- MongoDB Atlas cluster
- CUDA GPU (recommended for detection)

### Backend
```bash
cd dev_skill_backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with MONGODB_URI, JWT_SECRET, etc.
python scripts/init_db.py
uvicorn app.main:app --reload --port 8000
```

### Centre Portal
```bash
cd dev_skill_center
pnpm install
cp .env.example .env.local
# Edit NEXT_PUBLIC_API_URL
pnpm dev
# http://localhost:3000
```

### Govt Portal
```bash
cd dev_skill_govt
pnpm install
cp .env.example .env.local
# Edit NEXT_PUBLIC_API_URL
pnpm dev
# http://localhost:3001
```

---

## 🔐 Environment Variables

### Backend (`dev_skill_backend/.env`)
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/devskill
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-refresh-secret
REDIS_URL=redis://localhost:6379
LIVE_DEFAULT_INTERVAL_S=10
RECORD_PROVISIONAL=true
CONSOLIDATE_EVERY_SNAPSHOTS=5
```

### Centre Portal (`dev_skill_center/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Govt Portal (`dev_skill_govt/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 📊 Key API Endpoints

| Endpoint | Role | Description |
|----------|------|-------------|
| `POST /my/cameras/{cid}/frame` | Centre | Upload frame → get counts + boxes |
| `GET /my/live` | Centre | My centre's live cameras |
| `GET /my/compliance?session_id=` | Centre | My compliance for session |
| `POST /my/live/demo-session` | Centre | Start 60-min demo session |
| `POST /my/live/demo-claim` | Centre | Set demo attendance claim |
| `GET /live` | Govt | All centres live wall |
| `GET /centres/{cid}/live` | Govt | Centre live + timeline + flags |
| `GET /centres/{cid}/compliance` | Govt | Compliance board data |
| `GET /centres/{cid}/attendance` | Govt | Attendance series (date range) |
| `POST /centres/{cid}/compliance` | Govt | Compliance for session |
| `GET /flags?status=open` | Govt | Open flags list |

---

## 🔑 Key Configuration

### Trade Template (Detector Config)
```json
{
  "trade_name": "Electronics",
  "detector_classes": ["person", "chair", "desk", "monitor", "laptop"],
  "presence_rule": "any",
  "count_tolerance": 2,
  "agree_ratio": 0.6,
  "max_frames": 40,
  "equipment_rules": [
    {"class": "chair", "label": "Chair", "min_units_per_trainee": 1.0, "operability": "in_use_near_person", "required": true},
    {"class": "monitor", "label": "Monitor", "min_units_per_trainee": 0.5, "operability": "in_use_near_person", "required": false}
  ]
}
```

### Presence Rules
| Rule | Description | Use Case |
|------|-------------|----------|
| `any` | Count all detected people | General, demo |
| `seated` | Person must overlap chair >12% IoU | Classrooms |
| `zone` | Person in defined polygon zone | Specific areas |

---

## 📝 Development Guidelines

### Code Style
- **Backend**: Ruff (lint), pyright (types), Black (format)
- **Frontend**: ESLint + TypeScript strict, React Compiler compatible
  - No `Date.now()` in render
  - No `ref.current` reads in render (use `query.dataUpdatedAt`)
- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`)

### Testing
```bash
# Backend
pytest -v

# Frontend
pnpm test        # unit
pnpm test:e2e    # playwright
```

### Build Verification (before PR)
```bash
# Backend
cd dev_skill_backend && python -m py_compile app/**/*.py

# Centre Portal
cd dev_skill_center && npx tsc --noEmit && npm run lint && npm run build

# Govt Portal
cd dev_skill_govt && npx tsc --noEmit && npm run lint && npm run build
```

---

## 📦 Deployment

### Backend (Docker)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontends (Vercel)
- Connect GitHub repo
- Set `NEXT_PUBLIC_API_URL` to backend URL
- Deploy `dev_skill_center` → `centre.devskill.in`
- Deploy `dev_skill_govt` → `govt.devskill.in`

### MongoDB Atlas
- Create cluster
- Whitelist backend IP
- Create `devskill` database
- Run `scripts/init_db.py` once

---

## 🔍 Debugging Checklist

| Issue | Check |
|-------|-------|
| Counts not updating | Backend logs: `grep "camera=" logs/live.log` |
| Govt portal stale | Vercel redeploy needed? `live_status` TTL? |
| Person not counted | Template `presence_rule` = "any"? Chair overlap? |
| 429 Too Fast | Increase `interval_s` on camera |
| 503 Detector | First frame takes 30s, check GPU memory |
| Schema validation | `session.kind` missing → `scripts/repair_sessions.py` |

---

## 📄 Documentation Files

| File | Description |
|------|-------------|
| `detection.md` | Complete detection pipeline docs |
| `schema.md` | MongoDB collections + indexes |
| `totalWorkflow.md` | End-to-end workflow |
| `dev_skill_backend/backendFix.md` | Backend implementation log |
| `dev_skill_center/centerFronendFix.md` | Centre portal fixes |
| `dev_skill_govt/govtFrontendFix.md` | Govt portal fixes |

---

## 🤝 Contributing

1. Fork → Create feature branch
2. Make changes with tests
3. Run build verification (all 3 projects)
4. Submit PR with description

---

## 📄 License

Proprietary — Smart India Hackathon 2026 Team Dev_Skill

---

## 👥 Team

- **Backend**: FastAPI + MongoDB + YOLOv8
- **Centre Portal**: Next.js + React 19 + GSAP
- **Govt Portal**: Next.js + React 19 + Recharts
- **AI/ML**: Detection + Consolidation + Compliance

---

*Last updated: October 2026*