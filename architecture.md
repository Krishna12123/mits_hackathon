# FloodLens — Web Architecture

> **Project:** FloodLens | NAKSHATRA 2026 Aerospace Hackathon
> **Stack:** React.js + TailwindCSS (Frontend) · FastAPI + Python (Backend) · GEE + GIS (Processing)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (User)                                      │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │              FRONTEND  ·  React.js + TailwindCSS (Vite)             │  │
│   │                                                                      │  │
│   │  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│   │  │Dashboard │  │Flood Map │  │Settlements │  │Reports / Config  │  │  │
│   │  └──────────┘  └──────────┘  └────────────┘  └──────────────────┘  │  │
│   │                                                                      │  │
│   │  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐    │  │
│   │  │ Leaflet Map      │  │ Recharts       │  │ Zustand Store    │    │  │
│   │  │ (GeoJSON overlay)│  │ (Timeline/Bar) │  │ + React Query    │    │  │
│   │  └──────────────────┘  └────────────────┘  └──────────────────┘    │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                        │  HTTPS REST / WebSocket  │                         │
└────────────────────────┼──────────────────────────┼─────────────────────────┘
                         ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND  ·  FastAPI (Python)  :8000                      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         REST API Layer                               │  │
│  │                                                                      │  │
│  │  /api/auth        /api/flood       /api/settlements    /api/reports  │  │
│  │  JWT Login        detect           affected list       list/download │  │
│  │                   status           filter by severity                │  │
│  │                   results          /api/config  ←── AOI, satellite   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  GEE Service │  │  GIS Service │  │ Report Service│  │Celery Worker│  │
│  │  NDWI/MNDWI  │  │  Raster→Vec  │  │  PDF / TIFF   │  │ Async tasks │  │
│  │  Cloud mask  │  │  OSM overlay │  │  Shapefile    │  │             │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  └─────────────┘  │
└──────────┬──────────────────┬──────────────────────────────────┬───────────┘
           │                  │                                  │
           ▼                  ▼                                  ▼
┌─────────────────┐  ┌─────────────────┐              ┌──────────────────────┐
│  DATA SOURCES   │  │    STORAGE      │              │       CACHE          │
│                 │  │                 │              │                      │
│ Sentinel-2/1    │  │ PostgreSQL      │              │ Redis                │
│ Landsat-8/9     │  │ + PostGIS       │              │ (task queue          │
│ GEE Python API  │  │ (spatial DB)    │              │  + caching)          │
│ OSM Nominatim   │  │                 │              │                      │
│ QGIS boundaries │  │ S3 / Local      │              └──────────────────────┘
│                 │  │ (GeoTIFF,       │
└─────────────────┘  │  Shapefiles,    │
                     │  PDF reports)   │
                     └─────────────────┘
```

---

## 2. Frontend Architecture

### Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | **Dashboard** | Stats, map preview, timeline chart, recent GEE jobs |
| `/map` | **Flood Map** | Full Leaflet map, satellite/index controls, split pre/post view |
| `/settlements` | **Settlements** | Searchable table of affected areas (OSM intersection) |
| `/reports` | **Reports** | Download GeoTIFF, Shapefile, PDF impact reports |
| `/configure` | **Configure** | Set AOI, dates, satellite params, trigger pipeline |

### Component Tree

```
App
└── Layout
    ├── Sidebar          ← nav links + GEE pipeline status
    ├── TopBar           ← active event alert + user avatar
    └── <Page Outlet>
        ├── Dashboard
        │   ├── StatCard × 6
        │   ├── FloodMapViewer  (Leaflet)
        │   ├── AreaChart       (Recharts — flood timeline)
        │   └── BarChart        (Recharts — district comparison)
        ├── FloodMap
        │   ├── Controls bar   (satellite / index / date pickers)
        │   └── FloodMapViewer (split or single view)
        ├── Settlements
        │   ├── Summary cards × 3
        │   ├── Search + severity filter
        │   └── Data table + SeverityBadge
        ├── Reports
        │   └── Report cards + Download buttons
        └── Configure
            ├── AOI form
            ├── Date range pickers
            ├── Satellite / index / threshold controls
            └── Run Pipeline button → POST /api/flood/detect
```

### State Management

```
Zustand Store (store.js)
├── activeJob        ← current detection job ID + status
├── aoi              ← lat / lon / radius
├── dateRange        ← pre-flood & post-flood dates
├── alerts[]         ← notification list
└── layers           ← map layer toggles

React Query (useQuery / useMutation)
├── useQuery(['flood/summary'])
├── useQuery(['settlements'])
├── useQuery(['reports'])
└── useMutation → POST /api/flood/detect
```

### Tech Stack

| Concern | Library |
|---------|---------|
| Build | Vite 5 |
| UI | React 18 + TailwindCSS 3 |
| Routing | React Router v6 |
| Map | Leaflet.js + react-leaflet |
| Charts | Recharts |
| State | Zustand + TanStack React Query |
| HTTP | Axios (with JWT interceptor) |
| Icons | Lucide React |

---

## 3. Backend Architecture

### FastAPI Service Structure

```
main.py  (FastAPI app + CORS + lifespan)
└── app/
    ├── routers/
    │   ├── auth.py           POST /api/auth/login  · GET /api/auth/me
    │   ├── flood.py          POST /api/flood/detect
    │   │                     GET  /api/flood/status/{job_id}
    │   │                     GET  /api/flood/results/{job_id}
    │   │                     GET  /api/flood/summary
    │   ├── settlements.py    GET  /api/settlements/affected
    │   │                     GET  /api/settlements/{id}
    │   ├── reports.py        GET  /api/reports
    │   │                     GET  /api/reports/{id}/download
    │   └── config_router.py  POST /api/config/aoi
    │                         GET  /api/config
    ├── services/
    │   ├── gee_service.py    Google Earth Engine processing
    │   ├── gis_service.py    Raster → Vector, OSM intersection
    │   └── report_service.py PDF, GeoTIFF, Shapefile generation
    └── models/
        ├── flood.py          SQLAlchemy + GeoAlchemy2 models
        └── settlement.py
```

### API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | JWT login |
| `POST` | `/api/flood/detect` | Queue detection job |
| `GET` | `/api/flood/status/{job_id}` | Poll job status |
| `GET` | `/api/flood/results/{job_id}` | Fetch GeoJSON result |
| `GET` | `/api/flood/summary` | Current flood stats |
| `GET` | `/api/settlements/affected` | Affected settlements list |
| `POST` | `/api/config/aoi` | Save AOI |
| `GET` | `/api/reports` | List reports |
| `GET` | `/api/reports/{id}/download` | Download file |
| `WS` | `/ws/updates` | Real-time job progress |

### Python Libraries

| Purpose | Library |
|---------|---------|
| API Framework | FastAPI + Uvicorn |
| GEE Integration | `earthengine-api` |
| Raster Processing | `rasterio`, `GDAL` |
| Vector / GIS | `geopandas`, `shapely` |
| Task Queue | `Celery` + Redis |
| Database ORM | `SQLAlchemy` + `GeoAlchemy2` |
| Auth | `python-jose` (JWT) + `passlib` |
| Report Export | `reportlab` (PDF) |
| Object Storage | `boto3` (S3) |

---

## 4. Processing Pipeline

```
 TRIGGER
    │
    ▼
┌──────────────────────────┐
│  1. Image Collection     │  ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
│     (Google Earth Engine)│  filter by AOI bbox + date range + cloud cover %
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  2. Cloud & Shadow Mask  │  QA60 band (Sentinel-2) / s2cloudless
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  3. Index Calculation    │  NDWI  = (Green − NIR)  / (Green + NIR)
│                          │  MNDWI = (Green − SWIR) / (Green + SWIR)
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  4. Water Classification │  Binary mask: index > threshold (default 0.3)
│     (Threshold-based)    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  5. Change Detection     │  Pre-flood mask  XOR  Post-flood mask
│     (Pre/Post diff)      │  → flooded area polygons
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  6. Raster → Vector      │  rasterio + shapely
│     Conversion           │  GeoTIFF → GeoJSON / Shapefile
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  7. Settlement Intersect │  geopandas spatial join
│     (OSM + Admin bounds) │  → affected settlements with flood %
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  8. Export & Report      │  GeoTIFF (EPSG:4326, 10m)
│                          │  Shapefile (.shp + .dbf + .prj)
│                          │  PDF impact report (reportlab)
│                          │  Store → S3 / local storage
└──────────────────────────┘
```

---

## 5. Data Sources

| Source | Data | Format |
|--------|------|--------|
| **Sentinel-2** | Optical multispectral (10m) | GEE ImageCollection |
| **Sentinel-1** | SAR (cloud-penetrating) | GEE ImageCollection |
| **Landsat-8/9** | Optical (30m) | GEE ImageCollection |
| **OpenStreetMap** | Settlement polygons, roads | GeoJSON via Overpass API |
| **QGIS** | Admin district boundaries | Shapefile / GeoPackage |

---

## 6. Infrastructure

```
Development
├── Frontend  →  http://localhost:3000   (Vite dev server)
├── Backend   →  http://localhost:8000   (Uvicorn --reload)
├── Redis     →  localhost:6379          (Celery broker)
└── PostGIS   →  localhost:5432          (PostgreSQL + PostGIS)

Production (suggested)
├── Frontend  →  Vercel / Nginx (static build)
├── Backend   →  Docker + Gunicorn + Nginx reverse proxy
├── Database  →  Managed PostgreSQL + PostGIS (RDS / Supabase)
├── Redis     →  Redis Cloud / ElastiCache
└── Storage   →  AWS S3 / Cloudflare R2  (GeoTIFF, PDF exports)
```

---

## 7. Security

| Layer | Mechanism |
|-------|-----------|
| API Auth | JWT (RS256) via `python-jose` |
| CORS | Restricted to frontend origin only |
| GEE Auth | Service account credentials (JSON key) |
| Secrets | Environment variables (`.env` file) |
| DB | Parameterized queries via SQLAlchemy ORM |
