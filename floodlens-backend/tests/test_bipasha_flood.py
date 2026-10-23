import unittest
from datetime import date
from pydantic import ValidationError
from app.models.flood import FloodAnalysisRequest, FloodStatusResponse
from app.services.flood_service import (
    get_flood_status,
    compute_otsu_threshold,
    compute_scene_otsu_thresholds,
)
from app.services.sar_service import sar_service


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

    def test_awei_calculation_logic(self):
        """
        Verify AWEI formula: 4 * (Green - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)
        Water typically has high Green, low SWIR1, low NIR, low SWIR2 -> AWEI > 0.
        Vegetation/Urban typically has higher NIR/SWIR -> AWEI < 0.
        """
        # Typical clear water surface reflectance values
        water_green = 0.20
        water_nir = 0.05
        water_swir1 = 0.02
        water_swir2 = 0.01

        awei_water = (
            4.0 * (water_green - water_swir1)
            - (0.25 * water_nir + 2.75 * water_swir2)
        )
        self.assertGreater(awei_water, 0.0, "AWEI should be positive for water pixels")

        # Typical dense vegetation reflectance values
        veg_green = 0.10
        veg_nir = 0.50
        veg_swir1 = 0.20
        veg_swir2 = 0.10

        awei_veg = (
            4.0 * (veg_green - veg_swir1)
            - (0.25 * veg_nir + 2.75 * veg_swir2)
        )
        self.assertLess(awei_veg, 0.0, "AWEI should be negative for vegetation pixels")

    def test_sar_vv_vh_processing(self):
        """
        Verify SAR VV/VH processing:
        - VV values below -16 dB are flagged as water (1).
        - VV values above -16 dB are land (0).
        """
        vv_samples = [-18.5, -20.0, -12.0, -8.5]
        vh_samples = [-25.0, -27.0, -18.0, -14.0]

        result = sar_service.process_sar_bands(
            vv_values=vv_samples,
            vh_values=vh_samples,
            vv_threshold_db=-16.0,
            vh_threshold_db=-23.0,
        )

        self.assertEqual(result["total_pixels"], 4)
        self.assertEqual(result["water_pixels"], 2)
        self.assertEqual(result["water_fraction"], 0.5)
        self.assertEqual(result["vv_mask"], [1, 1, 0, 0])
        self.assertIn("mean_vv_vh_ratio_db", result)

    def test_otsu_threshold_computation(self):
        """
        Verify Otsu thresholding finds the separation point in a bimodal distribution.
        """
        # Bimodal distribution: cluster 1 around -0.4 (land), cluster 2 around 0.3 (water)
        cluster_land = [-0.5, -0.45, -0.4, -0.38, -0.42] * 20
        cluster_water = [0.25, 0.3, 0.35, 0.28, 0.32] * 20
        bimodal_data = cluster_land + cluster_water

        threshold = compute_otsu_threshold(bimodal_data)
        # Optimal threshold should cleanly sit between -0.38 and 0.25
        self.assertGreater(threshold, -0.38)
        self.assertLess(threshold, 0.25)

    def test_scene_otsu_thresholds_defaults(self):
        """Verify fallback defaults for empty index values."""
        thresholds = compute_scene_otsu_thresholds()
        self.assertEqual(thresholds["NDWI"], -0.10)
        self.assertEqual(thresholds["MNDWI"], 0.0)
        self.assertEqual(thresholds["AWEI"], 0.0)


if __name__ == "__main__":
    unittest.main()
