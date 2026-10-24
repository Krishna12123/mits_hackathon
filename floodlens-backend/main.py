"""
FloodLens API — Real-Time Flood Detection & Monitoring System
NAKSHATRA 2026 Aerospace Hackathon · Team Code Matrix
"""
import os
import uuid
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session

from app.database import init_db, get_db
from app.models.job import Job
from app.models.schemas import DetectRequest, DetectResultResponse
from app.routers import (
    flood,
    settlements,
    reports,
    config_router,
    auth,
    ws,
    accuracy,
    live,
    refine,
    impact,
)
from app.routers.flood import execute_pipeline_sync
from app.services.job_queue import job_queue

# Ensure output directories exist
os.makedirs("outputs/geotiff", exist_ok=True)
os.makedirs("outputs/reports", exist_ok=True)


def init_earth_engine() -> dict:
    """
    Initializes Google Earth Engine securely using configured credentials.
    Supports:
      1. Service Account (EE_SERVICE_ACCOUNT_EMAIL, EE_SERVICE_ACCOUNT_KEY_FILE, EE_PROJECT_ID)
      2. Application Default Credentials (ADC) with EE_PROJECT_ID when EE_USE_ADC is enabled.
    If unconfigured or initialization fails, sets status to unavailable and preserves fallback mode.
    Never exposes private key contents, tokens, or raw paths in logs or returns.
    """
    project_id = os.getenv("EE_PROJECT_ID", "floodlens-512416")
    sa_email = os.getenv("EE_SERVICE_ACCOUNT_EMAIL")
    sa_key_file = os.getenv("EE_SERVICE_ACCOUNT_KEY_FILE")
    use_adc = os.getenv("EE_USE_ADC", "").lower() in ("1", "true", "yes")

    try:
        import ee
    except ImportError:
        print("[GEE] Earth Engine module (earthengine-api) is not installed. Live satellite processing unavailable.")
        return {"authenticated": False, "mode": "none", "reason": "earthengine-api not installed"}

    # Mode A: Explicit Service Account Configuration
    if sa_key_file or sa_email:
        if not sa_key_file:
            print("[GEE] Config Error: EE_SERVICE_ACCOUNT_EMAIL provided without EE_SERVICE_ACCOUNT_KEY_FILE. GEE unavailable.")
            return {"authenticated": False, "mode": "service_account", "reason": "Missing key file configuration"}

        if not os.path.exists(sa_key_file):
            print("[GEE] Config Error: Configured EE_SERVICE_ACCOUNT_KEY_FILE does not exist on disk. GEE unavailable.")
            return {"authenticated": False, "mode": "service_account", "reason": "Key file not found on disk"}

        try:
            credentials = ee.ServiceAccountCredentials(sa_email, key_file=sa_key_file)
            ee.Initialize(credentials=credentials, project=project_id)
            print(f"[GEE] Initialized successfully via Service Account (project: {project_id}).")
            return {"authenticated": True, "mode": "service_account", "project": project_id}
        except Exception as e:
            err_type = type(e).__name__
            print(f"[GEE] Service Account initialization failed ({err_type}). Live satellite processing unavailable; retaining demo fallback.")
            return {"authenticated": False, "mode": "service_account", "reason": f"Service account authentication failed: {err_type}"}

    # Mode B: Application Default Credentials (ADC)
    if use_adc:
        try:
            ee.Initialize(project=project_id)
            print(f"[GEE] Initialized successfully via ADC (project: {project_id}).")
            return {"authenticated": True, "mode": "adc", "project": project_id}
        except Exception as e:
            err_type = type(e).__name__
            print(f"[GEE] ADC initialization note ({err_type}): Live satellite processing unavailable; retaining demo fallback.")
            return {"authenticated": False, "mode": "adc", "reason": f"ADC authentication failed: {err_type}"}

    # Neither mode configured:
    print("[GEE] Credentials not configured. Live satellite processing unavailable; retaining demo/synthetic fallback mode.")
    return {"authenticated": False, "mode": "none", "reason": "No credentials configured"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB tables and seeds, start background job queue
    print("[API] FloodLens API starting up...")
    try:
        init_db()
        print("[API] Database initialized successfully.")
    except Exception as e:
        print(f"[API] Database initialization warning: {e}")

    # Google Earth Engine initialization
    app.state.gee_status = init_earth_engine()

    try:
        await job_queue.start()
        print("[API] Background job queue worker pool started.")
    except Exception as e:
        print(f"[API] Background job queue startup warning: {e}")

    yield

    # Shutdown
    print("[API] FloodLens API shutting down...")
    try:
        await job_queue.stop()
        print("[API] Background job queue stopped.")
    except Exception as e:
        print(f"[API] Background job queue shutdown error: {e}")


openapi_tags = [
    {
        "name": "Flood Detection",
        "description": "Multi-index (NDWI, MNDWI, AWEI, SAR VV/VH) ensemble change detection pipeline & Google Earth Engine Sentinel-2 analysis.",
    },
    {
        "name": "Refinement",
        "description": "Terrain slope filtering, HAND elevation gate, SAR speckle cleaning, and optical-SAR gap filling pipeline.",
    },
    {
        "name": "Settlement Impact",
        "description": "Day 4 — Spatial intersection with OSM settlement polygons, flood percentage, severity flagging, and GeoJSON exports.",
    },
    {
        "name": "Settlements",
        "description": "Settlement impact analysis, OpenStreetMap intersections, population-at-risk calculations & CSV exports.",
    },
    {
        "name": "Live Dashboard",
        "description": "Real-time telemetry, aggregated flood stats, multi-day timeline trends, and recent jobs for the live dashboard.",
    },
    {
        "name": "Reports",
        "description": "Settlement Impact CSV reports, GeoTIFF classified rasters, Shapefiles, and analytical summaries.",
    },
    {
        "name": "Accuracy Gate",
        "description": "IoU and F1 quality gate validation, reference mask comparison, and dynamic threshold retuning feedback loop.",
    },
    {
        "name": "Config",
        "description": "AOI bounding boxes, satellite sensor configurations, and detection default settings.",
    },
    {
        "name": "Auth",
        "description": "Operator authentication and JWT token verification.",
    },
    {
        "name": "Real-Time Stream",
        "description": "WebSocket channels for live telemetry (/ws/live) and real-time pipeline progress (/ws/updates).",
    },
]

app = FastAPI(
    title="FloodLens API 🛰️",
    description="""
# FloodLens — Real-Time Flood Monitoring & Impact Assessment API
### NAKSHATRA 2026 Aerospace Hackathon · Team Code Matrix

FloodLens is an end-to-end Earth Observation analytics backend providing:
- **Satellite Ingestion & Ensembling**: Sentinel-2 (optical), Sentinel-1 (SAR cloud-penetrating), and Landsat.
- **Indices & Automated Thresholding**: NDWI, MNDWI, AWEI, SAR VV/VH, and per-scene Otsu thresholding.
- **Ensemble & Change Detection**: 4-index majority vote ensemble minus JRC global permanent water baseline.
- **Accuracy Gate & Feedback Loop**: Dynamic IoU / F1 score gate with automated threshold retuning.
- **Refinement Pipeline**: Terrain slope filter, HAND elevation gate, SAR speckle reduction, and optical cloud gap filling.
- **Settlement Impact**: Intersect flood extent with OSM settlements (name, population, flood %, severity flag).
- **Asynchronous Background Processing**: In-process FIFO job queue with multi-stage progress tracking and Celery support.
- **Outputs & Telemetry**: Settlement Impact CSV reports, GeoTIFF exports, GeoJSON vectors, and WebSocket telemetry stream.
""",
    version="1.0.0",
    openapi_tags=openapi_tags,
    lifespan=lifespan,
)

# CORS — allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for GeoTIFF and report downloads
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# Routers
app.include_router(auth.router,          prefix="/api/auth",        tags=["Auth"])
app.include_router(flood.router,         prefix="/api/flood",       tags=["Flood Detection"])
app.include_router(flood.router,         prefix="/flood",           include_in_schema=False)
app.include_router(refine.router,        prefix="/api/refine",      tags=["Refinement"])
app.include_router(refine.router,        prefix="/refine",          include_in_schema=False)
app.include_router(impact.router,        prefix="/api/impact",      tags=["Settlement Impact"])
app.include_router(impact.router,        prefix="/impact",          include_in_schema=False)
app.include_router(settlements.router,   prefix="/api/settlements",  tags=["Settlements"])
app.include_router(live.router,          prefix="/api/live",         tags=["Live Dashboard"])
app.include_router(reports.router,       prefix="/api/reports",      tags=["Reports"])
app.include_router(config_router.router, prefix="/api/config",       tags=["Config"])
app.include_router(accuracy.router,      prefix="/api/accuracy",    tags=["Accuracy Gate"])
app.include_router(ws.router,                                        tags=["Real-Time Stream"])


@app.get("/", tags=["Config"])
def home():
    return {"message": "FloodLens API is running!"}


@app.post("/api/detect", response_model=DetectResultResponse, tags=["Flood Detection"])
async def detect_direct(req: DetectRequest, db: Session = Depends(get_db)):
    """
    Direct /api/detect endpoint (accepts AOI + dates, returns flood mask).
    Executes 4-index computation, majority vote ensemble, and JRC baseline change detection.
    """
    job_id = "JOB-" + str(uuid.uuid4())[:8].upper()
    mode = str(req.mode or "demo").lower()
    data_source = "gee_live" if mode == "live" else "synthetic_demo"

    job = Job(
        id=job_id,
        status="running",
        stage="running",
        progress=20,
        satellite=req.satellite,
        index=req.index,
        threshold=req.threshold,
        cloud_pct=float(req.cloud_pct),
        aoi_lat=req.aoi_lat,
        aoi_lon=req.aoi_lon,
        aoi_radius_km=float(req.aoi_radius_km),
        pre_date=req.pre_date,
        post_date=req.post_date,
        data_source=data_source,
    )
    db.add(job)
    db.commit()

    try:
        result = execute_pipeline_sync(job_id, req.model_dump(), db)
        return DetectResultResponse(
            job_id=job_id,
            status="completed",
            data_source=result.get("data_source", data_source),
            flood_extent_km2=result["flood_extent_km2"],
            permanent_water_km2=result["permanent_water_km2"],
            total_water_km2=result["total_water_km2"],
            geojson=result["geojson"],
            geotiff_outputs=result.get("geotiff_outputs", {}),
            otsu_thresholds=result.get("otsu_thresholds", {}),
            message="Detection completed successfully.",
        )
    except ValueError as ve:
        job.status = "failed"
        job.stage = "failed"
        job.error_message = str(ve)
        db.commit()
        raise HTTPException(status_code=422, detail=str(ve))


@app.get("/health", tags=["Config"])
async def health():
    return {
        "status": "ok",
        "service": "FloodLens API",
        "version": "1.0.0",
        "queue": job_queue.get_status(),
        "gee_status": getattr(app.state, "gee_status", {"authenticated": False, "mode": "none"}),
    }
