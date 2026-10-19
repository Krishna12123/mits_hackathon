"""
Flood Detection Router
POST /api/flood/detect          — Queue a flood detection job
GET  /api/flood/status/{job_id} — Check job status
GET  /api/flood/results/{job_id} — Get result GeoJSON
GET  /api/flood/summary         — Current aggregate flood summary
"""
import uuid
import asyncio
import datetime
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models.job import Job
from app.models.schemas import (
    DetectRequest,
    JobResponse,
    JobStatusResponse,
    FloodSummaryResponse,
)
from app.routers.ws import manager

logger = logging.getLogger(__name__)

router = APIRouter()


async def _run_detection_pipeline(job_id: str, req_data: dict):
    """
    Simulated background pipeline representing the multi-step detection engine:
    1. SAR/Optical Ingestion
    2. Cloud masking
    3. Index computation
    4. Otsu thresholding & change detection
    5. Settlement overlay & GeoJSON export
    """
    logger.info(f"Starting pipeline execution for {job_id}")
    db = SessionLocal()

    try:
        # Step 1: Ingestion
        await manager.broadcast({
            "event": "job_progress",
            "job_id": job_id,
            "stage": "data_ingestion",
            "progress": 25,
            "message": f"Ingesting satellite imagery ({req_data.get('satellite', 'Sentinel-2')})...",
        })
        await asyncio.sleep(1.5)

        # Step 2: Index computation
        await manager.broadcast({
            "event": "job_progress",
            "job_id": job_id,
            "stage": "index_computation",
            "progress": 50,
            "message": f"Calculating water indices ({req_data.get('index', 'NDWI')})...",
        })
        await asyncio.sleep(1.5)

        # Step 3: Thresholding & change detection
        await manager.broadcast({
            "event": "job_progress",
            "job_id": job_id,
            "stage": "change_detection",
            "progress": 75,
            "message": "Applying Otsu threshold & subtracting JRC baseline...",
        })
        await asyncio.sleep(1.5)

        # Step 4: Completion & GeoJSON generation
        lat = req_data.get("aoi_lat", 26.3)
        lon = req_data.get("aoi_lon", 85.8)

        mock_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "severity": "severe",
                        "depth_est_m": 1.8,
                        "area_sqkm": 84.5,
                        "detected_at": datetime.datetime.utcnow().isoformat(),
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [lon - 0.12, lat - 0.08],
                            [lon + 0.08, lat - 0.05],
                            [lon + 0.15, lat + 0.10],
                            [lon - 0.05, lat + 0.12],
                            [lon - 0.12, lat - 0.08],
                        ]],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {
                        "severity": "medium",
                        "depth_est_m": 0.8,
                        "area_sqkm": 36.2,
                        "detected_at": datetime.datetime.utcnow().isoformat(),
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [lon + 0.10, lat + 0.12],
                            [lon + 0.22, lat + 0.14],
                            [lon + 0.25, lat + 0.22],
                            [lon + 0.12, lat + 0.19],
                            [lon + 0.10, lat + 0.12],
                        ]],
                    },
                },
            ],
        }

        # Update Job in database
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "completed"
            job.flood_extent_km2 = 254.8
            job.affected_districts = 3
            job.at_risk_population = 1240000
            job.ndwi_score = 0.74
            job.result_geojson = mock_geojson
            db.commit()

        await manager.broadcast({
            "event": "job_completed",
            "job_id": job_id,
            "status": "completed",
            "flood_extent_km2": 254.8,
            "message": "Detection completed successfully.",
        })
        logger.info(f"Pipeline finished successfully for {job_id}")

    except Exception as e:
        logger.error(f"Pipeline error for {job_id}: {e}")
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_message = str(e)
            db.commit()
        await manager.broadcast({
            "event": "job_failed",
            "job_id": job_id,
            "error": str(e),
        })
    finally:
        db.close()


@router.post("/detect", response_model=JobResponse)
async def detect(req: DetectRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Queues a flood detection job across the specified satellite dataset and AOI."""
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

    # Schedule background worker task
    background_tasks.add_task(_run_detection_pipeline, job_id, req.model_dump())

    return JobResponse(job_id=job_id, status="queued", message="Detection job scheduled.")


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def status(job_id: str, db: Session = Depends(get_db)):
    """Returns the current execution state of a detection job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return JobStatusResponse(job_id=job.id, status=job.status, error_message=job.error_message)


@router.get("/results/{job_id}")
async def results(job_id: str, db: Session = Depends(get_db)):
    """Returns the GeoJSON flood mask output for a completed job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status != "completed":
        raise HTTPException(status_code=202, detail=f"Job is still {job.status}")
    return job.result_geojson or {"type": "FeatureCollection", "features": []}


@router.get("/summary", response_model=FloodSummaryResponse)
async def summary(db: Session = Depends(get_db)):
    """Returns the latest aggregated regional flood metrics."""
    latest_job = db.query(Job).filter(Job.status == "completed").order_by(Job.updated_at.desc()).first()

    if latest_job and latest_job.flood_extent_km2:
        return FloodSummaryResponse(
            flood_extent_km2=latest_job.flood_extent_km2,
            affected_districts=int(latest_job.affected_districts or 3),
            at_risk_population=int(latest_job.at_risk_population or 1240000),
            ndwi_score=latest_job.ndwi_score or 0.74,
            satellite=latest_job.satellite or "Sentinel-2",
            last_updated=latest_job.updated_at.isoformat() if latest_job.updated_at else datetime.datetime.utcnow().isoformat(),
        )

    return FloodSummaryResponse(
        flood_extent_km2=254.8,
        affected_districts=3,
        at_risk_population=1240000,
        ndwi_score=0.74,
        satellite="Sentinel-2",
        last_updated=datetime.datetime.utcnow().isoformat(),
    )
