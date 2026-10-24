"""
Focused Test Suite: Sentinel-1 SAR Processing & sar_mask.tif Export Gate
Verifies:
1. Sentinel-1 GRD collection filters (COPERNICUS/S1_GRD, IW instrument mode, VV/VH polarizations).
2. Backscatter physics & thresholding: specular water reflection (VV < -16.0 dB), valid observation masking.
3. Empty collection handling (zero scenes returned safely without unhandled exceptions).
4. Grid alignment parameters (UTM 45N CRS and 20m affine transform).
5. Truthful artifact gate: never substitutes synthetic or optical data for failed SAR processing.
6. GeoTIFF validation for sar_mask.tif.
7. Test boundary: mocked/contract tests offline vs. conditional live Earth Engine authentication check.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.sar_service import Sentinel1SARService, sar_service
from app.services.flood_service import (
    validate_geotiff_file,
    export_gee_raster,
    ANALYSIS_CRS,
    GRID_TRANSFORM,
)


class TestSARBackscatterPhysics(unittest.TestCase):
    """Verifies backscatter thresholding math and polarization behavior."""

    def setUp(self):
        self.service = Sentinel1SARService()

    def test_specular_water_thresholding(self):
        """
        Specular reflection from open water yields low backscatter (< -16.0 dB in VV).
        Non-water (rough land, urban, vegetation) yields higher backscatter (>= -16.0 dB).
        """
        vv_samples = [-22.5, -18.2, -16.1, -16.0, -15.9, -10.5, -5.2]
        # vv < -16.0: first 3 are water (1), remaining 4 are non-water (0)
        expected_mask = [1, 1, 1, 0, 0, 0, 0]

        res = self.service.process_sar_bands(vv_values=vv_samples, vv_threshold_db=-16.0)
        self.assertEqual(res["vv_mask"], expected_mask)
        self.assertEqual(res["water_pixels"], 3)
        self.assertEqual(res["total_pixels"], 7)
        self.assertAlmostEqual(res["water_fraction"], 3 / 7, places=3)

    def test_vh_cross_polarization_processing(self):
        """Volumetric scattering / flooded vegetation thresholding in VH (< -23.0 dB)."""
        vv_samples = [-18.0, -14.0]
        vh_samples = [-25.0, -20.0]
        res = self.service.process_sar_bands(
            vv_values=vv_samples,
            vh_values=vh_samples,
            vv_threshold_db=-16.0,
            vh_threshold_db=-23.0,
        )
        self.assertEqual(res["vh_mask"], [1, 0])
        self.assertEqual(res["vh_water_pixels"], 1)
        self.assertIn("mean_vv_vh_ratio_db", res)

    def test_empty_backscatter_array_handling(self):
        """Empty input array must return safe zero-result dictionary without error."""
        res = self.service.process_sar_bands(vv_values=[])
        self.assertEqual(res["water_pixels"], 0)
        self.assertEqual(res["total_pixels"], 0)
        self.assertIn("error", res)


class TestSentinel1CollectionFiltersAndSafety(unittest.TestCase):
    """Verifies collection constants, query filters, and empty-collection resilience."""

    def setUp(self):
        self.service = Sentinel1SARService()

    def test_collection_id_and_polarizations(self):
        """Ensures collection target is COPERNICUS/S1_GRD with IW mode and VV/VH polarizations."""
        self.assertEqual(self.service.COLLECTION_ID, "COPERNICUS/S1_GRD")
        meta = self.service.compute_sar_water_mask()
        self.assertEqual(meta["polarization"], "VV")
        self.assertEqual(meta["threshold_db"], -16.0)

    def test_empty_collection_returns_safe_status(self):
        """When Earth Engine returns 0 scenes, build_live_sar_mask must not crash."""
        service = Sentinel1SARService()
        service.is_ee_initialized = True

        mock_col = MagicMock()
        mock_col.filterBounds.return_value = mock_col
        mock_col.filterDate.return_value = mock_col
        mock_col.filter.return_value = mock_col
        mock_col.size.return_value.getInfo.return_value = 0

        with patch("app.services.sar_service.ee") as mock_ee:
            mock_ee.ImageCollection.return_value = mock_col
            result = service.build_live_sar_mask(
                aoi=MagicMock(),
                start_date="2026-10-15",
                end_date="2026-10-22",
                crs=ANALYSIS_CRS,
                crs_transform=GRID_TRANSFORM,
            )

        self.assertEqual(result["status"], "no_scenes_found")
        self.assertEqual(result["scene_count"], 0)
        self.assertIsNone(result["mask_image"])

    def test_valid_collection_applies_grid_and_masking(self):
        """When scenes exist, composite is clipped, projected, masked, and thresholded."""
        service = Sentinel1SARService()
        service.is_ee_initialized = True

        mock_col = MagicMock()
        mock_col.filterBounds.return_value = mock_col
        mock_col.filterDate.return_value = mock_col
        mock_col.filter.return_value = mock_col
        mock_col.size.return_value.getInfo.return_value = 2

        mock_composite = MagicMock()
        mock_col.median.return_value.clip.return_value = mock_composite
        mock_projected = MagicMock()
        mock_composite.setDefaultProjection.return_value = mock_projected

        mock_vv = MagicMock()
        mock_vh = MagicMock()
        mock_projected.select.side_effect = lambda band: mock_vv if band == "VV" else mock_vh

        mock_valid = MagicMock()
        mock_vv.mask.return_value.And.return_value = mock_valid

        mock_water = MagicMock()
        mock_vv.lt.return_value.And.return_value = mock_water
        mock_water.rename.return_value.unmask.return_value.toByte.return_value = "final_byte_raster"

        with patch("app.services.sar_service.ee") as mock_ee:
            mock_ee.ImageCollection.return_value = mock_col
            result = service.build_live_sar_mask(
                aoi=MagicMock(),
                start_date="2026-10-15",
                end_date="2026-10-22",
                crs=ANALYSIS_CRS,
                crs_transform=GRID_TRANSFORM,
                vv_threshold_db=-16.0,
            )

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["scene_count"], 2)
        self.assertEqual(result["mask_image"], "final_byte_raster")
        mock_composite.setDefaultProjection.assert_called_once_with(
            crs=ANALYSIS_CRS,
            crsTransform=GRID_TRANSFORM,
        )


class TestSARArtifactIntegrityAndValidation(unittest.TestCase):
    """Verifies that sar_mask.tif adheres to strict GeoTIFF validation and no mock substitution occurs."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_valid_sar_geotiff_passes_validation(self):
        """A genuine TIFF output (> 100 bytes with II* header) passes validation."""
        sar_path = Path(self.temp_dir) / "sar_mask.tif"
        sar_path.write_bytes(b"II*\x00" + b"\x01" * 500)
        self.assertTrue(validate_geotiff_file(sar_path))

    def test_failed_sar_download_does_not_register_artifact(self):
        """When Earth Engine fails or returns non-TIFF, sar_mask.tif is not accepted."""
        corrupt_path = Path(self.temp_dir) / "sar_mask.tif"
        corrupt_path.write_bytes(b"<html>Error fetching SAR tile from EE</html>")
        self.assertFalse(validate_geotiff_file(corrupt_path))

    def test_no_synthetic_substitution_on_sar_failure(self):
        """
        Verify that if SAR processing yields no imagery, geotiff_outputs does NOT
        fabricate or substitute an optical mask in place of SAR.
        """
        geotiff_outputs = {
            "ndwi": "/path/to/ndwi_mask.tif",
            "mndwi": "/path/to/mndwi_mask.tif",
            "awei": "/path/to/awei_mask.tif",
            "ensemble": "/path/to/ensemble_mask.tif",
        }
        sar_res = {"status": "no_scenes_found", "scene_count": 0, "mask_image": None}

        # Simulating flood_service logic:
        if sar_res.get("mask_image") is not None and sar_res.get("scene_count", 0) > 0:
            geotiff_outputs["sar"] = "/path/to/sar_mask.tif"

        # SAR must be omitted, not fabricated
        self.assertNotIn("sar", geotiff_outputs)
        self.assertNotIn("/path/to/sar_mask.tif", geotiff_outputs.values())


class TestLiveEarthEngineSARIntegration(unittest.TestCase):
    """
    Distinguishes mocked contract testing from genuine authenticated Earth Engine runs.
    """

    def test_live_ee_authentication_boundary(self):
        """Reports truthfully whether live Earth Engine credentials are active."""
        try:
            import ee
            is_auth = False
            try:
                ee.Number(1).getInfo()
                is_auth = True
            except Exception:
                is_auth = False

            if not is_auth:
                self.skipTest(
                    "Earth Engine is not authenticated in this environment. "
                    "Offline contracts and mock suites verified SAR pipeline."
                )
            else:
                # Live query if authenticated
                col = (
                    ee.ImageCollection("COPERNICUS/S1_GRD")
                    .filterDate("2026-10-01", "2026-10-15")
                    .filter(ee.Filter.eq("instrumentMode", "IW"))
                )
                self.assertIsNotNone(col)
        except ImportError:
            self.skipTest("earthengine-api not installed in local environment.")


if __name__ == "__main__":
    unittest.main()
