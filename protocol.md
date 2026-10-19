# FloodLens — PROTOCOL.md
> **This is the single source of truth for all AI-assisted and human development on this project.**
> Before writing a single line of code, making any edit, or answering any question about this
> project — read and internalize everything in this file. You may not go beyond what is defined here.

---

## ⚠️ HOW TO USE THIS FILE

If you are an AI model working on this codebase:

1. **Read this entire file first.** Do not skip sections.
2. The **Rules** section defines what you are allowed to do and how.
3. The **Days Plan** section defines what should be built and when — do not build ahead of schedule or skip tasks.
4. The **Architecture** section defines the technical boundaries — do not introduce tools, libraries, or patterns outside of what is listed.
5. If anything is unclear or falls outside this protocol, **stop and ask** — do not assume.

---

---

# SECTION 1 — RULES

> Source: `rules.md`
> These rules are non-negotiable. Every action must pass through them.

---

## Rule 1 — Analyse First, Ask Before Editing

**Before touching any file:**

1. **Read & understand** the file and its role in the codebase.
2. **Write out a clear plan** — what will change, why, and what might break.
3. **Ask for permission** and wait for explicit approval before making the edit.
4. Only then make the change — no surprise edits.

```
❌  Wrong:  Edit file → tell user what changed
✅  Right:  Analyse → explain plan → get approval → edit
```

> Applies to: source files, configs, `.env`, database schemas, and any file
> that affects how the app runs.

---

## Rule 2 — No GitHub Push Without Permission

- **Never** run `git push` or any variant without asking first.
- Before pushing, always confirm:
  - Which branch?
  - Is the code tested and working?
  - Should a pull request be opened instead?
- Force pushes (`--force`) are **strictly forbidden** without explicit written approval.

```
❌  git push                          ← never silently
✅  "Ready to push — shall I push to 'main' or open a PR?"
```

> Same rule applies to: creating tags, merging branches, deleting remote branches.

---

## Rule 3 — Dummy Data Must Live in a Centralised Object

All placeholder / mock data in the frontend must be:
- Defined as a **named export** at the top of `src/data/` — never inlined in JSX.
- Named with the correct prefix:

| Prefix | Meaning |
|--------|---------|
| `MOCK_` | Temporary placeholder → will be replaced by real API |
| `STATIC_` | Permanent — will never change (e.g. severity label maps) |
| `DEFAULT_` | Pre-API fallback values |

```js
// ✅ Correct — src/data/settlements.js
export const MOCK_SETTLEMENTS = [
  { id: 1, name: 'Hayaghat', district: 'Darbhanga', flooded_pct: 78, severity: 'severe' },
]
// Swap to real API in one line:
// const { data } = useQuery({ queryKey: ['settlements'], queryFn: settlementAPI.list })

// ❌ Wrong — data buried inside JSX
<table>{ [{ name: 'Hayaghat'... }].map(...) }</table>
```

**Data folder structure:**
```
src/data/
├── settlements.js   ← MOCK_SETTLEMENTS
├── reports.js       ← MOCK_REPORTS
├── jobs.js          ← MOCK_RECENT_JOBS
└── stats.js         ← MOCK_STATS, DEFAULT_SUMMARY
```

---

## Pre-Action Checklist (run before every change)

- [ ] Read and understood the file being changed
- [ ] Written out the plan and got explicit approval
- [ ] Mock data is in `src/data/` not inline
- [ ] No `git push` without confirmation
- [ ] Change is within the current Day's scope (see Section 2)
- [ ] Change uses only approved tech stack (see Section 3)

---

---

# SECTION 2 — DAYS PLAN

> Source: `days.md`
> This is the sprint plan. Do not build features assigned to a future day.
> Do not skip tasks within the current day without flagging it.

---

## Team

| Developer | Role | Focus |
|-----------|------|-------|
| 🎨 **Garima** | Frontend | UI Layout, Map Visualization, Dashboard |
| 🎨 **Bhavna** | Frontend | Forms, Reports, Charts, UX Polish |
| ⚙️ **Bipasha** | Backend | Data Ingestion, Preprocessing, Indices |
| ⚙️ **Krishna** | Backend | Change Detection, Accuracy Gate, Impact |

---

## DAY 1 — Setup & Foundation
> **Goal:** Project scaffold, data pipeline skeleton, base UI

**Bipasha (Backend)**
- [ ] Set up Python project structure (FastAPI)
- [ ] Integrate Sentinel-2 data fetching (pre + post flood scenes)
- [ ] Implement cloud masking pipeline
- [ ] Set up GeoTIFF handling with `rasterio`
- [ ] AOI clipping and co-registration logic

**Krishna (Backend)**
- [ ] Set up Sentinel-1 SAR data ingestion
- [ ] Load static layers: DEM, JRC (permanent water), OSM settlements
- [ ] Define project data models and folder structure
- [ ] Set up database (PostGIS / SQLite) for metadata storage
- [ ] API skeleton: define all REST endpoints

**Garima (Frontend)**
- [ ] Initialize React + Vite project
- [ ] Set up TailwindCSS + component library
- [ ] Create base layout: Sidebar, Header, Main content area
- [ ] Integrate Leaflet.js for the base map
- [ ] Add AOI selection tool on the map (draw bounding box)

**Bhavna (Frontend)**
- [ ] Design and build the Landing / Home page
- [ ] Create Input Panel (date range picker, satellite source selector)
- [ ] Set up routing between pages
- [ ] Create loading/progress indicator components
- [ ] Connect frontend to backend API base URL

---

## DAY 2 — Core Detection Pipeline
> **Goal:** Water index computation + thresholding + change detection working

**Bipasha (Backend)**
- [ ] Implement NDWI (Sentinel-2 bands)
- [ ] Implement MNDWI
- [ ] Implement AWEI
- [ ] Implement SAR VV/VH band processing (Sentinel-1)
- [ ] Otsu thresholding per scene for each index

**Krishna (Backend)**
- [ ] Implement majority vote ensemble (combine all 4 index results)
- [ ] Implement Change Detection: post-flood minus permanent water (JRC baseline)
- [ ] Expose `/api/detect` endpoint
- [ ] Save intermediate GeoTIFF outputs
- [ ] Write unit tests for detection logic

**Garima (Frontend)**
- [ ] Build Flood Map Viewer — display GeoTIFF flood mask overlay
- [ ] Add layer toggle: NDWI / MNDWI / AWEI / SAR / Final mask
- [ ] Add color-coded flood extent visualization
- [ ] Implement map legend component
- [ ] Connect to `/api/detect` and render result

**Bhavna (Frontend)**
- [ ] Build Detection Settings Panel (index checkboxes, threshold sliders)
- [ ] Add "Run Detection" button with loading state
- [ ] Display detection status messages / progress steps
- [ ] Show pre/post satellite image thumbnails side-by-side
- [ ] Handle API error states gracefully

---

## DAY 3 — Accuracy Refinement & Quality Gate
> **Goal:** Refinement pipeline + accuracy gate feedback loop

**Bipasha (Backend)**
- [ ] Implement HAND (Height Above Nearest Drainage) filter using DEM
- [ ] Implement slope filtering to remove false positives
- [ ] Implement SAR speckle cleaning (Lee / median filter)
- [ ] Implement SAR gap fill — replace optical gaps with SAR data
- [ ] Expose `/api/refine` endpoint

**Krishna (Backend)**
- [ ] Implement Accuracy Gate: IoU and F1 score vs reference mask
- [ ] Implement re-run loop: if score below threshold → adjust Otsu → re-run
- [ ] Set configurable accuracy target (default IoU > 0.75)
- [ ] Log each iteration's accuracy scores to database
- [ ] Expose `/api/accuracy` endpoint

**Garima (Frontend)**
- [ ] Build Accuracy Dashboard panel
- [ ] Display IoU and F1 score as gauge/progress bars
- [ ] Show refinement iteration history chart
- [ ] Highlight accuracy gate pass/fail with color indicators
- [ ] Add "Rerun with refined thresholds" button

**Bhavna (Frontend)**
- [ ] Build Refinement Controls Panel (HAND toggle, slope threshold, speckle filter)
- [ ] Add visual diff: before vs after refinement flood mask
- [ ] Show SAR gap fill layer
- [ ] Add accuracy threshold configuration input
- [ ] Show feedback loop animation when retuning triggers

---

## DAY 4 — Settlement Impact + Outputs
> **Goal:** Impact assessment, report generation, all outputs working

**Bipasha (Backend)**
- [ ] Overlay flood mask with OSM settlement polygons
- [ ] Calculate flood % per settlement (area intersection)
- [ ] Flag settlements: 🔴 Severely Affected / 🟡 Partially / 🟢 Safe
- [ ] Export final Flood Map as GeoTIFF and GeoJSON
- [ ] Expose `/api/impact` endpoint

**Krishna (Backend)**
- [ ] Generate Settlement Impact CSV Report
- [ ] Set up Live Dashboard data endpoint (WebSocket or `/api/live` polling)
- [ ] Add background job queue (Celery / asyncio)
- [ ] Final API integration testing
- [ ] Write API documentation (Swagger / README)

**Garima (Frontend)**
- [ ] Build Settlement Impact Map Layer — color-coded settlement polygons
- [ ] Add click-on-settlement popup: name, flood %, status badge
- [ ] Implement Live Dashboard page with real-time updates
- [ ] Add animated flood extent layer for live mode
- [ ] Map controls: zoom to affected area, filter by severity

**Bhavna (Frontend)**
- [ ] Build Settlement Impact Table (sortable, filterable)
- [ ] Add bar/pie charts — affected vs safe settlements
- [ ] Build CSV Download button
- [ ] Build GeoJSON / GeoTIFF Export buttons
- [ ] Create printable summary report page

---

## DAY 5 — Integration, Polish & Demo Prep
> **Goal:** Full end-to-end integration, bug fixes, UI polish, demo ready

**Bipasha (Backend)**
- [ ] Full pipeline integration test with real Sentinel data
- [ ] Performance optimization (caching, parallel processing)
- [ ] Fix all backend bugs found during integration
- [ ] Deploy backend to cloud / local server
- [ ] Verify all API endpoints respond correctly

**Krishna (Backend)**
- [ ] Load test the API
- [ ] Add error handling and logging throughout
- [ ] Seed demo dataset (pre-loaded flood event)
- [ ] Final documentation update
- [ ] Support frontend team with any API issues

**Garima (Frontend)**
- [ ] Full end-to-end UI testing across all pages
- [ ] Fix map rendering bugs / layer z-index issues
- [ ] Responsive design fixes (laptop/tablet)
- [ ] Smooth page transitions and loading states
- [ ] Prepare demo walkthrough flow

**Bhavna (Frontend)**
- [ ] UI polish — typography, spacing, color consistency
- [ ] Add tooltips and help text throughout
- [ ] Cross-browser testing
- [ ] Create onboarding / how-to-use overlay for demo judges
- [ ] Final review of all downloadable outputs

---

## Daily Sync Schedule

| Time | Activity |
|------|----------|
| **9:00 AM** | Daily standup — all 4 devs, 15 min |
| **1:00 PM** | Mid-day check-in — frontend ↔ backend API sync |
| **9:00 PM** | End-of-day review + next day task confirmation |

---

## Definition of Done

> ✅ All checklist items marked complete · Full demo run successful with real flood dataset ·
> All 3 outputs working: **Flood Map**, **Settlement Report**, **Live Dashboard**

---

---

# SECTION 3 — ARCHITECTURE

> Source: `architecture.md`
> These are the approved technical boundaries.
> Do NOT introduce any library, service, pattern, or tool outside of what is listed here.

---

## Approved Tech Stack

### Frontend — only these tools

| Concern | Approved Library | NOT allowed |
|---------|-----------------|-------------|
| Build | Vite 5 | CRA, Parcel, Webpack |
| UI Framework | React 18 | Vue, Angular, Svelte |
| Styling | TailwindCSS 3 | Bootstrap, MUI, Chakra UI |
| Routing | React Router v6 | TanStack Router, Next.js |
| Map | Leaflet.js + react-leaflet | Mapbox (paid), Google Maps |
| Charts | Recharts | Chart.js, D3 (unless approved) |
| State | Zustand + React Query | Redux, MobX, Recoil |
| HTTP | Axios | fetch (unless tiny call) |
| Icons | Lucide React | FontAwesome, HeroIcons |

### Backend — only these tools

| Concern | Approved Library | NOT allowed |
|---------|-----------------|-------------|
| Framework | FastAPI + Uvicorn | Django, Flask, Express |
| GEE | `earthengine-api` | Any third-party GEE wrappers |
| Raster | `rasterio`, `GDAL` | pillow (for raster ops) |
| Vector/GIS | `geopandas`, `shapely` | QGIS scripting in runtime |
| Task Queue | Celery + Redis | RQ, Huey |
| ORM | SQLAlchemy + GeoAlchemy2 | raw SQL, Tortoise ORM |
| Auth | `python-jose` (JWT) | Auth0, Firebase Auth |
| Reports | `reportlab` | WeasyPrint (unless approved) |
| Storage | S3 / local filesystem | Firebase Storage |

---

## System Boundary Diagram

```
BROWSER
  └── React App (Vite :3000)
        │  HTTPS + WebSocket
        ▼
  FastAPI (:8000)
        ├── /api/auth
        ├── /api/flood      ← triggers GEE pipeline via Celery
        ├── /api/settlements
        ├── /api/reports
        └── /api/config
              │
        ┌─────┴────────────────────┐
        ▼                          ▼
  Google Earth Engine        PostgreSQL + PostGIS
  (Sentinel-2/1, Landsat)    (settlement data, job logs)
        │
        ▼
  rasterio / geopandas       Redis
  (raster→vector, OSM)       (Celery broker + cache)
        │
        ▼
  S3 / Local Storage
  (GeoTIFF, Shapefile, PDF)
```

---

## API Endpoints (approved, do not add new ones without discussion)

| Method | Endpoint | Owner |
|--------|----------|-------|
| POST | `/api/auth/login` | Krishna |
| GET | `/api/auth/me` | Krishna |
| POST | `/api/flood/detect` | Krishna |
| GET | `/api/flood/status/{job_id}` | Krishna |
| GET | `/api/flood/results/{job_id}` | Krishna |
| GET | `/api/flood/summary` | Krishna |
| GET | `/api/settlements/affected` | Bipasha |
| GET | `/api/settlements/{id}` | Bipasha |
| GET | `/api/reports` | Krishna |
| GET | `/api/reports/{id}/download` | Krishna |
| POST | `/api/config/aoi` | Krishna |
| GET | `/api/config` | Krishna |
| WS | `/ws/updates` | Krishna |

---

## Processing Pipeline (fixed steps — do not reorder or skip)

```
1. GEE Image Collection   (Sentinel-2 / Landsat, filtered by AOI + dates + cloud %)
2. Cloud & Shadow Mask    (QA60 band)
3. Index Calculation      (NDWI / MNDWI / AWEI as selected)
4. SAR Processing         (Sentinel-1 VV/VH if enabled)
5. Otsu Thresholding      (per index, per scene)
6. Majority Vote Ensemble (combine index results)
7. Change Detection       (post-flood XOR permanent water JRC baseline)
8. HAND + Slope Filter    (remove false positives)
9. SAR Gap Fill           (replace optical gaps)
10. Accuracy Gate         (IoU > 0.75 — re-run if below)
11. Raster → Vector       (rasterio + shapely → GeoJSON)
12. Settlement Intersect  (geopandas join with OSM + admin boundaries)
13. Export                (GeoTIFF + Shapefile + PDF report → storage)
```

---

## Data Sources (approved, do not add without discussion)

| Source | What it provides |
|--------|-----------------|
| Sentinel-2 | Optical multispectral, 10m — NDWI/MNDWI bands |
| Sentinel-1 | SAR, cloud-penetrating — VV/VH bands |
| Landsat-8/9 | Optical, 30m — backup/comparison |
| JRC Global Water | Permanent water baseline |
| SRTM DEM | Elevation for HAND filter |
| OpenStreetMap | Settlement polygons, roads (via Overpass API) |
| QGIS Admin Layers | District/state boundaries (static Shapefile) |

---

## File & Folder Boundaries (do not create files outside these)

```
floodlens-frontend/src/
├── pages/          ← one file per route
├── components/
│   ├── layout/     ← Sidebar, TopBar, Layout
│   ├── ui/         ← reusable atoms (StatCard, Badge, Spinner)
│   └── map/        ← Leaflet components only
├── data/           ← ALL mock data (MOCK_*, STATIC_*, DEFAULT_*)
├── services/       ← api.js (Axios) + store.js (Zustand)
├── hooks/          ← custom React hooks only
└── utils/          ← pure helper functions only

floodlens-backend/app/
├── routers/        ← one file per domain
├── services/       ← GEE, GIS, Report business logic
└── models/         ← SQLAlchemy models only
```

---

*Last updated: Oct 19, 2026 · Maintained by: Code Matrix team*
