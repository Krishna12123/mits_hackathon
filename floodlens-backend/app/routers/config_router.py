"""
Config / AOI Router
POST /api/config/aoi — Save area of interest
GET  /api/config     — Get current config
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_current_config = {
    "aoi": {"lat": 26.3, "lon": 85.8, "radius_km": 150},
    "satellite":  "Sentinel-2",
    "index":      "NDWI",
    "threshold":  0.3,
    "cloud_pct":  20,
}


class AOIRequest(BaseModel):
    lat:       float
    lon:       float
    radius_km: int = 150


@router.post("/aoi")
async def set_aoi(aoi: AOIRequest):
    _current_config["aoi"] = aoi.model_dump()
    return {"status": "ok", "aoi": _current_config["aoi"]}


@router.get("")
async def get_config():
    return _current_config
