import os
import uuid
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session

from app.database import init_db, get_db
from app.models.job import Job
from app.models.schemas import DetectRequest, DetectResultResponse
from app.routers import flood, settlements, reports, config_router, auth, ws, accuracy
from app.routers.flood import execute_pipeline_sync

# Ensure outputs directory exists
os.makedirs("outputs/geotiff", exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB tables and seeds, GEE credentials
    print("🚀 FloodLens API starting up…")
    try:
        init_db()
        print("✅ Database initialized successfully.")
    except Exception as e:
        print(f"⚠️ Database initialization warning: {e}")
    yield
    print("🛑 FloodLens API shutting down…")

app = FastAPI(
    title="FloodLens API",
    description="Flood detection & monitoring API · NAKSHATRA 2026",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for GeoTIFF downloads
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# Routers
app.include_router(auth.router,          prefix="/api/auth",        tags=["Auth"])
app.include_router(flood.router,         prefix="/api/flood",       tags=["Flood Detection"])
app.include_router(settlements.router,   prefix="/api/settlements",  tags=["Settlements"])
app.include_router(reports.router,       prefix="/api/reports",      tags=["Reports"])
app.include_router(config_router.router, prefix="/api/config",       tags=["Config"])
app.include_router(accuracy.router,      prefix="/api/accuracy",    tags=["Accuracy Gate"])
app.include_router(ws.router,                                        tags=["Real-Time Stream"])


@app.post("/api/detect", response_model=DetectResultResponse, tags=["Flood Detection"])
async def detect_direct(req: DetectRequest, db: Session = Depends(get_db)):
    """
    Direct /api/detect endpoint (accepts AOI + dates, returns flood mask).
    Executes 4-index computation, majority vote ensemble, and JRC baseline change detection.
    """
    job_id = "JOB-" + str(uuid.uuid4())[:8].upper()
    job = Job(
        id=job_id,
        status="running",
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "FloodLens API"}
