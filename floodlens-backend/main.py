"""
FloodLens API — Real-Time Flood Detection & Monitoring System
NAKSHATRA 2026 Aerospace Hackathon · Team Code Matrix
"""
import os
import time
import uuid
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.logging_config import setup_logging
from app.database import init_db, get_db
from app.models.job import Job
from app.models.schemas import DetectRequest, DetectResultResponse, ErrorResponse
from app.seed_demo import seed_demo_data
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
)
from app.routers.flood import execute_pipeline_sync
from app.services.job_queue import job_queue

# Initialize structured logging
logger = setup_logging()

# Ensure output directories exist
os.makedirs("outputs/geotiff", exist_ok=True)
os.makedirs("outputs/reports", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB tables, seeds, start background job queue
    logger.info("🚀 FloodLens API starting up…")
    try:
        init_db()
        logger.info("✅ Database initialized and demo dataset verified.")
    except Exception as e:
        logger.warning(f"⚠️ Database initialization note: {e}")

    # Google Earth Engine initialization (optional for live satellite pulls)
    try:
        import ee
        ee.Initialize(project="floodlens-512416")
        logger.info("✅ Google Earth Engine initialized successfully (project: floodlens-512416).")
    except Exception as e:
        logger.info(f"ℹ️ Earth Engine initialization note: {e}")

    try:
        await job_queue.start()
        logger.info("✅ Background job queue worker pool started.")
    except Exception as e:
        logger.warning(f"⚠️ Background job queue startup warning: {e}")

    yield

    # Shutdown
    logger.info("🛑 FloodLens API shutting down…")
    try:
        await job_queue.stop()
        logger.info("✅ Background job queue stopped.")
    except Exception as e:
        logger.error(f"⚠️ Background job queue shutdown error: {e}")


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

# ─── MIDDLEWARE: Request Correlation ID, Response Timing, and Logging ─────────

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """
    Assigns unique request correlation ID, measures latency, and produces structured access logs.
    """
    request_id = request.headers.get("X-Request-ID") or f"REQ-{uuid.uuid4().hex[:10].upper()}"
    request.state.request_id = request_id

    start_time = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        # Inject headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

        # Structured access log
        client_host = request.client.host if request.client else "internal"
        log_msg = f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f}ms) [{client_host}]"
        if response.status_code >= 500:
            logger.error(f"[{request_id}] {log_msg}")
        elif response.status_code >= 400:
            logger.warning(f"[{request_id}] {log_msg}")
        else:
            logger.info(f"[{request_id}] {log_msg}")

        return response
    except Exception as exc:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        logger.error(
            f"[{request_id}] Unhandled exception processing {request.method} {request.url.path} ({duration_ms:.1f}ms): {exc}",
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "Internal Server Error",
                "detail": "An internal server error occurred while processing the request.",
                "status_code": 500,
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id, "X-Response-Time": f"{duration_ms:.2f}ms"},
        )


# ─── GLOBAL EXCEPTION HANDLERS ────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Formats Pydantic 422 validation errors with clear, user-friendly details.
    """
    req_id = getattr(request.state, "request_id", None) or f"REQ-{uuid.uuid4().hex[:8].upper()}"
    formatted_errors = []
    for err in exc.errors():
        field = " -> ".join(str(loc) for loc in err.get("loc", []))
        msg = err.get("msg", "Invalid value")
        formatted_errors.append(f"{field}: {msg}")

    detail_message = "; ".join(formatted_errors) if formatted_errors else "Request validation failed."
    logger.warning(f"[{req_id}] 422 Validation Error on {request.method} {request.url.path}: {detail_message}")

    return JSONResponse(
        status_code=422,
        content={
            "error": "Validation Error",
            "detail": detail_message,
            "errors": exc.errors(),
            "status_code": 422,
            "request_id": req_id,
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Formats standard HTTP exceptions into consistent error JSON envelopes.
    """
    req_id = getattr(request.state, "request_id", None) or f"REQ-{uuid.uuid4().hex[:8].upper()}"
    if exc.status_code >= 400 and exc.status_code != 404:
        logger.warning(f"[{req_id}] HTTP {exc.status_code} on {request.method} {request.url.path}: {exc.detail}")

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": f"HTTP {exc.status_code}",
            "detail": str(exc.detail),
            "status_code": exc.status_code,
            "request_id": req_id,
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Safely captures any uncaught exception, logs traceback, and returns a safe 500 error envelope.
    """
    req_id = getattr(request.state, "request_id", None) or f"REQ-{uuid.uuid4().hex[:8].upper()}"
    logger.error(f"[{req_id}] Unhandled 500 Error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "detail": "An unexpected error occurred while processing your request.",
            "status_code": 500,
            "request_id": req_id,
        },
        headers={"X-Request-ID": req_id},
    )


# ─── CORS CONFIGURATION ───────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time", "Content-Disposition"],
)

# Static files for GeoTIFF and report downloads
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# ─── ROUTER MOUNTS (Dual-prefix for bulletproof frontend compatibility) ───────
# Primary canonical routes (/api/...)
app.include_router(auth.router,          prefix="/api/auth",        tags=["Auth"])
app.include_router(flood.router,         prefix="/api/flood",       tags=["Flood Detection"])
app.include_router(refine.router,        prefix="/api/refine",      tags=["Refinement"])
app.include_router(settlements.router,   prefix="/api/settlements",  tags=["Settlements"])
app.include_router(live.router,          prefix="/api/live",         tags=["Live Dashboard"])
app.include_router(reports.router,       prefix="/api/reports",      tags=["Reports"])
app.include_router(config_router.router, prefix="/api/config",       tags=["Config"])
app.include_router(accuracy.router,      prefix="/api/accuracy",    tags=["Accuracy Gate"])
app.include_router(ws.router,                                        tags=["Real-Time Stream"])

# Direct aliases without /api prefix (for when frontend baseURL is without '/api')
app.include_router(auth.router,          prefix="/auth",            include_in_schema=False)
app.include_router(flood.router,         prefix="/flood",           include_in_schema=False)
app.include_router(refine.router,        prefix="/refine",          include_in_schema=False)
app.include_router(settlements.router,   prefix="/settlements",     include_in_schema=False)
app.include_router(live.router,          prefix="/live",            include_in_schema=False)
app.include_router(reports.router,       prefix="/reports",         include_in_schema=False)
app.include_router(config_router.router, prefix="/config",          include_in_schema=False)
app.include_router(accuracy.router,      prefix="/accuracy",        include_in_schema=False)


# ─── DIRECT ROOT & HEALTH ENDPOINTS ───────────────────────────────────────────

@app.get("/", tags=["Config"])
def home():
    return {
        "service": "FloodLens API 🛰️",
        "team": "Code Matrix",
        "hackathon": "NAKSHATRA 2026",
        "status": "online",
        "docs_url": "/docs",
        "openapi_url": "/openapi.json",
    }


@app.post("/api/detect", response_model=DetectResultResponse, tags=["Flood Detection"])
@app.post("/detect", response_model=DetectResultResponse, include_in_schema=False)
async def detect_direct(req: DetectRequest, db: Session = Depends(get_db)):
    """
    Direct /api/detect endpoint (accepts AOI + dates, returns flood mask).
    Executes 4-index computation, majority vote ensemble, and JRC baseline change detection.
    """
    job_id = "JOB-" + str(uuid.uuid4())[:8].upper()
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
    )
    db.add(job)
    db.commit()

    result = execute_pipeline_sync(job_id, req.model_dump(), db)
    return DetectResultResponse(
        job_id=job_id,
        status="completed",
        flood_extent_km2=result["flood_extent_km2"],
        permanent_water_km2=result["permanent_water_km2"],
        total_water_km2=result["total_water_km2"],
        geojson=result["geojson"],
        geotiff_outputs=result.get("geotiff_outputs", {}),
        otsu_thresholds=result.get("otsu_thresholds", {}),
        message="Detection completed successfully.",
    )


@app.get("/health", tags=["Config"])
@app.get("/api/health", tags=["Config"], include_in_schema=False)
async def health():
    return {
        "status": "ok",
        "service": "FloodLens API",
        "version": "1.0.0",
        "demo_event": "Bihar / Nepal Terai Koshi Flood (October 2026)",
        "queue": job_queue.get_status(),
    }


@app.post("/api/seed", tags=["Config"])
@app.post("/seed", tags=["Config"], include_in_schema=False)
async def trigger_seed(db: Session = Depends(get_db)):
    """
    Admin/Demo trigger: re-seeds the pre-loaded October 2026 flood event,
    settlements, GeoTIFF outputs, and accuracy records.
    """
    try:
        summary = seed_demo_data(db)
        return {
            "status": "success",
            "message": "Demo flood dataset successfully seeded and verified.",
            "data": summary,
        }
    except Exception as e:
        logger.error(f"Seeding failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Seeding error: {str(e)}"},
        )
