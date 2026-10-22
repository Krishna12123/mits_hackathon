"""
Unit Tests for FloodLens Day 2 Detection Pipeline
Tests:
1. WaterIndexEngine & Otsu Thresholding
2. Majority Vote Ensemble (4 indices)
3. Change Detection (Post-flood minus JRC permanent baseline)
4. GeoTIFF Export (Geospatial tags & TIFF headers)
5. End-to-End Detection Pipeline
6. API Endpoints (/api/detect & /api/flood/detect)
"""

import os
import shutil
import tempfile
import asyncio
import unittest
from PIL import Image
from pydantic import ValidationError

from app.services.detection_service import (
    WaterIndexEngine,
    MajorityVoteEnsemble,
    ChangeDetector,
    GeoTIFFExporter,
    DetectionPipeline,
    detection_pipeline,
)
from app.models.schemas import DetectRequest, DetectResultResponse, JobResponse
from app.database import SessionLocal, init_db
from app.models.job import Job
from app.models.report import Report
from main import detect_direct
from app.routers.flood import detect


class TestWaterIndexEngine(unittest.TestCase):
    """Unit tests for WaterIndexEngine and Otsu automated thresholding."""

    def test_otsu_bimodal_distribution(self):
        """Otsu threshold should accurately separate two distinct clusters (land vs water)."""
        # Simulated distribution: land ~ -0.4, water ~ +0.5
        land_vals = [-0.5, -0.45, -0.4, -0.35, -0.3] * 20
        water_vals = [0.4, 0.45, 0.5, 0.55, 0.6] * 20
        all_vals = land_vals + water_vals

        threshold = WaterIndexEngine.compute_otsu_threshold(all_vals, num_bins=64)
        # Optimal threshold must fall strictly between the two clusters
        self.assertGreater(threshold, -0.2)
        self.assertLess(threshold, 0.3)

    def test_otsu_edge_cases(self):
        """Otsu should handle single values and identical bounds gracefully."""
        self.assertEqual(WaterIndexEngine.compute_otsu_threshold([]), 0.0)
        self.assertEqual(WaterIndexEngine.compute_otsu_threshold([0.5, 0.5, 0.5]), 0.5)

    def test_threshold_grid_optical(self):
        """Optical indices (NDWI, MNDWI, AWEI) classify water when value > threshold."""
        grid = [
            [-0.2, 0.4],
            [0.1, -0.5],
        ]
        mask = WaterIndexEngine.threshold_grid(grid, threshold=0.0, condition="gt")
        self.assertEqual(mask, [[0, 1], [1, 0]])

    def test_threshold_grid_sar(self):
        """SAR VV dB classifies water when backscatter < threshold (specular reflection)."""
        grid = [
            [-22.0, -12.0],
            [-10.5, -18.5],
        ]
        # Water threshold typically around -16 dB
        mask = WaterIndexEngine.threshold_grid(grid, threshold=-16.0, condition="lt")
        self.assertEqual(mask, [[1, 0], [0, 1]])


class TestMajorityVoteEnsemble(unittest.TestCase):
    """Unit tests for combining 4 water indices via majority voting."""

    def setUp(self):
        # 4 indices across a 2x2 grid
        # Pixel (0,0): Unanimous water (4 votes)
        # Pixel (0,1): Majority water (3 votes: NDWI, MNDWI, SAR)
        # Pixel (1,0): Tie / Half water (2 votes: MNDWI, AWEI)
        # Pixel (1,1): Dry land (0 votes)
        self.masks = {
            "NDWI":  [[1, 1], [0, 0]],
            "MNDWI": [[1, 1], [1, 0]],
            "AWEI":  [[1, 0], [1, 0]],
            "SAR":   [[1, 1], [0, 0]],
        }

    def test_majority_vote_min_2(self):
        """Default ensemble (>= 2 votes) should classify pixels with >= 2 votes as water."""
        ensemble, confidence, stats = MajorityVoteEnsemble.combine(self.masks, min_votes=2)

        # Expected ensemble mask:
        # (0,0): 4 votes -> 1
        # (0,1): 3 votes -> 1
        # (1,0): 2 votes -> 1
        # (1,1): 0 votes -> 0
        self.assertEqual(ensemble, [[1, 1], [1, 0]])
        self.assertEqual(confidence[0][0], 1.0)
        self.assertEqual(confidence[0][1], 0.75)
        self.assertEqual(confidence[1][0], 0.5)
        self.assertEqual(confidence[1][1], 0.0)

        self.assertEqual(stats["total_pixels"], 4)
        self.assertEqual(stats["water_pixels"], 3)
        self.assertEqual(stats["consensus_pixels_unanimous"], 1)

    def test_strict_consensus_min_3(self):
        """Strict ensemble (>= 3 votes) should exclude 2-vote tie."""
        ensemble, confidence, stats = MajorityVoteEnsemble.combine(self.masks, min_votes=3)
        self.assertEqual(ensemble, [[1, 1], [0, 0]])
        self.assertEqual(stats["water_pixels"], 2)

    def test_unanimous_only_min_4(self):
        """Consensus requiring all 4 indices."""
        ensemble, confidence, stats = MajorityVoteEnsemble.combine(self.masks, min_votes=4)
        self.assertEqual(ensemble, [[1, 0], [0, 0]])
        self.assertEqual(stats["water_pixels"], 1)

    def test_empty_indices_raises_error(self):
        """Providing empty or invalid index dictionary should raise ValueError."""
        with self.assertRaises(ValueError):
            MajorityVoteEnsemble.combine({}, min_votes=2)


class TestChangeDetection(unittest.TestCase):
    """Unit tests for change detection: Post-flood minus JRC Permanent Water baseline."""

    def test_permanent_water_subtraction(self):
        """
        Verify that permanent water bodies (rivers/lakes) are subtracted
        from the post-flood water mask to isolate newly inundated flood areas.
        """
        # 3x3 scenario:
        # Row 0: Permanent river channel, inundated before and after
        # Row 1: Lowland floodplain, dry normally, now submerged in flood
        # Row 2: Upland dry land, dry normally, dry now
        post_flood = [
            [1, 1, 1],
            [1, 1, 0],
            [0, 0, 0],
        ]
        permanent_jrc = [
            [1, 1, 1],
            [0, 0, 0],
            [0, 0, 0],
        ]

        flood_mask, stats = ChangeDetector.subtract_permanent_water(post_flood, permanent_jrc)

        # Expected flood mask:
        # Row 0: 1 - 1 = 0 (permanent water excluded)
        # Row 1: 1 - 0 = 1 (new flood extent!)
        # Row 2: 0 - 0 = 0 (dry land)
        expected_flood = [
            [0, 0, 0],
            [1, 1, 0],
            [0, 0, 0],
        ]
        self.assertEqual(flood_mask, expected_flood)
        self.assertEqual(stats["total_pixels"], 9)
        self.assertEqual(stats["post_flood_water_pixels"], 5)
        self.assertEqual(stats["permanent_water_pixels"], 3)
        self.assertEqual(stats["new_flood_pixels"], 2)
        self.assertEqual(stats["permanent_water_subtracted_pixels"], 3)
        self.assertEqual(stats["receded_water_pixels"], 0)

    def test_receded_water_detection(self):
        """If a permanent water pixel is dry in post-flood, it should count as receded."""
        post_flood = [[0]]
        permanent_jrc = [[1]]
        flood_mask, stats = ChangeDetector.subtract_permanent_water(post_flood, permanent_jrc)
        self.assertEqual(flood_mask, [[0]])
        self.assertEqual(stats["receded_water_pixels"], 1)
        self.assertEqual(stats["new_flood_pixels"], 0)


class TestGeoTIFFExporter(unittest.TestCase):
    """Unit tests for GeoTIFF raster saving and metadata tags."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_save_geotiff_raster(self):
        """Ensure GeoTIFF file is generated with valid TIFF headers and geospatial tags."""
        grid = [
            [0, 1, 1, 0],
            [1, 1, 0, 0],
            [0, 0, 0, 1],
        ]
        bounds = (85.0, 25.0, 86.0, 26.0)
        out_path = os.path.join(self.temp_dir, "test_output.tif")

        saved_path = GeoTIFFExporter.save_raster(grid, bounds, out_path, dtype="uint8")
        self.assertTrue(os.path.exists(saved_path))
        self.assertGreater(os.path.getsize(saved_path), 0)

        # Inspect generated TIFF using Pillow
        with Image.open(saved_path) as img:
            self.assertEqual(img.format, "TIFF")
            self.assertEqual(img.size, (4, 3))
            # Verify GeoTIFF tags exist
            self.assertIn(GeoTIFFExporter.TIFF_TAG_MODEL_PIXEL_SCALE, img.tag_v2)
            self.assertIn(GeoTIFFExporter.TIFF_TAG_MODEL_TIEPOINT, img.tag_v2)
            self.assertIn(GeoTIFFExporter.TIFF_TAG_GEO_KEY_DIRECTORY, img.tag_v2)


class TestDetectionPipeline(unittest.TestCase):
    """Unit tests for full DetectionPipeline execution."""

    def test_full_pipeline_run(self):
        """Run the end-to-end pipeline and verify outputs, stats, and GeoTIFFs."""
        temp_dir = tempfile.mkdtemp()
        try:
            pipeline = DetectionPipeline(base_output_dir=temp_dir)
            result = pipeline.run_detection(
                job_id="UNIT-TEST-JOB",
                lat=26.3,
                lon=85.8,
                radius_km=50.0,
                min_votes=2,
                save_geotiffs=True,
            )

            self.assertEqual(result["job_id"], "UNIT-TEST-JOB")
            self.assertEqual(result["status"], "completed")
            self.assertGreater(result["flood_extent_km2"], 0)
            self.assertGreater(result["permanent_water_km2"], 0)
            self.assertGreater(result["total_water_km2"], 0)

            # Check GeoTIFF outputs
            geotiffs = result["geotiff_outputs"]
            expected_keys = {"ndwi", "mndwi", "awei", "sar", "ensemble", "jrc_baseline", "final_flood"}
            self.assertEqual(set(geotiffs.keys()), expected_keys)
            for path in geotiffs.values():
                self.assertTrue(os.path.exists(path))

            # Check GeoJSON
            geojson = result["geojson"]
            self.assertEqual(geojson["type"], "FeatureCollection")
            self.assertGreater(len(geojson["features"]), 0)
            for f in geojson["features"]:
                self.assertEqual(f["type"], "Feature")
                self.assertEqual(f["geometry"]["type"], "Polygon")
                self.assertIn(f["properties"]["severity"], ["severe", "high", "medium"])
                self.assertGreater(f["properties"]["area_sqkm"], 0)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


class TestDetectAPIEndpoints(unittest.TestCase):
    """Unit tests for /api/detect and /api/flood/detect endpoints."""

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_direct_detect_endpoint(self):
        """Test POST /api/detect returns synchronous flood mask GeoJSON."""
        db = SessionLocal()
        try:
            req = DetectRequest(
                satellite="Sentinel-2",
                index="ALL",
                threshold=0.3,
                cloud_pct=20,
                aoi_lat=26.3,
                aoi_lon=85.8,
                aoi_radius_km=100,
                pre_date="2026-10-11",
                post_date="2026-10-19",
                min_votes=2,
                save_geotiff=True,
            )
            response = asyncio.run(detect_direct(req, db))
            self.assertIsInstance(response, DetectResultResponse)
            self.assertEqual(response.status, "completed")
            self.assertGreater(response.flood_extent_km2, 0)
            self.assertEqual(response.geojson["type"], "FeatureCollection")
            self.assertGreater(len(response.geojson["features"]), 0)

            # Verify Job was recorded in DB
            saved_job = db.query(Job).filter(Job.id == response.job_id).first()
            self.assertIsNotNone(saved_job)
            self.assertEqual(saved_job.status, "completed")
        finally:
            db.close()

    def test_flood_detect_sync_mode(self):
        """Test POST /api/flood/detect with sync=True returns immediate result."""
        db = SessionLocal()
        try:
            from fastapi import BackgroundTasks
            bt = BackgroundTasks()
            req = DetectRequest(
                aoi_lat=26.1,
                aoi_lon=85.4,
                aoi_radius_km=80,
                pre_date="2026-10-10",
                post_date="2026-10-18",
                sync=True,
            )
            response = asyncio.run(detect(req, bt, db))
            self.assertIsInstance(response, DetectResultResponse)
            self.assertEqual(response.status, "completed")
            self.assertGreater(response.flood_extent_km2, 0)
        finally:
            db.close()

    def test_flood_detect_async_queue_mode(self):
        """Test POST /api/flood/detect with sync=False queues background job."""
        db = SessionLocal()
        try:
            from fastapi import BackgroundTasks
            bt = BackgroundTasks()
            req = DetectRequest(
                aoi_lat=26.2,
                aoi_lon=85.6,
                aoi_radius_km=100,
                pre_date="2026-10-10",
                post_date="2026-10-18",
                sync=False,
            )
            response = asyncio.run(detect(req, bt, db))
            self.assertIsInstance(response, JobResponse)
            self.assertEqual(response.status, "queued")
            self.assertTrue(response.job_id.startswith("JOB-"))
        finally:
            db.close()

    def test_invalid_aoi_validation_error(self):
        """Test that invalid latitude (> 90) or radius (< 1) raises validation error."""
        with self.assertRaises(ValidationError):
            DetectRequest(aoi_lat=95.0, aoi_lon=85.0)

        with self.assertRaises(ValidationError):
            DetectRequest(aoi_radius_km=0)


if __name__ == "__main__":
    unittest.main()
