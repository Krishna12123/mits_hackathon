
import ee

from fastapi import APIRouter, HTTPException

from app.models.flood import (
    FloodAnalysisRequest,
    FloodStatusResponse,
)
from app.services.flood_service import (
    detect_flood,
    get_flood_status,
)

router = APIRouter(prefix="/flood", tags=["Flood"])


@router.get("/")
def test_flood():
    return get_flood_status()


@router.post(
    "/analyze",
    response_model=FloodStatusResponse,
)
def analyze_flood(request: FloodAnalysisRequest):
    try:
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
