"""
End-to-End API Integration Tests for FloodLens Day 4
Tests all API endpoints, background queue, CSV reports, live dashboard, and WebSocket contracts.
"""
import os
import json
import asyncio
import unittest
from typing import Dict, Any, Tuple, Optional
from urllib.parse import urlencode

from main import app
from app.database import init_db, SessionLocal
from app.models.job import Job
from app.models.settlement import Settlement
from app.models.report import Report
from app.services.report_service import (
    determine_impact_flag,
    generate_settlement_impact_csv_string,
    generate_settlement_impact_csv,
)
from app.services.job_queue import AsyncJobQueue


class ASGIResponse:
    """Convenience wrapper for ASGI responses."""

    def __init__(self, status_code: int, headers: dict, body: bytes):
        self.status_code = status_code
        self.headers = headers
        self.body = body

    @property
    def text(self) -> str:
        return self.body.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.text)


class ASGIClient:
    """Lightweight in-memory ASGI test client for FastAPI."""

    def __init__(self, asgi_app):
        self.app = asgi_app

    async def request(
        self,
        method: str,
        path: str,
        params: Optional[dict] = None,
        json_data: Optional[Any] = None,
        headers: Optional[dict] = None,
    ) -> ASGIResponse:
        if "?" in path:
            path, raw_qs = path.split("?", 1)
            parsed_params = dict([pair.split("=", 1) if "=" in pair else (pair, "") for pair in raw_qs.split("&") if pair])
            merged_params = {**parsed_params, **(params or {})}
            query_string = urlencode(merged_params).encode("utf-8")
        else:
            query_string = urlencode(params or {}).encode("utf-8")
        raw_headers = [(b"host", b"testserver")]

        body_bytes = b""
        if json_data is not None:
            body_bytes = json.dumps(json_data).encode("utf-8")
            raw_headers.append((b"content-type", b"application/json"))

        if headers:
            for k, v in headers.items():
                raw_headers.append((k.lower().encode("utf-8"), str(v).encode("utf-8")))

        scope = {
            "type": "http",
            "http_version": "1.1",
            "method": method.upper(),
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": query_string,
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

    def get(self, path: str, params=None, headers=None) -> ASGIResponse:
        return asyncio.run(self.request("GET", path, params=params, headers=headers))

    def post(self, path: str, json=None, params=None, headers=None) -> ASGIResponse:
        return asyncio.run(self.request("POST", path, params=params, json_data=json, headers=headers))


class TestAPIIntegration(unittest.TestCase):
    """Full end-to-end integration test suite across all FloodLens endpoints."""

    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = ASGIClient(app)

    def test_01_health_and_meta(self):
        """GET /health should return 200, service status, and queue diagnostics."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "FloodLens API")
        self.assertIn("queue", data)
        self.assertIn("worker_status", data["queue"])

    def test_02_openapi_spec(self):
        """GET /openapi.json should contain all tags and endpoints."""
        res = self.client.get("/openapi.json")
        self.assertEqual(res.status_code, 200)
        schema = res.json()
        tags = [t["name"] for t in schema.get("tags", [])]
        self.assertIn("Flood Detection", tags)
        self.assertIn("Settlements", tags)
        self.assertIn("Live Dashboard", tags)
        self.assertIn("Reports", tags)
        self.assertIn("Accuracy Gate", tags)

    def test_03_auth_login_and_me(self):
        """POST /api/auth/login and GET /api/auth/me flow."""
        login_res = self.client.post("/api/auth/login", json={"username": "admin", "password": "floodlens2026"})
        self.assertEqual(login_res.status_code, 200)
        token_data = login_res.json()
        self.assertIn("access_token", token_data)
        token = token_data["access_token"]

        # Auth me with token
        me_res = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_res.status_code, 200)
        user_data = me_res.json()
        self.assertEqual(user_data["username"], "admin")

    def test_04_settlements_affected_and_detail(self):
        """GET /api/settlements/affected and GET /api/settlements/{id}."""
        res = self.client.get("/api/settlements/affected")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(data["total"], 0)
        self.assertIsInstance(data["settlements"], list)

        first_id = data["settlements"][0]["id"]
        detail_res = self.client.get(f"/api/settlements/{first_id}")
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.json()["id"], first_id)

        # 404 for nonexistent settlement
        not_found = self.client.get("/api/settlements/999999")
        self.assertEqual(not_found.status_code, 404)

    def test_05_settlement_impact_csv_generation(self):
        """Settlement Impact CSV generator logic and flag classifications."""
        self.assertEqual(determine_impact_flag(85.0), "🔴 Severely Affected")
        self.assertEqual(determine_impact_flag(45.0), "🟡 Partially Affected")
        self.assertEqual(determine_impact_flag(12.0), "🟢 Safe")

        csv_str = generate_settlement_impact_csv_string()
        self.assertIn("Settlement Name,District,State,Population,Flooded %,Impact Flag", csv_str)
        self.assertIn("Hayaghat", csv_str)
        self.assertIn("🔴 Severely Affected", csv_str)

    def test_06_reports_endpoints_and_csv_download(self):
        """GET /api/reports and CSV download endpoints."""
        list_res = self.client.get("/api/reports")
        self.assertEqual(list_res.status_code, 200)
        reports = list_res.json()["reports"]
        self.assertGreater(len(reports), 0)

        # Direct CSV report endpoint
        csv_res = self.client.get("/api/reports/settlement-impact/csv")
        self.assertEqual(csv_res.status_code, 200)
        self.assertIn("text/csv", csv_res.headers.get("content-type", ""))
        self.assertIn("Settlement Name", csv_res.text)

        # Settlements alias CSV export
        alias_res = self.client.get("/api/settlements/export/csv")
        self.assertEqual(alias_res.status_code, 200)
        self.assertIn("Settlement Name", alias_res.text)

        # Download RPT-0037 by ID
        rpt_res = self.client.get("/api/reports/RPT-0037/download")
        self.assertEqual(rpt_res.status_code, 200)
        self.assertIn("Settlement Name", rpt_res.text)

        # Download as JSON metadata
        json_res = self.client.get("/api/reports/RPT-0037/download?as_json=true")
        self.assertEqual(json_res.status_code, 200)
        self.assertEqual(json_res.json()["report_id"], "RPT-0037")

        # 404 for unknown report
        bad_res = self.client.get("/api/reports/NON-EXISTENT/download")
        self.assertEqual(bad_res.status_code, 404)

    def test_07_live_dashboard_endpoint(self):
        """GET /api/live returns full telemetry payload for frontend dashboard."""
        res = self.client.get("/api/live")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Check required telemetry keys
        self.assertIn("stats", data)
        self.assertIn("timeline", data)
        self.assertIn("districts", data)
        self.assertIn("recent_jobs", data)
        self.assertIn("settlement_summary", data)
        self.assertIn("timestamp", data)

        # Check stat card metrics
        titles = [s["title"] for s in data["stats"]]
        self.assertIn("Flood Extent", titles)
        self.assertIn("Affected Areas", titles)
        self.assertIn("At-Risk Pop.", titles)
        self.assertIn("NDWI Score", titles)
        self.assertIn("Alerts", titles)

        # Check district breakdown
        district_names = [d["name"] for d in data["districts"]]
        self.assertIn("Darbhanga", district_names)
        self.assertIn("Sitamarhi", district_names)

        # Check settlement summary numbers
        summary = data["settlement_summary"]
        self.assertGreater(summary["total"], 0)
        self.assertGreaterEqual(summary["severely_affected"], 0)

    def test_08_direct_detect_endpoint(self):
        """POST /api/detect executes multi-index ensemble and baseline subtraction."""
        payload = {
            "satellite": "Sentinel-2",
            "index": "NDWI",
            "threshold": 0.3,
            "cloud_pct": 15,
            "aoi_lat": 26.3,
            "aoi_lon": 85.8,
            "aoi_radius_km": 100,
            "pre_date": "2026-10-11",
            "post_date": "2026-10-19",
        }
        res = self.client.post("/api/detect", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "completed")
        self.assertGreater(data["flood_extent_km2"], 0)
        self.assertEqual(data["geojson"]["type"], "FeatureCollection")
        self.assertIn("NDWI", data["otsu_thresholds"])

    def test_09_flood_queue_and_status(self):
        """POST /api/flood/detect, queue status, and job status polling."""
        # 1. Check queue diagnostics
        q_res = self.client.get("/api/flood/queue")
        self.assertEqual(q_res.status_code, 200)
        q_data = q_res.json()
        self.assertIn("queue_size", q_data)
        self.assertIn("worker_status", q_data)

        # 2. Synchronous detect
        sync_res = self.client.post("/api/flood/detect", json={"aoi_lat": 26.3, "aoi_lon": 85.8, "sync": True})
        self.assertEqual(sync_res.status_code, 200)
        sync_data = sync_res.json()
        job_id = sync_data["job_id"]

        # 3. Check status
        status_res = self.client.get(f"/api/flood/status/{job_id}")
        self.assertEqual(status_res.status_code, 200)
        status_data = status_res.json()
        self.assertEqual(status_data["status"], "completed")
        self.assertEqual(status_data["progress"], 100)

        # 4. Check results
        results_res = self.client.get(f"/api/flood/results/{job_id}")
        self.assertEqual(results_res.status_code, 200)
        self.assertEqual(results_res.json()["type"], "FeatureCollection")

        # 5. Check summary
        summary_res = self.client.get("/api/flood/summary")
        self.assertEqual(summary_res.status_code, 200)
        self.assertGreater(summary_res.json()["flood_extent_km2"], 0)

    def test_10_config_and_accuracy_endpoints(self):
        """Config and Accuracy gate endpoints."""
        cfg_res = self.client.get("/api/config")
        self.assertEqual(cfg_res.status_code, 200)

        aoi_res = self.client.post("/api/config/aoi", json={"lat": 26.1, "lon": 85.9, "radius_km": 120})
        self.assertEqual(aoi_res.status_code, 200)

        # Accuracy Gate summary and history
        acc_summary = self.client.get("/api/accuracy/summary")
        self.assertEqual(acc_summary.status_code, 200)
        self.assertIn("current_iou", acc_summary.json())

        acc_eval = self.client.post("/api/accuracy/evaluate", json={"target_iou": 0.75, "max_iterations": 2})
        self.assertEqual(acc_eval.status_code, 200)
        eval_data = acc_eval.json()
        self.assertIn("history", eval_data)
        self.assertGreaterEqual(eval_data["iterations_count"], 1)


    def test_11_websocket_manager_and_broadcast(self):
        """WebSocket manager registers connections and broadcasts messages."""
        from app.routers.ws import manager

        class DummyWebSocket:
            def __init__(self):
                self.messages = []
            async def accept(self):
                pass
            async def send_text(self, text):
                self.messages.append(text)

        async def run_ws():
            ws = DummyWebSocket()
            await manager.connect(ws)
            self.assertIn(ws, manager.active_connections)
            await manager.broadcast({"event": "test_broadcast", "data": 123})
            self.assertEqual(len(ws.messages), 1)
            self.assertIn("test_broadcast", ws.messages[0])
            manager.disconnect(ws)
            self.assertNotIn(ws, manager.active_connections)

        asyncio.run(run_ws())

    def test_12_job_queue_async_lifecycle(self):
        """AsyncJobQueue starts, enqueues jobs, runs worker, and drains queue."""
        q = AsyncJobQueue(concurrency=1)
        async def run_q():
            await q.start()
            self.assertTrue(q.is_running)
            status = q.get_status()
            self.assertEqual(status["worker_status"], "running")
            await q.stop()
            self.assertFalse(q.is_running)

        asyncio.run(run_q())


    def test_13_frontend_payload_compatibility(self):
        """Frontend submitAnalysis payload format with region and satellite_source."""
        payload = {
            "region": "nepal-terai",
            "district": None,
            "pre_flood_start": "2026-10-11T00:00:00.000Z",
            "pre_flood_end": "2026-10-12T00:00:00.000Z",
            "post_flood_start": "2026-10-18T00:00:00.000Z",
            "post_flood_end": "2026-10-19T00:00:00.000Z",
            "satellite_source": "sentinel-2",
            "indices": ["NDWI", "MNDWI"],
            "threshold": 0.3,
            "use_hand": True,
            "slope_threshold": 10,
            "speckle_filter": True,
            "accuracy_threshold": 0.75,
            "sync": True,
        }
        res = self.client.post("/api/flood/detect", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("job_id", data)
        self.assertEqual(data["status"], "completed")

        # Test results format for SuccessState
        res_job = self.client.get(f"/api/flood/results/{data['job_id']}")
        self.assertEqual(res_job.status_code, 200)
        job_result = res_job.json()
        self.assertIn("floodedAreaKm2", job_result)
        self.assertIn("affectedSettlements", job_result)
        self.assertIn("percentageImpact", job_result)
        self.assertIn("geojson", job_result)


if __name__ == "__main__":
    unittest.main()
