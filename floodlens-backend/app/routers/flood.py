"""
Flood Detection Router
POST /api/flood/detect  — Queue a flood detection job
GET  /api/flood/status/{job_id} — Poll job status
GET  /api/flood/results/{job_id} — Get GeoJSON result
GET  /api/flood/summary — Current flood summary
"""
import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# In-memory job store (replace with Redis in production)
_jobs: dict = {}


class DetectRequest(BaseModel):
    satellite: str = "Sentinel-2"
    index:     str = "NDWI"
    threshold: float = 0.3
    cloud_pct: int   = 20
    aoi_lat:   float = 26.3
    aoi_lon:   float = 85.8
    aoi_radius_km: int = 150
    pre_date:  str = "2026-10-11"
    post_date: str = "2026-10-19"


def _run_detection(job_id: str, req: DetectRequest):
    """
    Actual GEE pipeline (run in background / Celery worker):
    1. Authenticate with GEE (ee.Initialize())
    2. Load Sentinel-2 image collection for AOI + date range
    3. Apply cloud mask (QA60 / s2cloudless)
    4. Calculate NDWI / MNDWI
    5. Apply threshold → binary water mask
    6. Pre/Post change detection
    7. Raster → Vector conversion (GeoTIFF → GeoJSON via rasterio + shapely)
    8. Intersect with OSM settlement boundaries (geopandas)
    9. Store result GeoJSON + generate PDF report
    """
    import time
    time.sleep(5)  # Simulate processing
    _jobs[job_id]["status"] = "completed"
    _jobs[job_id]["result_geojson"] = {
        "type": "FeatureCollection",
        "features": []  # Populated by real GEE pipeline
    }


@router.post("/detect")
async def detect(req: DetectRequest, background_tasks: BackgroundTasks):
    job_id = "JOB-" + str(uuid.uuid4())[:8].upper()
    _jobs[job_id] = {"status": "running", "request": req.model_dump()}
    background_tasks.add_task(_run_detection, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}")
async def status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return {"job_id": job_id, "status": job["status"]}


@router.get("/results/{job_id}")
async def results(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    if job["status"] != "completed":
        raise HTTPException(202, "Job still processing")
    return job.get("result_geojson", {})


@router.get("/summary")
async def summary():
    return {
        "flood_extent_km2":    254.8,
        "affected_districts":  3,
        "at_risk_population":  1240000,
        "ndwi_score":          0.74,
        "satellite":           "Sentinel-2",
        "last_updated":        "2026-10-19T10:04:00Z",
    }
