"""
Tests for Error Handling, Request Correlation IDs, and Pre-seeded Demo Dataset.
"""
import os
import asyncio
import unittest

from main import app
from tests.test_api_integration import ASGIClient


class TestErrorHandlingAndDemo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = ASGIClient(app)

    def test_request_correlation_id_and_timing(self):
        """Responses should carry X-Request-ID and X-Response-Time headers."""
        resp = asyncio.run(self.client.request("GET", "/health"))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("x-request-id", resp.headers)
        self.assertTrue(resp.headers["x-request-id"].startswith("REQ-"))
        self.assertIn("x-response-time", resp.headers)
        self.assertTrue(resp.headers["x-response-time"].endswith("ms"))

    def test_client_supplied_request_id_preserved(self):
        """If client provides X-Request-ID, it must be preserved in response."""
        custom_id = "CUSTOM-REQ-12345"
        resp = asyncio.run(
            self.client.request("GET", "/health", headers={"X-Request-ID": custom_id})
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("x-request-id"), custom_id)

    def test_validation_error_handler_422(self):
        """Invalid request parameters should trigger custom 422 error envelope."""
        # aoi_lat must be between -90 and 90, 999 is invalid
        resp = asyncio.run(
            self.client.request(
                "POST",
                "/api/detect",
                json_data={"aoi_lat": 999.0, "satellite": "Sentinel-2"},
            )
        )
        self.assertEqual(resp.status_code, 422)
        data = resp.json()
        self.assertEqual(data.get("error"), "Validation Error")
        self.assertIn("detail", data)
        self.assertIn("request_id", data)

    def test_not_found_error_handler_404(self):
        """Unknown resource should trigger standardized 404 envelope."""
        resp = asyncio.run(self.client.request("GET", "/api/settlements/999999"))
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertIn("error", data)
        self.assertEqual(data.get("detail"), "Settlement not found")
        self.assertIn("request_id", data)

    def test_pre_seeded_demo_job(self):
        """Demo job JOB-DEMO-2026 must be present, completed, with full metrics."""
        resp = asyncio.run(self.client.request("GET", "/api/flood/results/JOB-DEMO-2026"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "completed")
        self.assertGreater(data.get("flooded_area_km2", 0), 200)
        self.assertIn("geojson", data)
        self.assertEqual(data["geojson"].get("type"), "FeatureCollection")

    def test_pre_seeded_settlements(self):
        """Pre-seeded settlements must include all 10 benchmark locations."""
        resp = asyncio.run(self.client.request("GET", "/api/settlements/affected"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(data.get("total", 0), 10)
        names = [s["name"] for s in data["settlements"]]
        self.assertIn("Hayaghat", names)
        self.assertIn("Benipur", names)
        self.assertIn("Sitamarhi", names)
        self.assertIn("Muzaffarpur", names)

    def test_pre_seeded_accuracy_records(self):
        """Demo job must have 3-stage accuracy iteration history passing the gate."""
        resp = asyncio.run(self.client.request("GET", "/api/accuracy/JOB-DEMO-2026"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("passed_gate"))
        self.assertEqual(data.get("iterations_count"), 3)
        self.assertGreaterEqual(data.get("current_iou"), 0.75)

    def test_download_real_geotiff_artifact(self):
        """Downloading RPT-0040 should stream a real binary GeoTIFF file."""
        resp = asyncio.run(self.client.request("GET", "/api/reports/RPT-0040/download"))
        self.assertEqual(resp.status_code, 200)
        # TIFF magic bytes: II*\x00 (little-endian) or MM\x00* (big-endian)
        self.assertTrue(resp.body.startswith(b"II*\x00") or resp.body.startswith(b"MM\x00*"))

    def test_download_real_csv_report(self):
        """Downloading RPT-0037 should stream a valid CSV report."""
        resp = asyncio.run(self.client.request("GET", "/api/reports/RPT-0037/download"))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Settlement Name", resp.text)
        self.assertIn("Hayaghat", resp.text)

    def test_route_aliases_work_without_api_prefix(self):
        """Frontend baseURL fallback: endpoints without /api prefix should resolve."""
        # /settlements/affected
        resp1 = asyncio.run(self.client.request("GET", "/settlements/affected"))
        self.assertEqual(resp1.status_code, 200)

        # /reports
        resp2 = asyncio.run(self.client.request("GET", "/reports"))
        self.assertEqual(resp2.status_code, 200)

        # /config
        resp3 = asyncio.run(self.client.request("GET", "/config"))
        self.assertEqual(resp3.status_code, 200)

        # /accuracy/JOB-DEMO-2026
        resp4 = asyncio.run(self.client.request("GET", "/accuracy/JOB-DEMO-2026"))
        self.assertEqual(resp4.status_code, 200)

        # /live/dashboard
        resp5 = asyncio.run(self.client.request("GET", "/live/dashboard"))
        self.assertEqual(resp5.status_code, 200)

    def test_trigger_seed_endpoint(self):
        """POST /api/seed should succeed and re-verify demo dataset."""
        resp = asyncio.run(self.client.request("POST", "/api/seed"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "success")


if __name__ == "__main__":
    unittest.main()
