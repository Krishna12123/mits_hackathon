
from datetime import date

from pydantic import BaseModel, Field, model_validator


class FloodAnalysisRequest(BaseModel):
    bbox: list[float] = Field(
        min_length=4,
        max_length=4,
        description="Bounding box: [west, south, east, north]"
    )

    pre_start: date
    pre_end: date
    post_start: date
    post_end: date

    @model_validator(mode="after")
    def validate_inputs(self):
        west, south, east, north = self.bbox

        if not (-180 <= west < east <= 180):
            raise ValueError("Invalid longitude bounds")

        if not (-90 <= south < north <= 90):
            raise ValueError("Invalid latitude bounds")

        if self.pre_start >= self.pre_end:
            raise ValueError(
                "Pre-flood start must be before end"
            )

        if self.post_start >= self.post_end:
            raise ValueError(
                "Post-flood start must be before end"
            )

        if self.pre_end > self.post_start:
            raise ValueError(
                "Pre-flood period must end before post-flood period"
            )

        return self


class FloodStatusResponse(BaseModel):
    status: str

    pre_image_count: int | None = None
    post_image_count: int | None = None

    pre_valid_coverage_percent: float | None = None
    post_valid_coverage_percent: float | None = None

    potential_new_water_area_m2: float | None = None
    potential_new_water_area_km2: float | None = None

    analysis_scale_m: int | None = None
    cloud_limit_percent: int | None = None

    message: str | None = None
    note: str | None = None
