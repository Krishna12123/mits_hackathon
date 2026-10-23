import unittest
from datetime import date
from pydantic import ValidationError
from app.models.flood import FloodAnalysisRequest, FloodStatusResponse
from app.services.flood_service import get_flood_status


class TestBipashaFlood(unittest.TestCase):
    def test_flood_analysis_request_valid(self):
        req = FloodAnalysisRequest(
            bbox=[85.0, 26.0, 86.0, 27.0],
            pre_start=date(2026, 9, 1),
            pre_end=date(2026, 9, 15),
            post_start=date(2026, 9, 16),
            post_end=date(2026, 9, 30),
        )
        self.assertEqual(len(req.bbox), 4)

    def test_flood_analysis_request_invalid_bounds(self):
        with self.assertRaises(ValidationError):
            FloodAnalysisRequest(
                bbox=[86.0, 26.0, 85.0, 27.0],  # west >= east
                pre_start=date(2026, 9, 1),
                pre_end=date(2026, 9, 15),
                post_start=date(2026, 9, 16),
                post_end=date(2026, 9, 30),
            )

    def test_flood_status_response_defaults(self):
        resp = FloodStatusResponse(status="test_status")
        self.assertEqual(resp.status, "test_status")
        self.assertIsNone(resp.potential_new_water_area_km2)

    def test_get_flood_status(self):
        status = get_flood_status()
        self.assertIn("status", status)
        self.assertEqual(status["status"], "Flood service is working!")


if __name__ == "__main__":
    unittest.main()
