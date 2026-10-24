"""
Unit Tests for Day 3 Refinement & Quality Gate Service
Tests:
- Terrain Slope Filtering
- HAND (Height Above Nearest Drainage) Filtering
- SAR Speckle Cleaning (Median & Lee Filters)
- SAR Gap Filling (Cloud replacement)
- Full Refinement Pipeline Orchestration
- /api/refine Endpoint Integration
"""
import asyncio
import json
import unittest
from typing import Optional, Any
from urllib.parse import urlencode

from app.services.refinement_service import refinement_service
from app.models.refine import RefineRequest, RefineResponse
from main import app


class ASGIResponse:
    def __init__(self, status_code: int, headers: dict, body: bytes):
        self.status_code = status_code
        self.headers = headers
        self.body = body

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))


class ASGIClient:
    def __init__(self, asgi_app):
        self.app = asgi_app

    async def get(self, path: str) -> ASGIResponse:
        return await self.request("GET", path)

    async def post(self, path: str, json: Optional[Any] = None) -> ASGIResponse:
        return await self.request("POST", path, json_data=json)

    async def request(
        self,
        method: str,
        path: str,
        json_data: Optional[Any] = None,
    ) -> ASGIResponse:
        raw_headers = [(b"host", b"testserver")]
        body_bytes = b""
        if json_data is not None:
            body_bytes = json.dumps(json_data).encode("utf-8")
            raw_headers.append((b"content-type", b"application/json"))

        scope = {
            "type": "http",
            "http_version": "1.1",
            "method": method.upper(),
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": b"",
            "headers": raw_headers,
            "app": self.app,
        }

        response_status = 500
        response_headers = {}
        response_body = []
        body_sent = False
        disconnect_event = asyncio.Event()

        async def receive():
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            await disconnect_event.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            nonlocal response_status, response_headers
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = {
                    k.decode("utf-8").lower(): v.decode("utf-8")
                    for k, v in message.get("headers", [])
                }
            elif message["type"] == "http.response.body":
                response_body.append(message.get("body", b""))
                if not message.get("more_body", False):
                    disconnect_event.set()

        try:
            await self.app(scope, receive, send)
        finally:
            disconnect_event.set()
        return ASGIResponse(response_status, response_headers, b"".join(response_body))


class TestRefinementService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = ASGIClient(app)

    def test_slope_filter_removes_steep_terrain(self):
        """Water on slopes > 5 deg should be removed; water on flat slopes retained."""
        # 3x3 water mask (all 1s)
        water_mask = [
            [1, 1, 1],
            [1, 1, 1],
            [1, 1, 1],
        ]
        # Slopes: top row flat (1.0 deg), middle row moderate (4.5 deg), bottom row steep (12.0 deg)
        slope_grid = [
            [1.0, 2.0, 1.5],
            [3.0, 4.5, 4.0],
            [8.0, 12.0, 15.0],
        ]

        result = refinement_service.apply_slope_filter(
            water_mask=water_mask,
            slope_grid=slope_grid,
            max_slope_deg=5.0,
        )

        self.assertEqual(result["original_water_pixels"], 9)
        self.assertEqual(result["retained_water_pixels"], 6)
        self.assertEqual(result["removed_pixels"], 3)
        self.assertEqual(result["refined_mask"][2], [0, 0, 0])
        self.assertEqual(result["refined_mask"][0], [1, 1, 1])

    def test_hand_filter_removes_high_elevation_water(self):
        """Water on HAND > 15m should be removed as outside floodplain."""
        water_mask = [
            [1, 1],
            [1, 1],
        ]
        # Top row low HAND (3m, 8m), bottom row high HAND (22m, 35m)
        hand_grid = [
            [3.0, 8.0],
            [22.0, 35.0],
        ]

        result = refinement_service.apply_hand_filter(
            water_mask=water_mask,
            hand_grid=hand_grid,
            max_hand_m=15.0,
        )

        self.assertEqual(result["retained_water_pixels"], 2)
        self.assertEqual(result["removed_pixels"], 2)
        self.assertEqual(result["refined_mask"][0], [1, 1])
        self.assertEqual(result["refined_mask"][1], [0, 0])

    def test_median_speckle_filter(self):
        """Median filter should eliminate isolated noise spikes."""
        grid = [
            [10.0, 10.0, 10.0],
            [10.0, 99.0, 10.0],  # 99.0 is an extreme isolated speckle spike
            [10.0, 10.0, 10.0],
        ]

        filtered = refinement_service.apply_median_speckle_filter(grid, window_size=3)
        # Center pixel (99.0) should be smoothed down to the median (10.0)
        self.assertEqual(filtered[1][1], 10.0)

    def test_lee_filter(self):
        """Adaptive Lee filter reduces variance in uniform areas."""
        grid = [
            [5.0, 5.0, 5.0],
            [5.0, 6.0, 5.0],
            [5.0, 5.0, 5.0],
        ]
        filtered = refinement_service.apply_lee_filter(grid, window_size=3)
        self.assertAlmostEqual(filtered[1][1], 5.1, delta=0.5)

    def test_sar_gap_fill(self):
        """
        SAR should fill cloudy optical gaps:
        - Pixel (0,0): optical valid (1), optical water (1) -> retain optical water
        - Pixel (0,1): optical invalid/cloud (0), SAR valid (1), SAR water (1) -> filled by SAR
        - Pixel (1,0): optical invalid/cloud (0), SAR valid (1), SAR land (0) -> land
        - Pixel (1,1): optical valid (1), optical land (0) -> land
        """
        optical_water = [[1, 0], [0, 0]]
        optical_valid = [[1, 0], [0, 1]]  # (0,1) and (1,0) are cloudy/invalid
        sar_water = [[0, 1], [0, 0]]
        sar_valid = [[1, 1], [1, 1]]

        result = refinement_service.apply_sar_gap_fill(
            optical_water_mask=optical_water,
            optical_valid_mask=optical_valid,
            sar_water_mask=sar_water,
            sar_valid_mask=sar_valid,
        )

        self.assertEqual(result["optical_water_pixels"], 1)
        self.assertEqual(result["sar_filled_water_pixels"], 1)
        self.assertEqual(result["total_water_pixels"], 2)
        self.assertEqual(result["combined_mask"][0][0], 1)  # optical
        self.assertEqual(result["combined_mask"][0][1], 1)  # sar filled
        self.assertEqual(result["combined_mask"][1], [0, 0])

    def test_full_refinement_pipeline(self):
        """Tests combined refinement pipeline orchestration."""
        water_mask = [
            [1, 1],
            [1, 1],
        ]
        slope_grid = [
            [1.0, 2.0],
            [3.0, 12.0],  # (1,1) is steep slope > 5 deg
        ]
        hand_grid = [
            [4.0, 20.0],  # (0,1) is high HAND > 15m
            [2.0, 1.0],
        ]

        result = refinement_service.refine_flood_extent(
            water_mask=water_mask,
            slope_grid=slope_grid,
            hand_grid=hand_grid,
            max_slope_deg=5.0,
            max_hand_m=15.0,
            enable_gap_fill=False,
        )

        self.assertEqual(result["initial_water_pixels"], 4)
        self.assertEqual(result["slope_removed_pixels"], 1)
        self.assertEqual(result["hand_removed_pixels"], 1)
        self.assertEqual(result["final_water_pixels"], 2)
        # Only (0,0) and (1,0) should survive
        self.assertEqual(result["refined_mask"][0][0], 1)
        self.assertEqual(result["refined_mask"][1][0], 1)
        self.assertEqual(result["refined_mask"][0][1], 0)
        self.assertEqual(result["refined_mask"][1][1], 0)

    def test_api_refine_status(self):
        """GET /api/refine/status endpoint check."""
        response = asyncio.run(self.client.get("/api/refine/status"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ready")
        self.assertIn("default_slope_threshold_deg", data)

    def test_api_refine_post(self):
        """POST /api/refine endpoint check."""
        payload = {
            "water_mask": [[1, 1], [0, 1]],
            "slope_grid": [[1.0, 8.0], [2.0, 1.0]],
            "max_slope_deg": 5.0,
            "enable_slope_filter": True,
            "enable_hand_filter": False,
            "enable_gap_fill": False,
        }
        response = asyncio.run(self.client.post("/api/refine", json=payload))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["initial_water_pixels"], 3)
        self.assertEqual(data["slope_removed_pixels"], 1)
        self.assertEqual(data["final_water_pixels"], 2)


if __name__ == "__main__":
    unittest.main()
