"""
Reports Router
GET  /api/reports      — List available reports/exports
GET  /api/reports/{id}/download — Download a report file
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

MOCK_REPORTS = [
    {"id": "RPT-0041", "title": "Bihar Flood Impact Report",       "type": "PDF",      "size": "3.8 MB", "status": "ready",      "date": "2026-10-19T10:12:00Z"},
    {"id": "RPT-0040", "title": "Flood Extent GeoTIFF",            "type": "GeoTIFF",  "size": "42.1 MB","status": "ready",      "date": "2026-10-19T10:08:00Z"},
    {"id": "RPT-0039", "title": "Affected Settlements Shapefile",   "type": "Shapefile","size": "5.2 MB", "status": "ready",      "date": "2026-10-19T10:08:00Z"},
    {"id": "RPT-0038", "title": "Pre/Post Change Detection Report", "type": "PDF",      "size": "2.1 MB", "status": "ready",      "date": "2026-10-18T18:00:00Z"},
    {"id": "RPT-0036", "title": "Sentinel-1 SAR Analysis",         "type": "PDF",      "size": None,     "status": "processing", "date": "2026-10-18T01:30:00Z"},
]


@router.get("")
async def list_reports():
    return {"reports": MOCK_REPORTS}


@router.get("/{report_id}/download")
async def download_report(report_id: str):
    report = next((r for r in MOCK_REPORTS if r["id"] == report_id), None)
    if not report:
        raise HTTPException(404, "Report not found")
    if report["status"] != "ready":
        raise HTTPException(202, "Report still processing")
    # In production: stream file from S3 / local storage
    return {"message": f"Download URL for {report_id}", "url": f"/storage/{report_id}"}
