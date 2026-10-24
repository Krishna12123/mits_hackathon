"""
FloodLens API Load Testing Suite
Simulates concurrent requests across API endpoints and benchmarks throughput, latency, and error rates.
NAKSHATRA 2026 Aerospace Hackathon · Team Code Matrix
"""
import sys
import time
import json
import math
import asyncio
import argparse
from typing import List, Dict, Any, Tuple
from urllib.parse import urlencode

from main import app


class ASGIClient:
    """High-throughput in-memory ASGI client for load testing without network overhead."""

    def __init__(self, asgi_app):
        self.app = asgi_app

    async def request(
        self,
        method: str,
        path: str,
        params: dict = None,
        json_data: Any = None,
        headers: dict = None,
    ) -> Tuple[int, float, int]:
        """
        Sends an ASGI request.
        Returns: (status_code, duration_ms, response_body_bytes)
        """
        if "?" in path:
            path, raw_qs = path.split("?", 1)
            parsed_params = dict([pair.split("=", 1) if "=" in pair else (pair, "") for pair in raw_qs.split("&") if pair])
            merged_params = {**parsed_params, **(params or {})}
            query_string = urlencode(merged_params).encode("utf-8")
        else:
            query_string = urlencode(params or {}).encode("utf-8")

        raw_headers = [(b"host", b"loadtest")]
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
        response_body_len = 0
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
            nonlocal response_status, response_body_len
            if message["type"] == "http.response.start":
                response_status = message["status"]
            elif message["type"] == "http.response.body":
                response_body_len += len(message.get("body", b""))
                if not message.get("more_body", False):
                    disconnect_event.set()

        t_start = time.perf_counter()
        try:
            await self.app(scope, receive, send)
        finally:
            disconnect_event.set()
        duration_ms = (time.perf_counter() - t_start) * 1000.0

        return response_status, duration_ms, response_body_len


# Benchmark Endpoint Profiles
SCENARIOS = {
    "mixed": [
        ("GET", "/health", None),
        ("GET", "/api/config", None),
        ("GET", "/api/flood/summary", None),
        ("GET", "/api/live/dashboard", None),
        ("GET", "/api/settlements/affected", None),
        ("GET", "/api/reports", None),
        ("GET", "/api/accuracy/JOB-DEMO-2026", None),
        ("GET", "/api/flood/results/JOB-DEMO-2026", None),
        ("GET", "/api/refine/status", None),
        ("POST", "/api/refine", {
            "water_mask": [[1, 1], [0, 1]],
            "slope_grid": [[1.0, 8.0], [2.0, 1.0]],
            "max_slope_deg": 5.0,
            "enable_slope_filter": True,
            "enable_hand_filter": False,
            "enable_gap_fill": False,
        }),
    ],
    "telemetry": [
        ("GET", "/health", None),
        ("GET", "/api/live/dashboard", None),
        ("GET", "/api/flood/summary", None),
    ],
    "settlements": [
        ("GET", "/api/settlements/affected", None),
        ("GET", "/api/settlements/1", None),
        ("GET", "/api/reports", None),
    ],
    "accuracy": [
        ("GET", "/api/accuracy/JOB-DEMO-2026", None),
        ("GET", "/api/accuracy", None),
    ],
}


def calculate_percentiles(latencies: List[float]) -> Dict[str, float]:
    """Computes standard latency percentiles."""
    if not latencies:
        return {}
    sorted_lat = sorted(latencies)
    n = len(sorted_lat)

    def p(pct: float) -> float:
        idx = int(math.ceil(pct / 100.0 * n)) - 1
        return sorted_lat[max(0, min(idx, n - 1))]

    return {
        "min": round(sorted_lat[0], 2),
        "mean": round(sum(sorted_lat) / n, 2),
        "median": round(p(50), 2),
        "p90": round(p(90), 2),
        "p95": round(p(95), 2),
        "p99": round(p(99), 2),
        "max": round(sorted_lat[-1], 2),
    }


async def run_load_test(
    concurrency: int = 25,
    total_requests: int = 500,
    scenario: str = "mixed",
) -> Dict[str, Any]:
    """
    Executes a concurrent load test using an asyncio worker pool.
    """
    import logging
    prev_level = logging.getLogger("floodlens").level
    logging.getLogger("floodlens").setLevel(logging.WARNING)

    client = ASGIClient(app)
    endpoint_pool = SCENARIOS.get(scenario, SCENARIOS["mixed"])

    queue: asyncio.Queue = asyncio.Queue()
    for i in range(total_requests):
        method, path, body = endpoint_pool[i % len(endpoint_pool)]
        queue.put_nowait((i, method, path, body))

    results: List[Dict[str, Any]] = []
    status_counts: Dict[int, int] = {}
    endpoint_stats: Dict[str, List[float]] = {}

    async def worker(worker_id: int):
        while not queue.empty():
            try:
                req_id, method, path, body = queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            status_code, dur_ms, bytes_len = await client.request(
                method=method,
                path=path,
                json_data=body,
                headers={"X-Request-ID": f"LOAD-{worker_id}-{req_id}"},
            )

            results.append({
                "req_id": req_id,
                "endpoint": f"{method} {path}",
                "status": status_code,
                "duration_ms": dur_ms,
                "bytes": bytes_len,
            })
            status_counts[status_code] = status_counts.get(status_code, 0) + 1

            if path not in endpoint_stats:
                endpoint_stats[path] = []
            endpoint_stats[path].append(dur_ms)

            queue.task_done()

    # Launch concurrent worker pool
    wall_start = time.perf_counter()
    workers = [asyncio.create_task(worker(i)) for i in range(concurrency)]
    await asyncio.gather(*workers)
    wall_duration = time.perf_counter() - wall_start

    # Compute metrics
    all_latencies = [r["duration_ms"] for r in results]
    percentiles = calculate_percentiles(all_latencies)
    rps = round(len(results) / wall_duration, 2) if wall_duration > 0 else 0.0
    successful_requests = status_counts.get(200, 0) + status_counts.get(202, 0)
    success_rate = round((successful_requests / len(results)) * 100.0, 2) if results else 0.0

    endpoint_summary = {}
    for ep, lats in endpoint_stats.items():
        ep_pct = calculate_percentiles(lats)
        endpoint_summary[ep] = {
            "count": len(lats),
            "mean_ms": ep_pct.get("mean"),
            "p95_ms": ep_pct.get("p95"),
        }

    return {
        "scenario": scenario,
        "concurrency": concurrency,
        "total_requests": len(results),
        "duration_seconds": round(wall_duration, 3),
        "throughput_rps": rps,
        "success_rate_pct": success_rate,
        "status_distribution": status_counts,
        "latency_percentiles_ms": percentiles,
        "endpoints": endpoint_summary,
    }


def print_load_test_report(metrics: Dict[str, Any]):
    """Pretty-prints load test metrics to stdout."""
    print("\n" + "=" * 68)
    print("🛰️  FLOODLENS API CONCURRENCY & LOAD TEST REPORT")
    print("=" * 68)
    print(f"Scenario:             {metrics['scenario'].upper()}")
    print(f"Concurrency Level:    {metrics['concurrency']} concurrent simulated clients")
    print(f"Total Requests:       {metrics['total_requests']}")
    print(f"Test Duration:        {metrics['duration_seconds']}s")
    print(f"Throughput:           {metrics['throughput_rps']:,} requests/sec")
    print(f"Success Rate:         {metrics['success_rate_pct']}% (2xx OK)")
    print("-" * 68)
    print("HTTP STATUS CODES:")
    for code, count in sorted(metrics["status_distribution"].items()):
        print(f"  {code}: {count} ({count / metrics['total_requests'] * 100:.1f}%)")
    print("-" * 68)
    print("LATENCY DISTRIBUTION (ms):")
    lat = metrics["latency_percentiles_ms"]
    print(f"  Min:      {lat.get('min'):>7.2f} ms")
    print(f"  Mean:     {lat.get('mean'):>7.2f} ms")
    print(f"  Median:   {lat.get('median'):>7.2f} ms")
    print(f"  p90:      {lat.get('p90'):>7.2f} ms")
    print(f"  p95:      {lat.get('p95'):>7.2f} ms")
    print(f"  p99:      {lat.get('p99'):>7.2f} ms")
    print(f"  Max:      {lat.get('max'):>7.2f} ms")
    print("-" * 68)
    print(f"{'ENDPOINT':<40} {'REQS':<8} {'MEAN (ms)':<10} {'p95 (ms)':<10}")
    for ep, ep_data in sorted(metrics["endpoints"].items()):
        print(f"  {ep:<38} {ep_data['count']:<8} {ep_data['mean_ms']:<10.2f} {ep_data['p95_ms']:<10.2f}")
    print("=" * 68 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FloodLens Load Tester")
    parser.add_argument("-c", "--concurrency", type=int, default=25, help="Number of concurrent workers (default: 25)")
    parser.add_argument("-n", "--requests", type=int, default=300, help="Total number of requests (default: 300)")
    parser.add_argument("-s", "--scenario", type=str, default="mixed", choices=list(SCENARIOS.keys()), help="Scenario")
    parser.add_argument("--json", action="store_true", help="Output pure JSON")

    args = parser.parse_args()

    results = asyncio.run(run_load_test(concurrency=args.concurrency, total_requests=args.requests, scenario=args.scenario))

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print_load_test_report(results)
