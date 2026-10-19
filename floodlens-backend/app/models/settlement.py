"""Settlement Model for impact assessment."""
from sqlalchemy import Column, Integer, String, Float, JSON
from app.models.base import Base


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False, index=True)
    district = Column(String(128), nullable=False, index=True)
    state = Column(String(128), default="Bihar")
    population = Column(Integer, default=0)
    flooded_pct = Column(Float, default=0.0)
    severity = Column(String(32), default="safe")  # safe, low, medium, high, severe
    homes = Column(Integer, default=0)
    farms_ha = Column(Float, default=0.0)
    geom_geojson = Column(JSON, nullable=True)
