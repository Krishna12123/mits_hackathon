"""
Report Generation Service
Generates Settlement Impact CSV Reports (name, population, flood %, flag),
GeoJSON summaries, and handles report file artifact management.
"""
import os
import csv
import io
import datetime
from typing import Optional, List
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.settlement import Settlement

REPORTS_DIR = "outputs/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)


def determine_impact_flag(flooded_pct: float, severity: Optional[str] = None) -> str:
    """
    Computes human-readable severity flag badge based on flooded area percentage.
    - >= 70%: 🔴 Severely Affected
    - >= 30%: 🟡 Partially Affected
    - < 30%:  🟢 Safe
    """
    if severity and severity.lower() == "severe" or flooded_pct >= 70.0:
        return "🔴 Severely Affected"
    elif severity and severity.lower() in ("high", "medium") or flooded_pct >= 30.0:
        return "🟡 Partially Affected"
    else:
        return "🟢 Safe"


def build_settlement_csv_rows(db: Optional[Session] = None) -> List[dict]:
    """Retrieves settlements and formats data rows for CSV report."""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        settlements = db.query(Settlement).order_by(Settlement.flooded_pct.desc()).all()
        rows = []
        for s in settlements:
            flag = determine_impact_flag(s.flooded_pct, s.severity)
            rows.append({
                "Settlement Name": s.name,
                "District": s.district,
                "State": s.state or "Bihar",
                "Population": s.population,
                "Flooded %": f"{s.flooded_pct:.1f}%",
                "Impact Flag": flag,
                "Homes Affected": s.homes,
                "Farmland Flooded (ha)": f"{s.farms_ha:.1f}",
            })
        return rows
    finally:
        if close_db:
            db.close()


def generate_settlement_impact_csv_string(db: Optional[Session] = None, job_id: Optional[str] = None) -> str:
    """Generates Settlement Impact CSV report as an in-memory string."""
    rows = build_settlement_csv_rows(db)
    output = io.StringIO()
    if job_id and db:
        try:
            from app.models.job import Job
            job = db.query(Job).filter(Job.id == job_id).first()
            if job and job.data_source:
                output.write(f"# Provenance Data Source: {job.data_source}\n")
        except Exception:
            pass
    fieldnames = [
        "Settlement Name",
        "District",
        "State",
        "Population",
        "Flooded %",
        "Impact Flag",
        "Homes Affected",
        "Farmland Flooded (ha)",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def generate_settlement_impact_csv(job_id: Optional[str] = None, db: Optional[Session] = None) -> str:
    """
    Generates and saves the Settlement Impact CSV Report to disk.
    Returns the absolute or relative file path to the generated CSV.
    """
    csv_content = generate_settlement_impact_csv_string(db, job_id=job_id)
    filename = f"settlement_impact_{job_id or 'latest'}.csv"
    file_path = os.path.join(REPORTS_DIR, filename)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(csv_content)

    return file_path
