# FloodLens 🛰️

> **NAKSHATRA 2026 Aerospace Hackathon** — Real-time flood detection & monitoring dashboard

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React.js 18, Vite, TailwindCSS 3, Leaflet, Recharts, Zustand, React Query |
| **Backend** | FastAPI (Python), Celery, Redis |
| **Processing** | Google Earth Engine, rasterio, GDAL, geopandas |
| **Satellite** | Sentinel-2, Sentinel-1, Landsat-8/9 |
| **GIS** | QGIS, OpenStreetMap (OSM), EPSG:4326 |
| **Database** | PostgreSQL + PostGIS |
| **Output** | GeoTIFF, Shapefile, PDF Reports |

## Project Structure

```
mits hackathon/
├── floodlens-frontend/      # React + TailwindCSS
│   ├── src/
│   │   ├── pages/           # Dashboard, FloodMap, Settlements, Reports, Configure
│   │   ├── components/
│   │   │   ├── layout/      # Layout, Sidebar, TopBar
│   │   │   ├── ui/          # StatCard, SeverityBadge, LoadingSpinner
│   │   │   └── map/         # FloodMapViewer (Leaflet)
│   │   └── services/        # api.js (Axios), store.js (Zustand)
│   ├── tailwind.config.js
│   └── vite.config.js       # Proxy → FastAPI :8000
│
└── floodlens-backend/       # FastAPI Python
    ├── main.py
    ├── requirements.txt
    └── app/routers/
        ├── flood.py          # Detection pipeline API
        ├── settlements.py    # OSM settlement data
        ├── reports.py        # GeoTIFF/PDF exports
        ├── config_router.py  # AOI configuration
        └── auth.py           # JWT authentication
```

## Quick Start

### Frontend

```bash
cd floodlens-frontend
npm install
npm run dev
# → http://localhost:3000
```

### Backend

```bash
cd floodlens-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with stats, map preview, timeline charts |
| `/map` | Full flood map with satellite/index controls & split view |
| `/settlements` | Searchable, filterable affected settlements table |
| `/reports` | Download GeoTIFF, Shapefile, PDF reports |
| `/configure` | Set AOI, dates, satellite params, trigger GEE pipeline |

## Processing Pipeline

```
Satellite → GEE Collection → Cloud Mask → NDWI/MNDWI →
Threshold → Change Detection → Raster→Vector → OSM Intersect → Report
```
