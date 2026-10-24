"""
Reports Router
GET  /api/reports                         — List available flood analysis reports and exports
GET  /api/reports/settlement-impact/csv   — Download Settlement Impact CSV Report
GET  /api/reports/{id}/download           — Stream/download report artifact (CSV, GeoTIFF, etc.)
"""
import os
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.report import Report
from app.models.schemas import ReportListResponse, ReportItem
from app.services.report_service import (
    generate_settlement_impact_csv_string,
    generate_settlement_impact_csv,
)

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
            data_source=r.data_source,
        )
        for r in reports
    ]
    return ReportListResponse(reports=items)


@router.get("/settlement-impact/csv")
async def download_settlement_impact_csv(db: Session = Depends(get_db)):
    """
    Generates and streams the official Settlement Impact CSV Report.
    Columns: Settlement Name, District, State, Population, Flooded %, Impact Flag, Homes Affected, Farmland Flooded (ha).
    """
    csv_content = generate_settlement_impact_csv_string(db)
    filename = "settlement_impact_report.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


@router.get("/{report_id}/download")
async def download_report(report_id: str, as_json: bool = False, db: Session = Depends(get_db)):
    """
    Streams or returns downloadable artifact for a specific report ID.
    If the report is a CSV or exists locally, streams the file directly with appropriate headers.
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status == "processing":
        raise HTTPException(status_code=202, detail="Report generation in progress")
    if report.status in ("failed", "unavailable"):
        raise HTTPException(status_code=404, detail=f"Artifact unavailable (status: {report.status})")

    # If JSON description is explicitly requested
    if as_json:
        return {
            "report_id": report.id,
            "title": report.title,
            "type": report.type,
            "download_url": f"/api/reports/{report.id}/download",
            "message": f"Artifact ready for download ({report.size or 'N/A'})",
            "data_source": report.data_source,
        }

    # Handle CSV reports
    if report.type.upper() == "CSV" or report_id == "RPT-0037":
        csv_content = generate_settlement_impact_csv_string(db)
        filename = f"{report.id}_settlement_impact.csv"
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Handle local file artifact if available
    if report.file_path and os.path.exists(report.file_path) and os.path.getsize(report.file_path) > 0:
        filename = os.path.basename(report.file_path)
        media_type = "image/tiff" if report.type.upper() == "GEOTIFF" else "application/octet-stream"
        return FileResponse(
            path=report.file_path,
            filename=filename,
            media_type=media_type,
        )

    # Preserve legacy demonstration text downloads strictly for seeded demo reports (RPT-*)
    if report_id.startswith("RPT-") or report.data_source == "synthetic_demo":
        sample_content = f"FloodLens Artifact: {report.title}\nReport ID: {report.id}\nType: {report.type}\nStatus: {report.status}\n"
        return Response(
            content=sample_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{report.id}.txt"'},
        )

    # For live jobs where file is missing from disk, do not fabricate an artifact
    raise HTTPException(status_code=404, detail=f"Artifact file for {report.id} was not found on storage")
