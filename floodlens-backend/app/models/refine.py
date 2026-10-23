from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class RefineRequest(BaseModel):
    job_id: Optional[str] = Field(default=None, description="Job ID to load existing detection mask from")
    water_mask: Optional[List[List[int]]] = Field(default=None, description="2D binary water mask grid (1=water, 0=non-water)")
    slope_grid: Optional[List[List[float]]] = Field(default=None, description="2D terrain slope grid in degrees")
    hand_grid: Optional[List[List[float]]] = Field(default=None, description="2D Height Above Nearest Drainage grid in meters")
    max_slope_deg: float = Field(default=5.0, ge=0.0, le=90.0, description="Maximum allowed slope in degrees for flood water")
    max_hand_m: float = Field(default=15.0, ge=0.0, le=500.0, description="Maximum allowed HAND height in meters")
    enable_slope_filter: bool = Field(default=True, description="Enable terrain slope filter")
    enable_hand_filter: bool = Field(default=True, description="Enable HAND elevation filter")
    enable_gap_fill: bool = Field(default=True, description="Enable SAR gap fill for optical cloud gaps")
    optical_valid_mask: Optional[List[List[int]]] = Field(default=None, description="2D binary mask of valid optical observations")
    sar_water_mask: Optional[List[List[int]]] = Field(default=None, description="2D binary mask of SAR radar water observations")
    sar_valid_mask: Optional[List[List[int]]] = Field(default=None, description="2D binary mask of valid SAR radar observations")


class RefineResponse(BaseModel):
    status: str
    initial_water_pixels: int
    sar_filled_pixels: int
    slope_removed_pixels: int
    hand_removed_pixels: int
    final_water_pixels: int
    net_pixel_change: int
    filters_applied: Dict[str, Any]
    refined_mask: Optional[List[List[int]]] = None
    message: Optional[str] = None
