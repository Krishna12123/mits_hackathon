"""
Unit Tests for Day 4 Settlement Impact & Outputs Service
Tests:
- Spatial polygon intersection calculation (full, partial, disjoint)
- Severity categorization (🔴 Severely Affected >= 70%, 🟡 Partially Affected 30-70%, 🟢 Safe < 30%)
- At-risk population and home count scaling
- GeoJSON export structure and metadata
- API Endpoints:
  - POST /api/impact
  - GET /api/impact/summary
  - GET /api/impact/export/geojson
"""
import unittest
from fastapi.testclient import TestClient

from app.services.impact_service import settlement_impact_service
from app.models.impact import ImpactRequest, ImpactResponse
from main import app


class TestSettlementImpactService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_spatial_intersection_and_severity_levels(self):
        """
        Verify that:
        1. A settlement completely inside flood polygon is flagged '🔴 Severely Affected' (100%).
        2. A settlement partially overlapping is flagged '🟡 Partially Affected'.
        3. A settlement outside flood polygon is flagged '🟢 Safe' (0%).
        """
        # Flood extent covering bbox: lon [85.0, 86.0], lat [25.0, 26.0]
        flood_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [85.0, 25.0],
                            [86.0, 25.0],
                            [86.0, 26.0],
                            [85.0, 26.0],
                            [85.0, 25.0],
                        ]],
                    },
                    "properties": {},
                }
            ],
        }

        # 3 settlements:
        # s1: fully inside (85.2 to 85.4, 25.2 to 25.4) -> 100% flooded -> 🔴 Severely Affected
        # s2: half inside (85.8 to 86.2, 25.2 to 25.4) -> ~50% flooded -> 🟡 Partially Affected
        # s3: completely outside (87.0 to 87.2, 25.2 to 25.4) -> 0% flooded -> 🟢 Safe
        settlements = [
            {
                "id": "SET-TEST-1",
                "name": "Inside Village",
                "district": "Darbhanga",
                "state": "Bihar",
                "lat": 25.3,
                "lon": 85.3,
                "population": 1000,
                "homes": 200,
                "coordinates": [
                    [85.2, 25.2],
                    [85.4, 25.2],
                    [85.4, 25.4],
                    [85.2, 25.4],
                    [85.2, 25.2],
                ],
            },
            {
                "id": "SET-TEST-2",
                "name": "Halfway Village",
                "district": "Darbhanga",
                "state": "Bihar",
                "lat": 25.3,
                "lon": 86.0,
                "population": 2000,
                "homes": 400,
                "coordinates": [
                    [85.8, 25.2],
                    [86.2, 25.2],
                    [86.2, 25.4],
                    [85.8, 25.4],
                    [85.8, 25.2],
                ],
            },
            {
                "id": "SET-TEST-3",
                "name": "Safe Village",
                "district": "Darbhanga",
                "state": "Bihar",
                "lat": 25.3,
                "lon": 87.1,
                "population": 500,
                "homes": 100,
                "coordinates": [
                    [87.0, 25.2],
                    [87.2, 25.2],
                    [87.2, 25.4],
                    [87.0, 25.4],
                    [87.0, 25.2],
                ],
            },
        ]

        results = settlement_impact_service.assess_settlement_impact(flood_geojson, settlements)
        self.assertEqual(len(results), 3)

        # Check s1
        s1 = next(r for r in results if r["id"] == "SET-TEST-1")
        self.assertAlmostEqual(s1["flooded_pct"], 100.0, places=1)
        self.assertEqual(s1["severity"], "severe")
        self.assertIn("🔴", s1["severity_badge"])
        self.assertEqual(s1["affected_population"], 1000)
        self.assertEqual(s1["affected_homes"], 200)

        # Check s2
        s2 = next(r for r in results if r["id"] == "SET-TEST-2")
        self.assertTrue(45.0 <= s2["flooded_pct"] <= 55.0)
        self.assertIn(s2["severity"], ["high", "medium"])
        self.assertIn("🟡", s2["severity_badge"])
        self.assertTrue(900 <= s2["affected_population"] <= 1100)

        # Check s3
        s3 = next(r for r in results if r["id"] == "SET-TEST-3")
        self.assertEqual(s3["flooded_pct"], 0.0)
        self.assertEqual(s3["severity"], "safe")
        self.assertIn("🟢", s3["severity_badge"])
        self.assertEqual(s3["affected_population"], 0)
        self.assertEqual(s3["affected_homes"], 0)

    def test_geojson_export(self):
        """Test GeoJSON FeatureCollection generation with properties."""
        test_results = [
            {
                "id": "SET-1",
                "name": "Kalyanpur",
                "district": "Darbhanga",
                "state": "Bihar",
                "lat": 26.0,
                "lon": 85.9,
                "total_area_km2": 4.5,
                "flooded_area_km2": 3.6,
                "flooded_pct": 80.0,
                "severity": "severe",
                "severity_badge": "🔴 Severely Affected",
                "total_population": 5000,
                "affected_population": 4000,
                "total_homes": 1000,
                "affected_homes": 800,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[85.8, 25.9], [86.0, 25.9], [86.0, 26.1], [85.8, 26.1], [85.8, 25.9]]],
                },
            }
        ]

        geojson = settlement_impact_service.export_impact_geojson(test_results)
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertEqual(len(geojson["features"]), 1)
        feat = geojson["features"][0]
        self.assertEqual(feat["properties"]["name"], "Kalyanpur")
        self.assertEqual(feat["properties"]["severity"], "severe")
        self.assertEqual(feat["properties"]["flooded_pct"], 80.0)

    def test_api_impact_endpoint(self):
        """Test POST /api/impact returns valid 200 response with settlement items."""
        response = self.client.post(
            "/api/impact",
            json={
                "district_filter": "Darbhanga",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "completed")
        self.assertIn("settlements", data)
        self.assertGreater(data["total_settlements_analyzed"], 0)
        self.assertIn("severely_affected_count", data)
        self.assertIn("partially_affected_count", data)
        self.assertIn("safe_count", data)

    def test_api_impact_summary_endpoint(self):
        """Test GET /api/impact/summary returns aggregated impact metrics."""
        response = self.client.get("/api/impact/summary?district=Darbhanga")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ready")
        self.assertIn("total_settlements_analyzed", data)
        self.assertIn("total_affected_population", data)

    def test_api_impact_export_geojson_endpoint(self):
        """Test GET /api/impact/export/geojson returns GeoJSON FeatureCollection."""
        response = self.client.get("/api/impact/export/geojson?district=Darbhanga")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertIsInstance(data["features"], list)


if __name__ == "__main__":
    unittest.main()
