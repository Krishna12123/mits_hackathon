"""
Reports Router
GET  /api/reports               — List available flood analysis reports and exports
GET  /api/reports/{id}/download — Stream/download report artifact
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.report import Report
from app.models.schemas import ReportListResponse, ReportItem

router = APIRouter()


@router.get("", response_model=ReportListResponse)
async def list_reports(db: Session = Depends(get_db)):
    """Fetches list of generated reports and geospatial exports."""
    reports = db.query(Report).all()
    items = [
        ReportItem(
            id=r.id,
            title=r.title,
            type=r.type,
            size=r.size,
            status=r.status,
            date=r.created_at,
        )
        for r in reports
    ]
    return ReportListResponse(reports=items)


@router.get("/{report_id}/download")
async def download_report(report_id: str, db: Session = Depends(get_db)):
    """Returns downloadable download URL or stream for specific report artifact."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != "ready":
        raise HTTPException(status_code=202, detail="Report generation in progress")

    return {
        "report_id": report.id,
        "title": report.title,
        "type": report.type,
        "download_url": f"/storage/reports/{report.id}.{report.type.lower()}",
        "message": f"Artifact ready for download ({report.size or 'N/A'})",
    }
