"""Impact Assessment Schemas for /api/impact."""
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class SettlementImpactItem(BaseModel):
    id: int
    name: str
    district: str
    state: str = "Bihar"
    lat: float
    lon: float
    total_area_km2: float
    flooded_area_km2: float
    flooded_pct: float
    severity: str
    severity_badge: str
    total_population: int
    affected_population: int
    total_homes: int
    affected_homes: int


class ImpactRequest(BaseModel):
    job_id: Optional[str] = Field(default=None, description="Detection Job ID to evaluate settlement impacts for")
    flood_geojson: Optional[Dict[str, Any]] = Field(default=None, description="Custom GeoJSON flood extent polygon collection")
    district_filter: Optional[str] = Field(default=None, description="Filter settlements by specific district name")


class ImpactResponse(BaseModel):
    status: str
    job_id: Optional[str] = None
    total_settlements_analyzed: int
    severely_affected_count: int
    partially_affected_count: int
    safe_count: int
    total_affected_population: int
    total_affected_homes: int
    settlements: List[SettlementImpactItem]
    message: Optional[str] = None
