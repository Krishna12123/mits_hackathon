# 🛰️ FloodLens Backend API Documentation
> **NAKSHATRA 2026 Aerospace Hackathon** — Team Code Matrix  
> **Backend Architecture:** FastAPI · SQLite / PostGIS · AsyncJobQueue · WebSockets · Earth Engine

---

## 📌 Overview

The FloodLens backend powers real-time satellite flood detection, multi-index ensemble change detection, accuracy quality gating, settlement risk analysis, and live telemetry streaming for flood disaster monitoring.

- **Interactive Swagger Documentation:** [`http://localhost:8000/docs`](http://localhost:8000/docs)
- **ReDoc Documentation:** [`http://localhost:8000/redoc`](http://localhost:8000/redoc)
- **OpenAPI JSON:** [`http://localhost:8000/openapi.json`](http://localhost:8000/openapi.json)

---

## ⚙️ Quick Start

```bash
cd floodlens-backend

# 1. Activate environment
python3 -m venv venv && source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run FastAPI server with auto-reload
uvicorn main:app --reload --port 8000
```

Run test suite:
```bash
PYTHONPATH=. python3 -m unittest discover -s tests
```

---

## 📡 API Endpoints Reference

### 1. 🌊 Flood Detection & Job Queue

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/detect` | Direct detection execution; returns GeoJSON flood mask & stats immediately. |
| `POST` | `/api/flood/detect` | Enqueues detection into background job queue (or runs sync if `sync: true`). |
| `GET` | `/api/flood/status/{job_id}` | Polls job status, stage name (`data_ingestion`, `index_computation`, etc.), and progress (0–100%). |
| `GET` | `/api/flood/results/{job_id}` | Retrieves GeoJSON FeatureCollection flood vector mask for completed job. |
| `GET` | `/api/flood/summary` | Aggregated regional flood extent metrics. |
| `GET` | `/api/flood/queue` | Diagnostics on background job queue (pending jobs, active workers). |

#### Request Body (`POST /api/detect` & `POST /api/flood/detect`)
```json
{
  "satellite": "Sentinel-2",
  "index": "NDWI",
  "threshold": 0.3,
  "cloud_pct": 20,
  "aoi_lat": 26.3,
  "aoi_lon": 85.8,
  "aoi_radius_km": 150,
  "pre_date": "2026-10-11",
  "post_date": "2026-10-19",
  "min_votes": 2,
  "save_geotiff": true,
  "sync": false
}
```

---

### 2. 🏘️ Settlement Impact & CSV Exports

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/settlements/affected` | List affected settlements (supports `?severity=severe&district=Darbhanga`). |
| `GET` | `/api/settlements/{id}` | Detailed metrics for a single settlement. |
| `GET` | `/api/settlements/export/csv` | Download full settlement impact analysis as a formatted CSV file. |

#### Settlement CSV Columns
- `Settlement Name`: Name of village / town
- `District`: Administrative district
- `State`: State (e.g., Bihar)
- `Population`: Census population
- `Flooded %`: Percentage of polygon inundated
- `Impact Flag`:
  - `🔴 Severely Affected` (`>= 70%` flooded)
  - `🟡 Partially Affected` (`30% - 69.9%` flooded)
  - `🟢 Safe` (`< 30%` flooded)
- `Homes Affected`: Estimated residential units flooded
- `Farmland Flooded (ha)`: Inundated agricultural land in hectares

---

### 3. 📈 Live Dashboard Data

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/live` | Real-time telemetry, stat cards, progression timeline, and district impacts. |
| `GET` | `/api/live/dashboard` | Alias for live dashboard data endpoint. |

#### Response Sample
```json
{
  "stats": [
    { "title": "Flood Extent", "value": "254.8", "unit": "km²", "change": 12.0, "color": "blue", "description": "vs yesterday" },
    { "title": "Affected Areas", "value": "3", "unit": "Districts", "change": 0.0, "color": "yellow", "description": "Darbhanga, Sitamarhi, Muzaffarpur" },
    { "title": "At-Risk Pop.", "value": "1.2M", "unit": "people", "change": 8.0, "color": "red", "description": "settlement intersect" },
    { "title": "NDWI Score", "value": "0.74", "unit": "", "change": -3.0, "color": "green", "description": "water threshold > 0.3" },
    { "title": "Satellite Pass", "value": "4m", "unit": "ago", "change": null, "color": "purple", "description": "Sentinel-2 · 10m res." },
    { "title": "Alerts", "value": "7", "unit": "active", "change": 2.0, "color": "red", "description": "severe settlement warnings" }
  ],
  "timeline": [
    { "date": "Oct 12", "area": 0.0 },
    { "date": "Oct 19", "area": 254.8 }
  ],
  "districts": [
    { "name": "Darbhanga", "flooded": 124.9, "normal": 310.0 },
    { "name": "Sitamarhi", "flooded": 86.6, "normal": 285.0 },
    { "name": "Muzaffarpur", "flooded": 43.3, "normal": 440.0 }
  ],
  "recent_jobs": [
    { "id": "JOB-2041", "status": "completed", "source": "Sentinel-2", "date": "10:04 AM", "area": "254.8 km²" }
  ],
  "settlement_summary": {
    "total": 7,
    "severely_affected": 2,
    "partially_affected": 3,
    "safe": 2,
    "total_population_affected": 215400
  },
  "timestamp": "2026-10-22T08:45:00Z"
}
```

---

### 4. 📄 Reports & Geospatial Exports

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/reports` | List all downloadable artifacts (PDF, GeoTIFF, CSV, Shapefile). |
| `GET` | `/api/reports/settlement-impact/csv` | Download the official Settlement Impact CSV Report. |
| `GET` | `/api/reports/{id}/download` | Stream the artifact directly (e.g. CSV or GeoTIFF). |

---

### 5. 🎯 Accuracy Gate & Feedback Loop

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accuracy` | Latest accuracy validation report (IoU, F1, precision, recall). |
| `GET` | `/api/accuracy/summary` | Summary alias for accuracy gate status. |
| `GET` | `/api/accuracy/{job_id}` | Iteration history and convergence curve for a specific job. |
| `POST` | `/api/accuracy/evaluate` | Trigger iterative retuning loop with target IoU (default `0.75`). |

---

### 6. ⚡ Real-Time WebSocket Streaming

- **Endpoint:** `ws://localhost:8000/ws/updates` or `ws://localhost:8000/ws/live`
- **Supported Client Actions:**
  - `{"action": "ping"}` → receives `{"event": "pong"}`
  - `{"action": "get_live"}` → receives `{"event": "live_metrics", "data": {...}}`
- **Broadcast Events:**
  - `job_queued`: Dispatched when a new job enters FIFO queue.
  - `job_progress`: Stages: `data_ingestion` (25%) → `index_computation` (50%) → `change_detection` (75%) → `settlement_impact` (90%).
  - `job_completed`: Final flood extent, stats, and completion signal.
  - `job_failed`: Error message if pipeline encounters an issue.

---

### 7. 🔐 Auth & Config

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login with username/password (`admin` / `floodlens2026`). |
| `GET` | `/api/auth/me` | Fetch active operator user token metadata. |
| `GET` | `/api/config` | Read active default sensor & AOI settings. |
| `POST` | `/api/config/aoi` | Save updated bounding box / AOI center. |
| `GET` | `/health` | Service health check and worker pool status. |

---

## 🗄️ Background Worker & Queue Architecture

```
Client (POST /api/flood/detect)
       │
       ▼
 FastAPI Router ────► SQLite / DB (Job registered with status='queued')
       │
       ▼
 AsyncJobQueue (FIFO asyncio.Queue)
       │
  ┌────┴─────────────────────────────┐
  ▼                                  ▼
Worker 1                          Worker 2
  │                                  │
  ├─► Stage 1 (25% Ingestion)       ...
  ├─► Stage 2 (50% Indices)
  ├─► Stage 3 (75% Change Detection)
  ├─► Stage 4 (90% Settlement CSV)
  └─► Stage 5 (100% Completed)
         │
         ▼
WebSocket Broadcast (/ws/updates & /ws/live)
```
