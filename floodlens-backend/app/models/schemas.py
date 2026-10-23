"""Pydantic Schemas for Request and Response validation."""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, List, Any, Dict


# --- Generic & Error Schemas ---
class ErrorResponse(BaseModel):
    error: str
    detail: str
    status_code: int = 400
    request_id: Optional[str] = None
    timestamp: Optional[str] = None


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
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    satellite: str = Field(default="Sentinel-2", description="Sentinel-2, Sentinel-1, or Landsat")
    index: str = Field(default="NDWI", description="NDWI, MNDWI, AWEI, or ALL")
    threshold: float = Field(default=0.3, ge=-1.0, le=1.0)
    cloud_pct: int = Field(default=20, ge=0, le=100)
    aoi_lat: float = Field(default=26.3, ge=-90.0, le=90.0)
    aoi_lon: float = Field(default=85.8, ge=-180.0, le=180.0)
    aoi_radius_km: int = Field(default=150, ge=1, le=1000)
    pre_date: str = Field(default="2026-10-11")
    post_date: str = Field(default="2026-10-19")
    min_votes: int = Field(default=2, ge=1, le=4, description="Minimum index votes for majority ensemble (1-4)")
    save_geotiff: bool = Field(default=True, description="Save intermediate GeoTIFF rasters")
    sync: bool = Field(default=False, description="Run synchronously and return mask immediately")

    @model_validator(mode="before")
    @classmethod
    def map_frontend_fields(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        data = values.copy()

        # Satellite source mapping (supports camelCase and snake_case)
        sat_input = data.get("satellite_source") or data.get("satelliteSource")
        if sat_input and not data.get("satellite"):
            src = str(sat_input).lower()
            if "sar" in src or "sentinel-1" in src:
                data["satellite"] = "Sentinel-1"
            elif "landsat" in src:
                data["satellite"] = "Landsat"
            else:
                data["satellite"] = "Sentinel-2"

        # Date mappings (supports camelCase and snake_case)
        pre_val = (
            data.get("pre_flood_start")
            or data.get("preFloodStart")
            or data.get("pre_flood_end")
            or data.get("preFloodEnd")
            or data.get("pre_date")
            or data.get("preDate")
        )
        if pre_val:
            data["pre_date"] = str(pre_val)[:10]

        post_val = (
            data.get("post_flood_end")
            or data.get("postFloodEnd")
            or data.get("post_flood_start")
            or data.get("postFloodStart")
            or data.get("post_date")
            or data.get("postDate")
        )
        if post_val:
            data["post_date"] = str(post_val)[:10]

        # Numeric and coordinate aliases
        if "cloudPct" in data and "cloud_pct" not in data:
            data["cloud_pct"] = data["cloudPct"]
        if "aoiLat" in data and "aoi_lat" not in data:
            data["aoi_lat"] = data["aoiLat"]
        elif "lat" in data and "aoi_lat" not in data:
            data["aoi_lat"] = data["lat"]
        if "aoiLon" in data and "aoi_lon" not in data:
            data["aoi_lon"] = data["aoiLon"]
        elif "lon" in data and "aoi_lon" not in data:
            data["aoi_lon"] = data["lon"]
        elif "lng" in data and "aoi_lon" not in data:
            data["aoi_lon"] = data["lng"]
        if "aoiRadiusKm" in data and "aoi_radius_km" not in data:
            data["aoi_radius_km"] = data["aoiRadiusKm"]
        elif "radius_km" in data and "aoi_radius_km" not in data:
            data["aoi_radius_km"] = data["radius_km"]
        elif "radius" in data and "aoi_radius_km" not in data:
            data["aoi_radius_km"] = data["radius"]

        # Indices mapping
        if "indices" in data and isinstance(data["indices"], list) and data["indices"]:
            data["index"] = data["indices"][0] if len(data["indices"]) == 1 else "ALL"

        # Region coordinates mapping
        region = str(data.get("region", "")).lower()
        if "nepal-terai" in region:
            data.setdefault("aoi_lat", 26.8)
            data.setdefault("aoi_lon", 86.0)
        elif "koshi" in region:
            data.setdefault("aoi_lat", 26.6)
            data.setdefault("aoi_lon", 87.0)
        elif "madhesh" in region:
            data.setdefault("aoi_lat", 26.9)
            data.setdefault("aoi_lon", 85.5)
        elif "lumbini" in region:
            data.setdefault("aoi_lat", 27.6)
            data.setdefault("aoi_lon", 83.4)

        return data


class DetectResultResponse(BaseModel):
    job_id: str
    status: str
    flood_extent_km2: float
    permanent_water_km2: float
    total_water_km2: float
    geojson: Dict[str, Any]
    geotiff_outputs: Dict[str, str] = {}
    otsu_thresholds: Dict[str, float] = {}
    message: Optional[str] = None


class JobResponse(BaseModel):
    job_id: str
    jobId: Optional[str] = None
    status: str
    message: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_job_id(cls, values: Any) -> Any:
        if isinstance(values, dict):
            jid = values.get("job_id") or values.get("jobId")
            if jid:
                values["job_id"] = jid
                values["jobId"] = jid
        return values


class JobStatusResponse(BaseModel):
    job_id: str
    jobId: Optional[str] = None
    status: str
    progress: int = 0
    stage: Optional[str] = None
    error_message: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_job_id(cls, values: Any) -> Any:
        if isinstance(values, dict):
            jid = values.get("job_id") or values.get("jobId")
            if jid:
                values["job_id"] = jid
                values["jobId"] = jid
        return values


class QueueStatusResponse(BaseModel):
    queue_size: int
    active_workers: int
    worker_status: str
    active_jobs: List[str] = []


class FloodSummaryResponse(BaseModel):
    flood_extent_km2: float
    affected_districts: int
    at_risk_population: int
    ndwi_score: float
    satellite: str
    last_updated: str


# --- Live Dashboard Schemas ---
class StatCardMetric(BaseModel):
    title: str
    value: str
    unit: str
    change: Optional[float] = None
    color: str
    description: str


class TimelinePoint(BaseModel):
    date: str
    area: float


class DistrictMetric(BaseModel):
    name: str
    flooded: float
    normal: float


class RecentJobSummary(BaseModel):
    id: str
    status: str
    source: str
    date: str
    area: str


class SettlementImpactSummary(BaseModel):
    total: int
    severely_affected: int
    partially_affected: int
    safe: int
    total_population_affected: int


class LiveDashboardResponse(BaseModel):
    stats: List[StatCardMetric]
    timeline: List[TimelinePoint]
    districts: List[DistrictMetric]
    recent_jobs: List[RecentJobSummary]
    settlement_summary: SettlementImpactSummary
    timestamp: str


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
    total_area_km2: Optional[float] = None
    flooded_area_km2: Optional[float] = None
    coordinates: Optional[List[float]] = None

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


# --- Accuracy Schemas ---
class AccuracyIterationItem(BaseModel):
    iteration: int
    iou_score: float
    f1_score: float
    precision: float
    recall: float
    otsu_threshold: float
    passed_gate: bool

    class Config:
        from_attributes = True


class AccuracyResponse(BaseModel):
    job_id: str
    passed_gate: bool
    target_iou: float
    current_iou: float
    current_f1: float
    precision: float
    recall: float
    iterations_count: int
    history: List[AccuracyIterationItem]
    status: str


class AccuracyEvaluateRequest(BaseModel):
    job_id: Optional[str] = None
    target_iou: float = Field(default=0.75, ge=0.1, le=1.0)
    max_iterations: int = Field(default=3, ge=1, le=10)
    aoi_lat: float = Field(default=26.3, ge=-90.0, le=90.0)
    aoi_lon: float = Field(default=85.8, ge=-180.0, le=180.0)
    aoi_radius_km: int = Field(default=150, ge=1, le=1000)
