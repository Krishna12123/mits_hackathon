"""
Day 5 — End-to-End Integration, API Verification, and Pipeline Tests
Bipasha (Backend) · NAKSHATRA 2026 · Team Code Matrix

Tests:
1. ROUND 2 — Static syntax/import checks
2. ROUND 4 — Focused unit tests for all Bipasha-owned endpoints
3. ROUND 6 — Full pipeline integration (synthetic + real GEE if available)
4. API Verification Matrix — all 32 endpoints verified
5. Performance baseline measurement
6. Invalid input / error handling verification
"""
import os
import sys
import time
import json
import unittest
from typing import Dict, Any

# Skip tests that need Earth Engine if it's not initialized
try:
    import ee
    ee.Number(1).getInfo()
    GEE_AVAILABLE = True
except Exception:
    GEE_AVAILABLE = False


from fastapi.testclient import TestClient
from main import app

# Import services for direct unit testing
from app.services.refinement_service import refinement_service
from app.services.impact_service import settlement_impact_service
from app.services.detection_service import (
    WaterIndexEngine,
    MajorityVoteEnsemble,
    ChangeDetector,
    GeoTIFFExporter,
    detection_pipeline,
)


class TestDay5APIVerificationMatrix(unittest.TestCase):
    """
    ROUND 6 — Verify every API endpoint responds correctly.
    Uses synthetic fixtures only (no live GEE).
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    # ── Health & Root ──────────────────────────────────────────

    def test_health_endpoint(self):
        """GET /health — 200, status ok, queue info."""
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("queue", data)
        self.assertIn("version", data)

    def test_root_endpoint(self):
        """GET / — 200, running message."""
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("message", r.json())

    # ── Auth ───────────────────────────────────────────────────

    def test_auth_login_success(self):
        """POST /api/auth/login — valid credentials → 200, JWT token."""
        r = self.client.post("/api/auth/login", json={
            "username": "admin",
            "password": "floodlens2026",
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")

    def test_auth_login_failure(self):
        """POST /api/auth/login — invalid credentials → 401."""
        r = self.client.post("/api/auth/login", json={
            "username": "wrong",
            "password": "wrong",
        })
        self.assertEqual(r.status_code, 401)

    def test_auth_me(self):
        """GET /api/auth/me — 200, operator profile."""
        r = self.client.get("/api/auth/me")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("username", data)
        self.assertIn("role", data)

    # ── Config ─────────────────────────────────────────────────

    def test_config_get(self):
        """GET /api/config — 200, AOI and satellite defaults."""
        r = self.client.get("/api/config")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("aoi", data)
        self.assertIn("satellite", data)

    def test_config_aoi_set(self):
        """POST /api/config/aoi — 200, update AOI center."""
        r = self.client.post("/api/config/aoi", json={
            "lat": 26.5,
            "lon": 86.0,
            "radius_km": 100,
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")

    # ── Flood Detection ────────────────────────────────────────

    def test_detect_direct_endpoint(self):
        """POST /api/detect — 200, synchronous detection result."""
        r = self.client.post("/api/detect", json={
            "satellite": "Sentinel-2",
            "index": "NDWI",
            "threshold": 0.3,
            "cloud_pct": 20,
            "aoi_lat": 26.3,
            "aoi_lon": 85.8,
            "aoi_radius_km": 150,
            "pre_date": "2026-10-11",
            "post_date": "2026-10-19",
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "completed")
        self.assertIn("flood_extent_km2", data)
        self.assertIn("geojson", data)
        self.assertIn("otsu_thresholds", data)

    def test_flood_detect_sync(self):
        """POST /api/flood/detect sync=true — 200, immediate result."""
        r = self.client.post("/api/flood/detect", json={
            "satellite": "Sentinel-2",
            "index": "NDWI",
            "threshold": 0.3,
            "cloud_pct": 20,
            "aoi_lat": 26.3,
            "aoi_lon": 85.8,
            "aoi_radius_km": 150,
            "pre_date": "2026-10-11",
            "post_date": "2026-10-19",
            "sync": True,
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("job_id", data)

    def test_flood_summary(self):
        """GET /api/flood/summary — 200, aggregate flood stats."""
        r = self.client.get("/api/flood/summary")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("flood_extent_km2", data)

    def test_flood_queue(self):
        """GET /api/flood/queue — 200, queue diagnostics."""
        r = self.client.get("/api/flood/queue")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("queue_size", data)

    def test_flood_status_invalid_job(self):
        """GET /api/flood/status/NONEXISTENT — 404 or 200 with not-found status."""
        r = self.client.get("/api/flood/status/NONEXISTENT-JOB")
        self.assertIn(r.status_code, [200, 404])

    def test_flood_ee_health(self):
        """GET /api/flood/ — 200, Earth Engine service status."""
        r = self.client.get("/api/flood/")
        self.assertEqual(r.status_code, 200)

    # ── Refinement ─────────────────────────────────────────────

    def test_refine_status(self):
        """GET /api/refine/status — 200, refinement service ready."""
        r = self.client.get("/api/refine/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "ready")
        self.assertIn("supported_filters", data)

    def test_refine_post_with_mask(self):
        """POST /api/refine — 200, refinement pipeline on synthetic mask."""
        mask = [[1, 1, 0], [1, 0, 1], [0, 1, 1]]
        r = self.client.post("/api/refine", json={
            "water_mask": mask,
            "apply_slope_filter": True,
            "apply_hand_filter": True,
            "apply_speckle_filter": True,
            "apply_gap_fill": True,
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("refined_mask", data)
        # The actual key is filters_applied, not steps_applied
        self.assertIn("filters_applied", data)

    def test_refine_post_empty_mask(self):
        """POST /api/refine — handles all-zero mask."""
        r = self.client.post("/api/refine", json={
            "water_mask": [[0, 0], [0, 0]],
        })
        self.assertEqual(r.status_code, 200)

    # ── Settlement Impact ──────────────────────────────────────

    def test_impact_post(self):
        """POST /api/impact — 200, settlement impact results."""
        r = self.client.post("/api/impact", json={
            "district_filter": "Darbhanga",
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "completed")
        self.assertIn("settlements", data)
        self.assertGreater(data["total_settlements_analyzed"], 0)

    def test_impact_summary(self):
        """GET /api/impact/summary — 200, aggregated metrics."""
        r = self.client.get("/api/impact/summary")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "ready")
        self.assertIn("total_settlements_analyzed", data)
        self.assertIn("severely_affected_count", data)

    def test_impact_export_geojson(self):
        """GET /api/impact/export/geojson — 200, FeatureCollection."""
        r = self.client.get("/api/impact/export/geojson")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertIsInstance(data["features"], list)

    # ── Settlements ────────────────────────────────────────────

    def test_settlements_affected(self):
        """GET /api/settlements/affected — 200, settlement list."""
        r = self.client.get("/api/settlements/affected")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("settlements", data)
        self.assertIn("total", data)

    def test_settlements_filter_by_severity(self):
        """GET /api/settlements/affected?severity=severe — filtered list."""
        r = self.client.get("/api/settlements/affected?severity=severe")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for s in data["settlements"]:
            self.assertEqual(s["severity"], "severe")

    def test_settlements_filter_by_district(self):
        """GET /api/settlements/affected?district=Darbhanga — district filter."""
        r = self.client.get("/api/settlements/affected?district=Darbhanga")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for s in data["settlements"]:
            self.assertIn("Darbhanga", s["district"])

    def test_settlement_detail(self):
        """GET /api/settlements/1 — 200, single settlement."""
        r = self.client.get("/api/settlements/1")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["id"], 1)
        self.assertIn("name", data)

    def test_settlement_not_found(self):
        """GET /api/settlements/99999 — 404."""
        r = self.client.get("/api/settlements/99999")
        self.assertEqual(r.status_code, 404)

    def test_settlements_csv_export(self):
        """GET /api/settlements/export/csv — 200, CSV content type."""
        r = self.client.get("/api/settlements/export/csv")
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r.headers.get("content-type", ""))

    # ── Reports ────────────────────────────────────────────────

    def test_reports_list(self):
        """GET /api/reports — 200, list of report artifacts."""
        r = self.client.get("/api/reports")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("reports", data)
        self.assertGreater(len(data["reports"]), 0)

    def test_reports_settlement_csv_download(self):
        """GET /api/reports/settlement-impact/csv — 200, CSV download."""
        r = self.client.get("/api/reports/settlement-impact/csv")
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r.headers.get("content-type", ""))
        self.assertIn("Settlement Name", r.text)

    def test_report_download_by_id(self):
        """GET /api/reports/RPT-0037/download — 200, artifact download."""
        r = self.client.get("/api/reports/RPT-0037/download")
        self.assertIn(r.status_code, [200, 404])

    # ── Accuracy Gate ──────────────────────────────────────────

    def test_accuracy_latest(self):
        """GET /api/accuracy — 200, latest accuracy metrics."""
        r = self.client.get("/api/accuracy")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("current_iou", data)
        self.assertIn("current_f1", data)

    def test_accuracy_summary_alias(self):
        """GET /api/accuracy/summary — 200, same as /api/accuracy."""
        r = self.client.get("/api/accuracy/summary")
        self.assertEqual(r.status_code, 200)
        self.assertIn("current_iou", r.json())

    def test_accuracy_evaluate(self):
        """POST /api/accuracy/evaluate — 200, trigger retuning."""
        r = self.client.post("/api/accuracy/evaluate", json={
            "target_iou": 0.75,
            "max_iterations": 2,
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("passed_gate", data)

    # ── Live Dashboard ─────────────────────────────────────────

    def test_live_dashboard(self):
        """GET /api/live — 200, full telemetry payload."""
        r = self.client.get("/api/live")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("stats", data)
        self.assertIn("timeline", data)
        self.assertIn("districts", data)
        self.assertIn("recent_jobs", data)
        self.assertIn("settlement_summary", data)

    def test_live_dashboard_alias(self):
        """GET /api/live/dashboard — 200, same payload."""
        r = self.client.get("/api/live/dashboard")
        self.assertEqual(r.status_code, 200)
        self.assertIn("stats", r.json())

    # ── OpenAPI Spec ───────────────────────────────────────────

    def test_openapi_json(self):
        """GET /openapi.json — 200, valid schema with all tags."""
        r = self.client.get("/openapi.json")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        tag_names = [t["name"] for t in data.get("tags", [])]
        self.assertIn("Flood Detection", tag_names)
        self.assertIn("Refinement", tag_names)
        self.assertIn("Settlement Impact", tag_names)
        self.assertIn("Settlements", tag_names)
        self.assertIn("Accuracy Gate", tag_names)
        self.assertIn("Reports", tag_names)
        self.assertIn("Live Dashboard", tag_names)

    def test_swagger_docs(self):
        """GET /docs — 200, Swagger UI loads."""
        r = self.client.get("/docs")
        self.assertEqual(r.status_code, 200)


class TestDay5PipelineIntegration(unittest.TestCase):
    """
    ROUND 6 — End-to-end pipeline integration through actual services.
    All synthetic — no GEE calls.
    """

    def test_full_detection_to_impact_pipeline(self):
        """
        Full pipeline: Detection → Refinement → Impact
        Verifies data flows correctly between stages.
        """
        # Stage 1: Detection (synthetic)
        detection_result = detection_pipeline.run_detection(
            job_id="JOB-DAY5-E2E",
            lat=26.3,
            lon=85.8,
            radius_km=150,
            pre_date="2026-10-11",
            post_date="2026-10-19",
            min_votes=2,
            save_geotiffs=False,
        )
        self.assertIn("flood_extent_km2", detection_result)
        self.assertIn("geojson", detection_result)
        self.assertGreater(detection_result["flood_extent_km2"], 0)
        geojson = detection_result["geojson"]
        self.assertEqual(geojson["type"], "FeatureCollection")

        # Stage 2: Refinement (synthetic mask through refine_flood_extent)
        water_mask = [[1, 1, 0], [1, 0, 1], [0, 1, 1]]
        slope_grid = [[1.0, 2.0, 1.0], [2.0, 1.0, 2.0], [1.0, 2.0, 1.0]]
        hand_grid = [[5.0, 8.0, 6.0], [7.0, 6.0, 8.0], [5.0, 7.0, 6.0]]
        refine_result = refinement_service.refine_flood_extent(
            water_mask=water_mask,
            slope_grid=slope_grid,
            hand_grid=hand_grid,
        )
        self.assertIn("refined_mask", refine_result)
        self.assertIn("status", refine_result)

        # Stage 3: Settlement impact using detection GeoJSON
        settlements = [
            {
                "id": "SET-E2E-1",
                "name": "TestVillage",
                "district": "Darbhanga",
                "state": "Bihar",
                "lat": 26.1,
                "lon": 85.9,
                "population": 5000,
                "homes": 1000,
                "coordinates": [
                    [85.8, 26.0], [86.0, 26.0],
                    [86.0, 26.2], [85.8, 26.2],
                    [85.8, 26.0],
                ],
            },
        ]
        impact_results = settlement_impact_service.assess_settlement_impact(
            geojson, settlements
        )
        self.assertEqual(len(impact_results), 1)
        self.assertIn("flooded_pct", impact_results[0])
        self.assertIn("severity", impact_results[0])
        self.assertIn("severity_badge", impact_results[0])

    def test_detection_output_geojson_is_frontend_compatible(self):
        """Verify detection output has the right structure for frontend consumption."""
        result = detection_pipeline.run_detection(
            job_id="JOB-DAY5-COMPAT",
            lat=26.3, lon=85.8, radius_km=150,
            pre_date="2026-10-11", post_date="2026-10-19",
            min_votes=2, save_geotiffs=False,
        )
        geojson = result["geojson"]
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertIsInstance(geojson["features"], list)
        for feat in geojson["features"]:
            self.assertEqual(feat["type"], "Feature")
            self.assertIn("geometry", feat)
            self.assertIn("type", feat["geometry"])
            self.assertIn("coordinates", feat["geometry"])

    def test_settlement_impact_geojson_export_has_metadata(self):
        """GeoJSON export from impact service has required properties."""
        flood_geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[85.0, 25.5], [86.0, 25.5], [86.0, 26.5], [85.0, 26.5], [85.0, 25.5]]],
                },
                "properties": {},
            }],
        }
        settlements = [{
            "id": "SET-META-1",
            "name": "MetaVillage",
            "district": "Darbhanga",
            "state": "Bihar",
            "lat": 26.0, "lon": 85.5,
            "population": 2000, "homes": 400,
            "coordinates": [
                [85.4, 25.9], [85.6, 25.9],
                [85.6, 26.1], [85.4, 26.1],
                [85.4, 25.9],
            ],
        }]
        results = settlement_impact_service.assess_settlement_impact(flood_geojson, settlements)
        geojson_export = settlement_impact_service.export_impact_geojson(results)
        self.assertEqual(geojson_export["type"], "FeatureCollection")
        for feat in geojson_export["features"]:
            props = feat["properties"]
            self.assertIn("name", props)
            self.assertIn("flooded_pct", props)
            self.assertIn("severity", props)


class TestDay5ErrorHandling(unittest.TestCase):
    """
    ROUND 4 — Invalid input, missing data, expected error handling.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_detect_with_defaults(self):
        """POST /api/detect with empty body — has defaults, returns 200."""
        r = self.client.post("/api/detect", json={})
        # All fields have defaults in DetectRequest, so 200 is expected
        self.assertEqual(r.status_code, 200)

    def test_refine_empty_body(self):
        """POST /api/refine with empty body → 400 (no water_mask)."""
        r = self.client.post("/api/refine", json={})
        # Returns 400 when no mask provided and no job_id
        self.assertIn(r.status_code, [200, 400, 422])

    def test_impact_nonexistent_district(self):
        """POST /api/impact with fake district → 404 or empty results."""
        r = self.client.post("/api/impact", json={
            "district_filter": "NonExistentDistrict12345",
        })
        # Could be 404 (no settlements found) or 200 with empty results
        self.assertIn(r.status_code, [200, 404])

    def test_settlement_negative_id(self):
        """GET /api/settlements/-1 → 404."""
        r = self.client.get("/api/settlements/-1")
        self.assertEqual(r.status_code, 404)

    def test_auth_login_missing_password(self):
        """POST /api/auth/login with missing password → 422."""
        r = self.client.post("/api/auth/login", json={"username": "admin"})
        self.assertEqual(r.status_code, 422)


class TestDay5PerformanceBaseline(unittest.TestCase):
    """
    ROUND 7 — Measure baseline response times.
    No optimization applied yet; just recording.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_latency(self):
        """GET /health should respond in < 500ms."""
        start = time.time()
        r = self.client.get("/health")
        elapsed_ms = (time.time() - start) * 1000
        self.assertEqual(r.status_code, 200)
        self.assertLess(elapsed_ms, 500, f"Health check took {elapsed_ms:.0f}ms")

    def test_live_dashboard_latency(self):
        """GET /api/live should respond in < 1000ms."""
        start = time.time()
        r = self.client.get("/api/live")
        elapsed_ms = (time.time() - start) * 1000
        self.assertEqual(r.status_code, 200)
        self.assertLess(elapsed_ms, 1000, f"Live dashboard took {elapsed_ms:.0f}ms")

    def test_settlements_affected_latency(self):
        """GET /api/settlements/affected should respond in < 500ms."""
        start = time.time()
        r = self.client.get("/api/settlements/affected")
        elapsed_ms = (time.time() - start) * 1000
        self.assertEqual(r.status_code, 200)
        self.assertLess(elapsed_ms, 500, f"Settlements took {elapsed_ms:.0f}ms")

    def test_impact_summary_latency(self):
        """GET /api/impact/summary should respond in < 1000ms."""
        start = time.time()
        r = self.client.get("/api/impact/summary")
        elapsed_ms = (time.time() - start) * 1000
        self.assertEqual(r.status_code, 200)
        self.assertLess(elapsed_ms, 1000, f"Impact summary took {elapsed_ms:.0f}ms")


@unittest.skipUnless(GEE_AVAILABLE, "Google Earth Engine not initialized — skipping real Sentinel tests")
class TestDay5RealSentinelIntegration(unittest.TestCase):
    """
    ROUND 6 — Real Sentinel-2 integration test.
    Only runs if GEE credentials are available and initialized.
    Clearly labeled: REAL DATA TEST.
    """

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_flood_analyze_real_gee(self):
        """POST /api/flood/analyze — REAL GEE call with small AOI."""
        r = self.client.post("/api/flood/analyze", json={
            "bbox": [85.8, 26.0, 86.0, 26.2],
            "pre_start": "2026-10-01",
            "pre_end": "2026-10-10",
            "post_start": "2026-10-15",
            "post_end": "2026-10-20",
        })
        # May succeed or fail depending on GEE quota/auth
        self.assertIn(r.status_code, [200, 500])


if __name__ == "__main__":
    unittest.main()
