"""
Focused Test Suite: Artifact Provenance & Report Accuracy
Verifies:
1. Rich, truthful provenance generation for all artifact types (optical, SAR, baseline, ensemble, final flood, CSV).
2. Proper recording of actual datasets, processing methods, spatial metadata (CRS, transform, resolution), and dates.
3. Input referencing: final flood mask and ensemble consensus reference the actual inputs used.
4. Truthful handling of partial and unavailable outputs (status="unavailable", honest reason, never marked ready).
5. Data source separation (gee_live vs synthetic_demo).
6. Zero secret/credential leakage in provenance payloads.
7. API schema and endpoint backward compatibility.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from app.models.report import Report
from app.models.schemas import ReportItem, ReportListResponse
from app.services.report_service import build_artifact_provenance
from app.services.raster_service import RasterMetadata


class TestArtifactProvenanceGeneration(unittest.TestCase):
    """Verifies that artifact provenance records actual source datasets, methods, and spatial parameters."""

    def setUp(self):
        self.job_ctx = {
            "job_id": "TEST-PROV-001",
            "data_source": "gee_live",
            "lat": 26.3,
            "lon": 85.8,
            "radius_km": 150.0,
            "pre_start": "2026-10-01",
            "pre_end": "2026-10-15",
            "post_start": "2026-10-16",
            "post_end": "2026-10-23",
            "min_votes": 2,
            "flood_extent_km2": 42.5,
            "otsu_thresholds": {
                "NDWI": -0.12,
                "MNDWI": 0.05,
                "AWEI": 0.02,
                "SAR": -16.0,
            },
            "inputs_used_ensemble": ["ndwi", "mndwi", "awei"],
            "inputs_used_final": ["ensemble_water", "baseline_water"],
            "affected_settlements_count": 8,
        }

        self.mock_raster_meta = RasterMetadata(
            crs="EPSG:32645",
            width=512,
            height=512,
            bands=1,
            dtype="uint8",
            transform=(20.0, 0.0, 200000.0, 0.0, -20.0, 3100000.0),
            pixel_size=(20.0, 20.0),
            extent=(200000.0, 3089760.0, 210240.0, 3100000.0),
            nodata=255,
            valid_coverage_pct=98.4,
        )

    def test_optical_ndwi_provenance(self):
        """Optical NDWI provenance records Sentinel-2 collection, threshold, and spatial grid."""
        prov = build_artifact_provenance("ndwi", self.job_ctx, self.mock_raster_meta, status="ready")

        self.assertEqual(prov["data_source"], "gee_live")
        self.assertEqual(prov["dataset"], "COPERNICUS/S2_SR_HARMONIZED")
        self.assertEqual(prov["threshold_applied"], -0.12)
        self.assertEqual(prov["status"], "ready")
        self.assertTrue(prov["is_available"])
        self.assertEqual(prov["spatial"]["crs"], "EPSG:32645")
        self.assertEqual(prov["spatial"]["pixel_size"], [20.0, 20.0])
        self.assertEqual(prov["dates"]["post_flood_window"], ["2026-10-16", "2026-10-23"])

    def test_sar_provenance(self):
        """Sentinel-1 SAR provenance records C-band GRD collection, IW mode, and VV threshold."""
        prov = build_artifact_provenance("sar", self.job_ctx, self.mock_raster_meta, status="ready")

        self.assertEqual(prov["dataset"], "COPERNICUS/S1_GRD")
        self.assertEqual(prov["instrument_mode"], "IW (Interferometric Wide Swath)")
        self.assertEqual(prov["polarizations"], ["VV", "VH"])
        self.assertEqual(prov["threshold_applied"], -16.0)

    def test_jrc_baseline_provenance(self):
        """JRC baseline provenance records European Commission Global Surface Water dataset."""
        prov = build_artifact_provenance("jrc_baseline", self.job_ctx, self.mock_raster_meta, status="ready")

        self.assertEqual(prov["dataset"], "JRC/GSW1_4/GlobalSurfaceWater")
        self.assertIn("occurrence >= 80%", prov["processing_method"])

    def test_final_flood_references_actual_inputs_used(self):
        """Final live mask provenance references the actual inputs that contributed to it."""
        prov = build_artifact_provenance("final_flood", self.job_ctx, self.mock_raster_meta, status="ready")

        self.assertEqual(prov["dataset"], "Multi-Temporal Change Detection Composite")
        self.assertEqual(prov["inputs_used"], ["ensemble_water", "baseline_water"])
        self.assertEqual(prov["flood_extent_km2"], 42.5)

    def test_ensemble_omits_sar_when_sar_unavailable(self):
        """When SAR is unavailable, ensemble provenance reflects only optical inputs."""
        ctx_without_sar = dict(self.job_ctx)
        ctx_without_sar["inputs_used_ensemble"] = ["ndwi", "mndwi", "awei"]

        prov = build_artifact_provenance("ensemble", ctx_without_sar, self.mock_raster_meta, status="ready")
        self.assertEqual(prov["inputs_used"], ["ndwi", "mndwi", "awei"])
        self.assertNotIn("sar", prov["inputs_used"])

    def test_ensemble_includes_sar_when_active(self):
        """When SAR is active, ensemble provenance lists all 4 sensors."""
        ctx_with_sar = dict(self.job_ctx)
        ctx_with_sar["inputs_used_ensemble"] = ["ndwi", "mndwi", "awei", "sar"]

        prov = build_artifact_provenance("ensemble", ctx_with_sar, self.mock_raster_meta, status="ready")
        self.assertEqual(prov["inputs_used"], ["ndwi", "mndwi", "awei", "sar"])

    def test_csv_settlement_impact_provenance(self):
        """CSV impact report records settlement baseline dataset and evaluated count."""
        prov = build_artifact_provenance("csv", self.job_ctx, status="ready")

        self.assertEqual(prov["layer_key"], "csv")
        self.assertEqual(prov["dataset"], "OpenStreetMap Settlements & District Census Baseline")
        self.assertEqual(prov["settlements_evaluated"], 8)


class TestUnavailableAndPartialArtifactHonesty(unittest.TestCase):
    """
    Verifies requirement:
    - Never mark an artifact available before successful generation and validation.
    - Represent partial results and unavailable outputs honestly.
    - Prevent failed exports from creating misleading success reports.
    """

    def setUp(self):
        self.job_ctx = {
            "job_id": "TEST-PARTIAL-002",
            "data_source": "gee_live",
            "lat": 26.3,
            "lon": 85.8,
        }

    def test_unavailable_artifact_records_honest_status_and_reason(self):
        """Unavailable artifact has status='unavailable', is_available=False, and explains why."""
        reason = "No Sentinel-1 GRD IW scenes found for AOI between 2026-10-16 and 2026-10-23."
        prov = build_artifact_provenance(
            layer_key="sar",
            job_context=self.job_ctx,
            raster_meta=None,
            status="unavailable",
            unavailable_reason=reason,
        )

        self.assertEqual(prov["status"], "unavailable")
        self.assertFalse(prov["is_available"])
        self.assertEqual(prov["unavailable_reason"], reason)

    def test_report_model_stores_unavailable_state_honestly(self):
        """Report model stores status='unavailable' with null file_path and size."""
        reason = "Cloud coverage exceeded limit in post-flood observation window."
        prov = build_artifact_provenance(
            layer_key="ndwi",
            job_context=self.job_ctx,
            status="unavailable",
            unavailable_reason=reason,
        )

        rpt = Report(
            id="TEST-JOB-NDWI",
            title="Intermediate Layer: Ndwi (TEST-JOB)",
            type="GeoTIFF",
            size=None,
            status="unavailable",
            file_path=None,
            data_source="gee_live",
            provenance=prov,
        )

        self.assertEqual(rpt.status, "unavailable")
        self.assertIsNone(rpt.file_path)
        self.assertIsNone(rpt.size)
        self.assertFalse(rpt.provenance["is_available"])
        self.assertEqual(rpt.provenance["unavailable_reason"], reason)


class TestNoSecretLeakage(unittest.TestCase):
    """Verifies that no secrets, auth tokens, private keys, or passwords leak into provenance."""

    def test_provenance_has_no_secret_keys(self):
        """Inspects all fields to ensure no sensitive credential patterns are present."""
        job_ctx = {
            "job_id": "JOB-SEC-01",
            "data_source": "gee_live",
            "lat": 26.3,
            "lon": 85.8,
        }
        for layer in ("ndwi", "sar", "ensemble", "final_flood", "csv"):
            prov = build_artifact_provenance(layer, job_ctx, status="ready")
            prov_str = str(prov).lower()

            # Forbidden substrings
            for forbidden in ("token", "secret", "private_key", "password", "auth", "credential"):
                self.assertNotIn(
                    forbidden,
                    prov_str,
                    f"Forbidden credential key '{forbidden}' found in provenance of layer '{layer}'",
                )


class TestDataSourceSeparation(unittest.TestCase):
    """Verifies strict separation between genuine Earth Engine outputs and synthetic demo simulations."""

    def test_synthetic_demo_tagged_honestly(self):
        """Synthetic demo outputs must have data_source='synthetic_demo' and simulated datasets."""
        demo_ctx = {
            "job_id": "JOB-DEMO-2026",
            "data_source": "synthetic_demo",
            "lat": 26.3,
            "lon": 85.8,
        }
        prov = build_artifact_provenance("ndwi", demo_ctx, status="ready")

        self.assertEqual(prov["data_source"], "synthetic_demo")
        self.assertIn("Synthetic", prov["dataset"])
        self.assertNotIn("COPERNICUS/S2_SR_HARMONIZED", prov["dataset"])

    def test_gee_live_tagged_honestly(self):
        """Genuine Earth Engine outputs must have data_source='gee_live' and official Copernicus IDs."""
        live_ctx = {
            "job_id": "JOB-LIVE-2026",
            "data_source": "gee_live",
            "lat": 26.3,
            "lon": 85.8,
        }
        prov = build_artifact_provenance("ndwi", live_ctx, status="ready")

        self.assertEqual(prov["data_source"], "gee_live")
        self.assertEqual(prov["dataset"], "COPERNICUS/S2_SR_HARMONIZED")


class TestSchemaSerializationCompatibility(unittest.TestCase):
    """Verifies that Pydantic schemas serialize ReportItem with provenance without breaking."""

    def test_report_item_serialization_with_provenance(self):
        """ReportItem serializes provenance while remaining fully compatible."""
        item = ReportItem(
            id="RPT-TEST-01",
            title="Flood Extent GeoTIFF",
            type="GeoTIFF",
            size="4.2 MB",
            status="ready",
            date="2026-10-24T12:00:00Z",
            data_source="gee_live",
            provenance={"dataset": "COPERNICUS/S2_SR_HARMONIZED", "is_available": True},
        )
        data = item.model_dump()

        self.assertEqual(data["id"], "RPT-TEST-01")
        self.assertEqual(data["data_source"], "gee_live")
        self.assertIsNotNone(data["provenance"])
        self.assertEqual(data["provenance"]["dataset"], "COPERNICUS/S2_SR_HARMONIZED")

    def test_report_item_serialization_without_provenance_backward_compatible(self):
        """Legacy report without provenance serializes cleanly with provenance=None."""
        item = ReportItem(
            id="RPT-LEGACY-01",
            title="Legacy Report",
            type="PDF",
            size="1.2 MB",
            status="ready",
            data_source="synthetic_demo",
        )
        data = item.model_dump()
        self.assertIsNone(data["provenance"])


if __name__ == "__main__":
    unittest.main()
