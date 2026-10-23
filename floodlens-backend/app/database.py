"""
Database Connection and Session Management
Supports PostgreSQL + PostGIS (via DATABASE_URL) with seamless SQLite fallback.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./floodlens.db")

from sqlalchemy.pool import NullPool

# SQLite connection args with 30s lock timeout for high concurrency
connect_args = {"check_same_thread": False, "timeout": 30.0} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    poolclass=NullPool if DATABASE_URL.startswith("sqlite") else None,
    echo=False,
)

if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

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
    from sqlalchemy import text
    from app.models.job import Job
    from app.models.settlement import Settlement
    from app.models.report import Report
    from app.models.accuracy import AccuracyRecord

    Base.metadata.create_all(bind=engine)

    # Lightweight schema upgrade for SQLite if columns are missing
    with engine.connect() as conn:
        for sql in [
            "ALTER TABLE flood_jobs ADD COLUMN progress INTEGER DEFAULT 0",
            "ALTER TABLE flood_jobs ADD COLUMN stage VARCHAR(64) DEFAULT 'queued'",
            "ALTER TABLE flood_jobs ADD COLUMN permanent_water_km2 FLOAT",
            "ALTER TABLE flood_jobs ADD COLUMN total_water_km2 FLOAT",
            "ALTER TABLE flood_jobs ADD COLUMN min_votes INTEGER DEFAULT 2",
            "ALTER TABLE settlements ADD COLUMN total_area_km2 FLOAT",
            "ALTER TABLE settlements ADD COLUMN flooded_area_km2 FLOAT",
            "ALTER TABLE settlements ADD COLUMN latitude FLOAT",
            "ALTER TABLE settlements ADD COLUMN longitude FLOAT",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists or table not ready

    # Seed default mock data and demo flood event
    db = SessionLocal()
    try:
        from app.seed_demo import seed_demo_data
        seed_demo_data(db)
    except Exception as e:
        db.rollback()
        print(f"Warning during DB seed: {e}")
    finally:
        db.close()
