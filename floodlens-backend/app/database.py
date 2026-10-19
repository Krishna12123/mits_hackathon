"""
Database Connection and Session Management
Supports PostgreSQL + PostGIS (via DATABASE_URL) with seamless SQLite fallback.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./floodlens.db")

# SQLite connection args
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency for database session injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initializes tables and seeds default records if empty."""
    from app.models.job import Job
    from app.models.settlement import Settlement
    from app.models.report import Report
    from app.models.accuracy import AccuracyRecord

    Base.metadata.create_all(bind=engine)

    # Seed default mock data if settlements table is empty
    db = SessionLocal()
    try:
        if db.query(Settlement).count() == 0:
            default_settlements = [
                Settlement(id=1, name="Hayaghat", district="Darbhanga", population=42300, flooded_pct=78.0, severity="severe", homes=8200, farms_ha=1240.0),
                Settlement(id=2, name="Benipur", district="Darbhanga", population=31500, flooded_pct=55.0, severity="high", homes=6100, farms_ha=890.0),
                Settlement(id=3, name="Sheohar", district="Sitamarhi", population=28900, flooded_pct=63.0, severity="high", homes=5400, farms_ha=760.0),
                Settlement(id=4, name="Runnisaidpur", district="Sitamarhi", population=18700, flooded_pct=41.0, severity="medium", homes=3900, farms_ha=510.0),
                Settlement(id=5, name="Sitamarhi", district="Sitamarhi", population=94200, flooded_pct=32.0, severity="medium", homes=17300, farms_ha=2100.0),
                Settlement(id=6, name="Muzaffarpur", district="Muzaffarpur", population=354000, flooded_pct=11.0, severity="low", homes=64000, farms_ha=3200.0),
                Settlement(id=7, name="Pusa", district="Darbhanga", population=14800, flooded_pct=88.0, severity="severe", homes=2700, farms_ha=430.0),
            ]
            db.add_all(default_settlements)
            db.commit()

        if db.query(Report).count() == 0:
            default_reports = [
                Report(id="RPT-0041", title="Bihar Flood Impact Report", type="PDF", size="3.8 MB", status="ready", created_at="2026-10-19T10:12:00Z"),
                Report(id="RPT-0040", title="Flood Extent GeoTIFF", type="GeoTIFF", size="42.1 MB", status="ready", created_at="2026-10-19T10:08:00Z"),
                Report(id="RPT-0039", title="Affected Settlements Shapefile", type="Shapefile", size="5.2 MB", status="ready", created_at="2026-10-19T10:08:00Z"),
                Report(id="RPT-0038", title="Pre/Post Change Detection Report", type="PDF", size="2.1 MB", status="ready", created_at="2026-10-18T18:00:00Z"),
                Report(id="RPT-0036", title="Sentinel-1 SAR Analysis", type="PDF", size=None, status="processing", created_at="2026-10-18T01:30:00Z"),
            ]
            db.add_all(default_reports)
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Warning during DB seed: {e}")
    finally:
        db.close()
