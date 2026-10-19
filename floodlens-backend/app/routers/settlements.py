"""
Settlements Router
GET /api/settlements/affected — List affected settlements with flood data
GET /api/settlements/{id}     — Get settlement detail
"""
from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter()

# Mock data (replace with PostGIS query via geopandas)
MOCK_SETTLEMENTS = [
    {"id": 1, "name": "Hayaghat",     "district": "Darbhanga",   "population": 42300,  "flooded_pct": 78, "severity": "severe", "homes": 8200,  "farms_ha": 1240},
    {"id": 2, "name": "Benipur",      "district": "Darbhanga",   "population": 31500,  "flooded_pct": 55, "severity": "high",   "homes": 6100,  "farms_ha": 890},
    {"id": 3, "name": "Sheohar",      "district": "Sitamarhi",   "population": 28900,  "flooded_pct": 63, "severity": "high",   "homes": 5400,  "farms_ha": 760},
    {"id": 4, "name": "Runnisaidpur", "district": "Sitamarhi",   "population": 18700,  "flooded_pct": 41, "severity": "medium", "homes": 3900,  "farms_ha": 510},
    {"id": 5, "name": "Sitamarhi",    "district": "Sitamarhi",   "population": 94200,  "flooded_pct": 32, "severity": "medium", "homes": 17300, "farms_ha": 2100},
    {"id": 6, "name": "Muzaffarpur",  "district": "Muzaffarpur", "population": 354000, "flooded_pct": 11, "severity": "low",    "homes": 64000, "farms_ha": 3200},
    {"id": 7, "name": "Pusa",         "district": "Darbhanga",   "population": 14800,  "flooded_pct": 88, "severity": "severe", "homes": 2700,  "farms_ha": 430},
]


@router.get("/affected")
async def list_affected(
    severity: Optional[str] = Query(None, description="Filter by severity: low/medium/high/severe"),
    district: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    results = MOCK_SETTLEMENTS
    if severity:
        results = [s for s in results if s["severity"] == severity]
    if district:
        results = [s for s in results if district.lower() in s["district"].lower()]
    return {"total": len(results), "settlements": results[:limit]}


@router.get("/{settlement_id}")
async def get_settlement(settlement_id: int):
    s = next((s for s in MOCK_SETTLEMENTS if s["id"] == settlement_id), None)
    if not s:
        from fastapi import HTTPException
        raise HTTPException(404, "Settlement not found")
    return s
