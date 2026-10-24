"""Report Model for downloadable outputs."""
from sqlalchemy import Column, String, JSON
from app.models.base import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(String(32), primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    type = Column(String(32), nullable=False)  # PDF, GeoTIFF, Shapefile, GeoJSON
    size = Column(String(32), nullable=True)
    status = Column(String(32), default="ready")  # ready, processing, failed, unavailable
    created_at = Column(String(64), nullable=True)
    file_path = Column(String(512), nullable=True)
    data_source = Column(String(32), nullable=True, default=None)  # gee_live, synthetic_demo, untracked
    provenance = Column(JSON, nullable=True)  # Structured provenance metadata
