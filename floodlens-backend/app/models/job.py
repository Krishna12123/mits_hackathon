"""Job Model for Flood Detection Tasks."""
import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, JSON, Text
from app.models.base import Base


class Job(Base):
    __tablename__ = "flood_jobs"

    id = Column(String(32), primary_key=True, index=True)
    status = Column(String(32), default="queued", index=True)  # queued, running, completed, failed
    progress = Column(Integer, default=0)  # 0 to 100 percentage
    stage = Column(String(64), default="queued")  # queued, data_ingestion, index_computation, change_detection, settlement_impact, completed, failed
    satellite = Column(String(64), default="Sentinel-2")
    index = Column(String(32), default="NDWI")
    threshold = Column(Float, default=0.3)
    cloud_pct = Column(Float, default=20.0)
    aoi_lat = Column(Float, nullable=False)
    aoi_lon = Column(Float, nullable=False)
    aoi_radius_km = Column(Float, default=150.0)
    pre_date = Column(String(32), nullable=False)
    post_date = Column(String(32), nullable=False)

    # Outputs
    flood_extent_km2 = Column(Float, nullable=True)
    affected_districts = Column(Float, nullable=True)
    at_risk_population = Column(Float, nullable=True)
    ndwi_score = Column(Float, nullable=True)
    result_geojson = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))
