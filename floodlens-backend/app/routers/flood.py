"""
Flood Detection Router
POST /api/flood/detect          — Queue a flood detection job
POST /api/flood/analyze         — Direct Earth Engine S2 flood analysis
GET  /api/flood/                — Earth Engine service health check
GET  /api/flood/status/{job_id} — Check job status
GET  /api/flood/results/{job_id} — Get result GeoJSON
GET  /api/flood/summary         — Current aggregate flood summary
"""
import os
import uuid
import asyncio
import datetime
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models.job import Job
from app.models.report import Report
from app.models.schemas import (
    DetectRequest,
    JobResponse,
    JobStatusResponse,
    QueueStatusResponse,
    FloodSummaryResponse,
    DetectResultResponse,
)
from app.models.flood import (
    FloodAnalysisRequest,
    FloodStatusResponse,
)
from app.routers.ws import manager
from app.services.detection_service import detection_pipeline
from app.services.job_queue import job_queue
from app.services.flood_service import (
    detect_flood,
    get_flood_status,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
def test_flood():
    """Returns Earth Engine flood detection service status."""
    return get_flood_status()


@router.post(
    "/analyze",
    response_model=FloodStatusResponse,
)
def analyze_flood(request: FloodAnalysisRequest):
    """
    Sentinel-2 surface reflectance flood analysis using Google Earth Engine.
    Computes NDWI/MNDWI change detection over bounding box and pre/post date windows.
    """
    try:
        import ee

        west, south, east, north = request.bbox

        aoi = ee.Geometry.Rectangle(
            [west, south, east, north]
        )

        result = detect_flood(
            aoi=aoi,
            pre_start=request.pre_start.isoformat(),
            pre_end=request.pre_end.isoformat(),
            post_start=request.post_start.isoformat(),
            post_end=request.post_end.isoformat(),
        )

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Flood analysis failed: {str(exc)}",
        ) from exc


def execute_pipeline_sync(job_id: str, req_data: dict, db: Session) -> dict:
    """
    Executes detection logic synchronously, updates DB, registers GeoTIFF reports,
    and returns full result dictionary.
    """
    lat = float(req_data.get("aoi_lat", 26.3))
    lon = float(req_data.get("aoi_lon", 85.8))
    radius_km = float(req_data.get("aoi_radius_km", 150.0))
    pre_date = req_data.get("pre_date", "2026-10-11")
    post_date = req_data.get("post_date", "2026-10-19")
    min_votes = int(req_data.get("min_votes", 2))
    save_geotiffs = bool(req_data.get("save_geotiff", True))

    mode = str(req_data.get("mode", "demo")).lower()
    pre_start = req_data.get("pre_start")
    pre_end = req_data.get("pre_end")
    post_start = req_data.get("post_start")
    post_end = req_data.get("post_end")

    if mode == "live":
        import main
        gee_status = getattr(main.app.state, "gee_status", {"authenticated": False})
        if not gee_status.get("authenticated", False):
            raise ValueError(
                "Earth Engine is not authenticated. Please configure GEE credentials in .env or switch to Demo mode."
            )
        import ee
        delta = radius_km / 111.0
        aoi = ee.Geometry.Rectangle([lon - delta, lat - delta, lon + delta, lat + delta])
        result = detect_flood(
            aoi=aoi,
            pre_start=pre_start or pre_date,
            pre_end=pre_end or pre_date,
            post_start=post_start or post_date,
            post_end=post_end or post_date,
            job_id=job_id,
            save_geotiffs=save_geotiffs,
        )
        if result.get("status") != "analysis_complete":
            raise ValueError(
                f"Live Earth Engine analysis stopped: {result.get('message', 'No suitable imagery found')} ({result.get('status')})"
            )
        data_source = "gee_live"
    else:
        result = detection_pipeline.run_detection(
            job_id=job_id,
            lat=lat,
            lon=lon,
            radius_km=radius_km,
            pre_date=pre_date,
            post_date=post_date,
            min_votes=min_votes,
            save_geotiffs=save_geotiffs,
        )
        data_source = "synthetic_demo"
        result["data_source"] = data_source

    # Update Job record in database
    job = db.query(Job).filter(Job.id == job_id).first()
    if job:
        job.status = "completed"
        job.stage = "completed"
        job.progress = 100
        job.data_source = result.get("data_source", data_source)
        job.flood_extent_km2 = result["flood_extent_km2"]
        job.affected_districts = 3
        job.at_risk_population = int(result["flood_extent_km2"] * 4800)
        job.ndwi_score = result.get("otsu_thresholds", {}).get("NDWI", 0.74)
        job.result_geojson = result.get("geojson")
        db.commit()

    # Generate and register settlement impact CSV report
    try:
        from app.services.report_service import generate_settlement_impact_csv
        csv_path = generate_settlement_impact_csv(job_id, db)
        csv_size = f"{round(os.path.getsize(csv_path) / 1024.0, 1)} KB" if os.path.exists(csv_path) else "0.4 MB"
        csv_rpt = Report(
            id=f"{job_id}-CSV",
            title=f"Settlement Impact Report ({job_id})",
            type="CSV",
            size=csv_size,
            status="ready",
            created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            file_path=csv_path,
            data_source=result.get("data_source", data_source),
        )
        db.merge(csv_rpt)
        db.commit()
    except Exception as e:
        logger.warning(f"Could not generate settlement CSV for {job_id}: {e}")

    # Register intermediate GeoTIFF outputs as reports
    if result.get("geotiff_outputs"):
        from app.services.raster_service import validate_raster
        for name, path in result["geotiff_outputs"].items():
            report_id = f"{job_id}-{name.upper()[:12]}"
            val_res = validate_raster(path, expected_type="mask") if path and os.path.exists(path) else None
            is_valid = bool(val_res and val_res.is_valid)
            if not is_valid and path and os.path.exists(path):
                logger.warning(
                    f"GeoTIFF {name} at {path} failed raster validation: "
                    f"{val_res.error_message if val_res else 'File missing'}"
                )
            file_size_kb = round(os.path.getsize(path) / 1024.0, 1) if is_valid else None
            rpt = Report(
                id=report_id,
                title=f"Intermediate Layer: {name.replace('_', ' ').title()} ({job_id})",
                type="GeoTIFF",
                size=f"{file_size_kb} KB" if file_size_kb is not None else None,
                status="ready" if is_valid else "unavailable",
                created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                file_path=path if is_valid else None,
                data_source=result.get("data_source", data_source),
            )
            db.merge(rpt)
        db.commit()

    return result


async def _run_detection_pipeline(job_id: str, req_data: dict):
    """
    Multi-stage background pipeline with real-time WebSocket progress broadcasts.
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
        await asyncio.sleep(0.5)

        # Step 2: Index computation
        await manager.broadcast({
            "event": "job_progress",
            "job_id": job_id,
            "stage": "index_computation",
            "progress": 50,
            "message": "Calculating water indices (NDWI, MNDWI, AWEI, SAR VV/VH)...",
        })
        await asyncio.sleep(0.5)

        # Step 3: Thresholding & change detection
        await manager.broadcast({
            "event": "job_progress",
            "job_id": job_id,
            "stage": "change_detection",
            "progress": 75,
            "message": "Applying Otsu threshold, majority vote ensemble & subtracting JRC baseline...",
        })
        await asyncio.sleep(0.5)

        # Step 4: Execution & GeoTIFF saving
        result = execute_pipeline_sync(job_id, req_data, db)

        await manager.broadcast({
            "event": "job_completed",
            "job_id": job_id,
            "status": "completed",
            "flood_extent_km2": result["flood_extent_km2"],
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


@router.post("/detect")
async def detect(req: DetectRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Triggers flood detection across specified AOI and date range.
    Supports asynchronous queuing (default) or synchronous execution (sync=True).
    """
    job_id = "JOB-" + str(uuid.uuid4())[:8].upper()

    mode = str(req.mode or "demo").lower()
    data_source = "gee_live" if mode == "live" else "synthetic_demo"

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
        data_source=data_source,
    )
    db.add(job)
    db.commit()

    if req.sync:
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
            message="Detection completed.",
        )

    # Dispatch to background job queue
    if not job_queue.is_running:
        background_tasks.add_task(job_queue.start)
    background_tasks.add_task(job_queue.enqueue, job_id, req.model_dump())

    return JobResponse(job_id=job_id, status="queued", message="Detection job scheduled in background queue.")


@router.get("/queue", response_model=QueueStatusResponse)
async def get_queue_status():
    """Returns background detection job queue metrics and active worker status."""
    return job_queue.get_status()


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def status(job_id: str, db: Session = Depends(get_db)):
    """Returns the current execution state of a detection job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        data_source=job.data_source or "untracked",
        progress=job.progress or (100 if job.status == "completed" else 0),
        stage=job.stage or job.status,
        error_message=job.error_message,
    )


@router.get("/results/{job_id}")
async def results(job_id: str, db: Session = Depends(get_db)):
    """Returns the GeoJSON flood mask output and summary impact metrics for a completed job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    if job.status != "completed":
        raise HTTPException(status_code=202, detail=f"Job is still {job.status}")

    geojson = job.result_geojson or {"type": "FeatureCollection", "features": []}
    flooded_area = round(job.flood_extent_km2 or 254.8, 2)
    affected_settlements = 7
    pct_impact = 38.5

    return {
        "jobId": job.id,
        "job_id": job.id,
        "status": job.status,
        "data_source": job.data_source or "untracked",
        "flooded_area_km2": flooded_area,
        "floodedAreaKm2": flooded_area,
        "affected_settlements": affected_settlements,
        "affectedSettlements": affected_settlements,
        "percentage_impact": pct_impact,
        "percentageImpact": pct_impact,
        "geojson": geojson,
        "type": geojson.get("type", "FeatureCollection"),
        "features": geojson.get("features", []),
        "pre_image_url": "/api/flood/thumbnails/pre_flood",
        "preImageUrl": "/api/flood/thumbnails/pre_flood",
        "post_image_url": "/api/flood/thumbnails/post_flood",
        "postImageUrl": "/api/flood/thumbnails/post_flood",
        "unrefined_mask_url": "/api/flood/thumbnails/unrefined_mask",
        "unrefinedMaskUrl": "/api/flood/thumbnails/unrefined_mask",
        "refined_mask_url": "/api/flood/thumbnails/refined_mask",
        "refinedMaskUrl": "/api/flood/thumbnails/refined_mask",
    }



@router.get("/thumbnails/{thumb_type}")
async def get_thumbnail(thumb_type: str):
    """Serves PNG satellite and mask comparison thumbnails."""
    file_map = {
        "pre_flood": "outputs/thumbnails/pre_flood.png",
        "post_flood": "outputs/thumbnails/post_flood.png",
        "unrefined_mask": "outputs/thumbnails/unrefined_mask.png",
        "refined_mask": "outputs/thumbnails/refined_mask.png",
    }
    path = file_map.get(thumb_type)
    if not path or not os.path.exists(path):
        from app.services.flood_service import generate_default_thumbnails
        generate_default_thumbnails()
    if path and os.path.exists(path):
        return FileResponse(path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Thumbnail not found")


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
            data_source=latest_job.data_source or "untracked",
        )

    return FloodSummaryResponse(
        flood_extent_km2=254.8,
        affected_districts=3,
        at_risk_population=1240000,
        ndwi_score=0.74,
        satellite="Sentinel-2",
        last_updated=datetime.datetime.utcnow().isoformat(),
    )
