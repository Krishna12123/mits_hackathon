"""Pydantic Schemas for Request and Response validation."""
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict


# --- Auth Schemas ---
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class UserResponse(BaseModel):
    username: str
    name: str
    role: str


# --- Flood Detection Schemas ---
class DetectRequest(BaseModel):
    satellite: str = Field(default="Sentinel-2", description="Sentinel-2, Sentinel-1, or Landsat")
    index: str = Field(default="NDWI", description="NDWI, MNDWI, AWEI, or ALL")
    threshold: float = Field(default=0.3, ge=-1.0, le=1.0)
    cloud_pct: int = Field(default=20, ge=0, le=100)
    aoi_lat: float = Field(default=26.3, ge=-90.0, le=90.0)
    aoi_lon: float = Field(default=85.8, ge=-180.0, le=180.0)
    aoi_radius_km: int = Field(default=150, ge=1, le=1000)
    pre_date: str = Field(default="2026-10-11")
    post_date: str = Field(default="2026-10-19")


class JobResponse(BaseModel):
    job_id: str
    status: str
    message: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    error_message: Optional[str] = None


class FloodSummaryResponse(BaseModel):
    flood_extent_km2: float
    affected_districts: int
    at_risk_population: int
    ndwi_score: float
    satellite: str
    last_updated: str


# --- Config Schemas ---
class AOIRequest(BaseModel):
    lat: float
    lon: float
    radius_km: int = 150


class ConfigResponse(BaseModel):
    aoi: Dict[str, Any]
    satellite: str
    index: str
    threshold: float
    cloud_pct: int


# --- Settlement Schemas ---
class SettlementResponse(BaseModel):
    id: int
    name: str
    district: str
    state: str = "Bihar"
    population: int
    flooded_pct: float
    severity: str
    homes: int
    farms_ha: float

    class Config:
        from_attributes = True


class SettlementListResponse(BaseModel):
    total: int
    settlements: List[SettlementResponse]


# --- Reports Schemas ---
class ReportItem(BaseModel):
    id: str
    title: str
    type: str
    size: Optional[str] = None
    status: str
    date: Optional[str] = None

    class Config:
        from_attributes = True


class ReportListResponse(BaseModel):
    reports: List[ReportItem]
