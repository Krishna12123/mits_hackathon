"""
Settlements Router
GET /api/settlements/affected — List affected settlements with flood data
GET /api/settlements/{id}     — Get settlement detail
"""
from fastapi import APIRouter, Query, Depends, HTTPException, Response
from typing import Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.settlement import Settlement
from app.models.schemas import SettlementResponse, SettlementListResponse
from app.services.report_service import generate_settlement_impact_csv_string

router = APIRouter()


@router.get("/export/csv")
async def export_settlements_csv(db: Session = Depends(get_db)):
    """Exports all settlement impact records as a downloadable CSV report."""
    csv_content = generate_settlement_impact_csv_string(db)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="settlement_impact_report.csv"'},
    )


def _to_settlement_response(s: Settlement) -> SettlementResponse:
    # Coordinate extraction
    coords = None
    if s.longitude is not None and s.latitude is not None:
        coords = [round(s.longitude, 4), round(s.latitude, 4)]
    elif s.geom_geojson and "coordinates" in s.geom_geojson:
        coords = s.geom_geojson["coordinates"]

    total_area = s.total_area_km2
    if total_area is None and s.farms_ha:
        total_area = round((s.farms_ha / 100.0) * 1.5, 1)

    flooded_area = s.flooded_area_km2
    if flooded_area is None and total_area is not None and s.flooded_pct is not None:
        flooded_area = round((total_area * s.flooded_pct) / 100.0, 1)

    return SettlementResponse(
        id=s.id,
        name=s.name,
        district=s.district,
        state=s.state,
        population=s.population,
        flooded_pct=s.flooded_pct,
        severity=s.severity,
        homes=s.homes,
        farms_ha=s.farms_ha,
        total_area_km2=total_area,
        flooded_area_km2=flooded_area,
        coordinates=coords,
    )


@router.get("", response_model=SettlementListResponse)
@router.get("/", response_model=SettlementListResponse, include_in_schema=False)
@router.get("/affected", response_model=SettlementListResponse)
async def list_affected(
    severity: Optional[str] = Query(None, description="Filter by severity: low/medium/high/severe"),
    district: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Settlement)
    if severity:
        query = query.filter(Settlement.severity == severity.lower())
    if district:
        query = query.filter(Settlement.district.ilike(f"%{district}%"))

    records = query.limit(limit).all()
    results = [_to_settlement_response(s) for s in records]
    return SettlementListResponse(total=len(results), settlements=results)


@router.get("/{settlement_id}", response_model=SettlementResponse)
async def get_settlement(settlement_id: int, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")
    return _to_settlement_response(s)
