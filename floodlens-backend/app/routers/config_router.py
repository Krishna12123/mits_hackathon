"""
Config / AOI Router
POST /api/config/aoi — Save active area of interest
GET  /api/config     — Get current pipeline configuration
"""
from fastapi import APIRouter
from app.models.schemas import AOIRequest, ConfigResponse

router = APIRouter()

_current_config = {
    "aoi": {"lat": 26.3, "lon": 85.8, "radius_km": 150},
    "satellite": "Sentinel-2",
    "index": "NDWI",
    "threshold": 0.3,
    "cloud_pct": 20,
}


@router.post("/aoi", response_model=dict)
async def set_aoi(aoi: AOIRequest):
    """Updates active Area of Interest bounding parameters."""
    _current_config["aoi"] = aoi.model_dump()
    return {"status": "ok", "aoi": _current_config["aoi"]}


@router.get("", response_model=ConfigResponse)
async def get_config():
    """Returns active algorithm configuration and selected sensors."""
    return ConfigResponse(
        aoi=_current_config["aoi"],
        satellite=_current_config["satellite"],
        index=_current_config["index"],
        threshold=_current_config["threshold"],
        cloud_pct=_current_config["cloud_pct"],
    )
