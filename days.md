# 🌊 FloodLens — 5-Day Development Plan
> **Hackathon:** NAKSHATRA 2026 — The Aerospace Hackathon
> **Team:** Code Matrix
> **Frontend:** Garima, Bhavna | **Backend:** Bipasha, Krishna

---

## 👥 Team Overview

| Developer | Role | Focus Area |
|-----------|------|------------|
| 🎨 **Garima** | Frontend Dev | UI Layout, Map Visualization, Dashboard |
| 🎨 **Bhavna** | Frontend Dev | Forms, Reports, Charts, UX Polish |
| ⚙️ **Bipasha** | Backend Dev | Data Ingestion, Preprocessing, Indices |
| ⚙️ **Krishna** | Backend Dev | Change Detection, Accuracy Gate, Impact |

---

## 📅 DAY 1 — Setup & Foundation
> **Goal:** Project scaffold, data pipeline skeleton, base UI

### ⚙️ Bipasha (Backend)
- [ ] Set up Python project structure (FastAPI / Flask)
- [ ] Integrate Sentinel-2 data fetching (pre + post flood scenes)
- [ ] Implement cloud masking pipeline
- [ ] Set up GeoTIFF handling with `rasterio`
- [ ] AOI clipping and co-registration logic

### ⚙️ Krishna (Backend)
- [x] Set up Sentinel-1 SAR data ingestion
- [x] Load static layers: DEM, JRC (permanent water), OSM settlements
- [x] Define project data models and folder structure
- [x] Set up database (PostGIS / SQLite) for metadata storage
- [x] API skeleton: define all REST endpoints

### 🎨 Garima (Frontend)
- [ ] Initialize React / Next.js project
- [ ] Set up Tailwind CSS + component library
- [ ] Create base layout: Sidebar, Header, Main content area
- [ ] Integrate Leaflet.js / Mapbox for the base map
- [ ] Add AOI selection tool on the map (draw bounding box)

### 🎨 Bhavna (Frontend)
- [ ] Design and build the Landing / Home page
- [ ] Create Input Panel (date range picker, satellite source selector)
- [ ] Set up routing between pages
- [ ] Create loading/progress indicator components
- [ ] Connect frontend to backend API base URL

---

## 📅 DAY 2 — Core Detection Pipeline
> **Goal:** Water index computation + thresholding + change detection working

### ⚙️ Bipasha (Backend)
- [x] Implement **NDWI** computation (Sentinel-2 bands)
- [x] Implement **MNDWI** computation
- [x] Implement **AWEI** computation
- [x] Implement **SAR VV/VH** band processing (Sentinel-1)
- [x] Otsu thresholding per scene for each index

### ⚙️ Krishna (Backend)
- [x] Implement **majority vote** ensemble (combine all 4 index results)
- [x] Implement **Change Detection**: post-flood minus permanent water (JRC baseline)
- [x] Expose `/api/detect` endpoint (accepts AOI + dates, returns flood mask)
- [x] Save intermediate GeoTIFF outputs
- [x] Write unit tests for detection logic

### 🎨 Garima (Frontend)
- [ ] Build **Flood Map Viewer** — display GeoTIFF flood mask overlay on map
- [ ] Add layer toggle: NDWI / MNDWI / AWEI / SAR / Final mask
- [ ] Add color-coded flood extent visualization (blue gradient)
- [ ] Implement map legend component
- [ ] Connect to `/api/detect` endpoint and render result

### 🎨 Bhavna (Frontend)
- [ ] Build **Detection Settings Panel** (index selection checkboxes, threshold sliders)
- [ ] Add "Run Detection" button with loading state
- [ ] Display detection status messages / progress steps
- [ ] Show pre/post satellite image thumbnails side-by-side
- [ ] Handle API error states gracefully

---

## 📅 DAY 3 — Accuracy Refinement & Quality Gate
> **Goal:** Refinement pipeline + accuracy gate feedback loop

### ⚙️ Bipasha (Backend)
- [ ] Implement **HAND** (Height Above Nearest Drainage) filter using DEM
- [ ] Implement **slope filtering** to remove false positives on steep terrain
- [ ] Implement **SAR speckle cleaning** (Lee filter / median filter)
- [ ] Implement **SAR gap fill** — replace optical gaps with SAR data
- [ ] Expose `/api/refine` endpoint

### ⚙️ Krishna (Backend)
- [x] Implement **Accuracy Gate**: IoU and F1 score vs reference mask
- [x] Implement **re-run loop**: if score below threshold → adjust Otsu params → re-run
- [x] Set configurable accuracy target threshold (default IoU > 0.75)
- [x] Log each iteration's accuracy scores to database
- [x] Expose `/api/accuracy` endpoint returning scores + iteration history

### 🎨 Garima (Frontend)
- [ ] Build **Accuracy Dashboard** panel
- [ ] Display IoU and F1 score as gauge/progress bars
- [ ] Show refinement iteration history (iteration # vs accuracy chart)
- [ ] Highlight accuracy gate pass/fail status with color indicators
- [ ] Add "Rerun with refined thresholds" button

### 🎨 Bhavna (Frontend)
- [ ] Build **Refinement Controls Panel** (HAND toggle, slope threshold, speckle filter toggle)
- [ ] Add visual diff: before refinement vs after refinement flood mask
- [ ] Show which gaps were filled by SAR (SAR gap fill layer)
- [ ] Add accuracy threshold configuration input
- [ ] Show feedback loop animation when retuning is triggered

---

## 📅 DAY 4 — Settlement Impact + Outputs
> **Goal:** Impact assessment, report generation, all outputs working

### ⚙️ Bipasha (Backend)
- [ ] Overlay flood mask with OSM settlement polygons
- [ ] Calculate **flood % per settlement** (area intersection)
- [ ] Flag settlements as: 🔴 Severely Affected / 🟡 Partially Affected / 🟢 Safe
- [ ] Export final **Flood Map as GeoTIFF and GeoJSON**
- [ ] Expose `/api/impact` endpoint

### ⚙️ Krishna (Backend)
- [x] Generate **Settlement Impact CSV Report** (name, population, flood %, flag)
- [x] Set up **Live Dashboard** data endpoint (WebSocket or polling `/api/live`)
- [x] Add background job queue for long-running detections (Celery / asyncio)
- [x] Final API integration testing (all endpoints end-to-end)
- [x] Write API documentation (Swagger / README)

### 🎨 Garima (Frontend)
- [ ] Build **Settlement Impact Map Layer** — color-coded settlement polygons
- [ ] Add click-on-settlement popup: name, flood %, status badge
- [ ] Implement **Live Dashboard** page with real-time data updates
- [ ] Add animated flood extent layer for live mode
- [ ] Map controls: zoom to affected area, filter by severity

### 🎨 Bhavna (Frontend)
- [ ] Build **Settlement Impact Table** (sortable by flood %, filterable by flag)
- [ ] Add **bar/pie charts** — affected vs safe settlements breakdown
- [ ] Build **CSV Download** button for settlement report
- [ ] Build **GeoJSON / GeoTIFF Export** download buttons
- [ ] Create printable summary report page

---

## 📅 DAY 5 — Integration, Polish & Demo Prep
> **Goal:** Full end-to-end integration, bug fixes, UI polish, demo ready

### ⚙️ Bipasha (Backend)
- [ ] Full pipeline integration test with real Sentinel data
- [ ] Performance optimization (caching, parallel processing)
- [ ] Fix all backend bugs found during integration
- [ ] Deploy backend to cloud / local server
- [ ] Verify all API endpoints respond correctly

### ⚙️ Krishna (Backend)
- [ ] Load test the API (simulate concurrent requests)
- [ ] Add error handling and logging throughout
- [ ] Seed demo dataset (pre-loaded flood event for demo)
- [ ] Final documentation update
- [ ] Support frontend team with any API issues

### 🎨 Garima (Frontend)
- [ ] Full end-to-end UI testing across all pages
- [ ] Fix map rendering bugs / layer z-index issues
- [ ] Add responsive design fixes (laptop/tablet view)
- [ ] Smooth out page transitions and loading states
- [ ] Prepare demo walkthrough flow on the map

### 🎨 Bhavna (Frontend)
- [ ] UI polish — typography, spacing, color consistency
- [ ] Add tooltips and help text throughout the app
- [ ] Cross-browser testing
- [ ] Create onboarding / how-to-use overlay for demo judges
- [ ] Final review of all downloadable outputs (CSV, GeoJSON, GeoTIFF)

---

## 🎯 Feature Completion Checklist

| Feature | Owner | Status |
|---------|-------|--------|
| Sentinel-2 ingestion | Bipasha | ✅ |
| Sentinel-1 SAR ingestion | Krishna | ✅ |
| DEM / JRC / OSM static layers | Krishna | ✅ |
| Cloud masking & preprocessing | Bipasha | ✅ |
| NDWI computation | Bipasha | ✅ |
| MNDWI computation | Bipasha | ✅ |
| AWEI computation | Bipasha | ✅ |
| SAR VV/VH processing | Bipasha | ✅ |
| Otsu thresholding | Bipasha | ✅ |
| Majority vote ensemble | Krishna | ✅ |
| Change detection (post - JRC) | Krishna | ✅ |
| HAND + slope refinement | Bipasha | ✅ |
| Speckle cleaning | Bipasha | ✅ |
| SAR gap fill | Bipasha | ✅ |
| Accuracy gate (IoU, F1) | Krishna | ✅ |
| Threshold retune feedback loop | Krishna | ✅ |
| Settlement impact overlay | Bipasha | ⬜ |
| Flood % per settlement | Bipasha | ⬜ |
| GeoTIFF / GeoJSON export | Krishna | ✅ |
| Settlement CSV report | Krishna | ✅ |
| Live dashboard backend | Krishna | ✅ |
| Base map + AOI selector | Garima | ⬜ |
| Flood map layer viewer | Garima | ⬜ |
| Accuracy dashboard | Garima | ⬜ |
| Settlement impact map layer | Garima | ⬜ |
| Live dashboard UI | Garima | ⬜ |
| Input & settings panel | Bhavna | ⬜ |
| Refinement controls panel | Bhavna | ⬜ |
| Settlement impact table + charts | Bhavna | ⬜ |
| Export download buttons | Bhavna | ⬜ |
| Demo polish & onboarding | Bhavna | ⬜ |

---

## 🚀 Daily Sync Schedule

| Time | Activity |
|------|----------|
| **9:00 AM** | Daily standup (all 4 devs, 15 min) |
| **1:00 PM** | Mid-day check-in (frontend ↔ backend API sync) |
| **9:00 PM** | End-of-day review + next day task confirmation |

---

> ✅ **Definition of Done:** All checklist items marked complete, full demo run successful with real flood dataset, all 3 outputs (Flood Map, Settlement Report, Live Dashboard) working.
