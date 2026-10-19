"""Accuracy Record Model for tracking refinement gate iterations."""
import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from app.models.base import Base


class AccuracyRecord(Base):
    __tablename__ = "accuracy_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(32), index=True, nullable=False)
    iteration = Column(Integer, default=1)
    iou_score = Column(Float, nullable=False)
    f1_score = Column(Float, nullable=False)
    otsu_threshold = Column(Float, nullable=False)
    passed_gate = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
