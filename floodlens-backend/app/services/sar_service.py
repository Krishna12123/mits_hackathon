"""
Sentinel-1 SAR Data Ingestion & Band Processing Service
Handles C-band synthetic aperture radar data (COPERNICUS/S1_GRD) with VV and VH polarizations.
Operates via Earth Engine (earthengine-api) when initialized, with robust local fallback.
"""
import logging
from typing import Dict, Any, Optional, Tuple, List

logger = logging.getLogger(__name__)

# Check if Earth Engine is available
try:
    import ee
    EE_AVAILABLE = True
except ImportError:
    ee = None
    EE_AVAILABLE = False


class Sentinel1SARService:
    """Service for querying, filtering, and preparing Sentinel-1 SAR imagery."""

    COLLECTION_ID = "COPERNICUS/S1_GRD"

    def __init__(self):
        self.is_ee_initialized = False
        self._check_ee_status()

    def _check_ee_status(self):
        if not EE_AVAILABLE:
            self.is_ee_initialized = False
            return
        try:
            # Test if EE already initialized
            ee.Number(1).getInfo()
            self.is_ee_initialized = True
        except Exception:
            self.is_ee_initialized = False

    def build_aoi_geometry(self, lat: float, lon: float, radius_km: float = 150.0):
        """Builds an Earth Engine geometry for the AOI buffer or bounding box."""
        if not self.is_ee_initialized or ee is None:
            # Return GeoJSON polygon structure
            delta = radius_km / 111.0
            return {
                "type": "Polygon",
                "coordinates": [[
                    [lon - delta, lat - delta],
                    [lon + delta, lat - delta],
                    [lon + delta, lat + delta],
                    [lon - delta, lat + delta],
                    [lon - delta, lat - delta],
                ]],
            }
        point = ee.Geometry.Point([lon, lat])
        return point.buffer(radius_km * 1000)

    def fetch_sar_collection(
        self,
        lat: float,
        lon: float,
        radius_km: float,
        start_date: str,
        end_date: str,
        orbit_pass: Optional[str] = None,  # "ASCENDING" or "DESCENDING"
    ) -> Dict[str, Any]:
        """
        Queries Sentinel-1 GRD IW imagery for the specified AOI and date range.
        Returns SAR collection metadata and scene details.
        """
        logger.info(f"Querying Sentinel-1 SAR: {start_date} to {end_date} at ({lat}, {lon})")

        if self.is_ee_initialized and ee is not None:
            try:
                aoi = self.build_aoi_geometry(lat, lon, radius_km)
                col = (
                    ee.ImageCollection(self.COLLECTION_ID)
                    .filterBounds(aoi)
                    .filterDate(start_date, end_date)
                    .filter(ee.Filter.eq("instrumentMode", "IW"))
                    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
                    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
                )

                if orbit_pass:
                    col = col.filter(ee.Filter.eq("orbitProperties_pass", orbit_pass))

                count = col.size().getInfo()
                dates = col.aggregate_array("date").getInfo() if count > 0 else []

                return {
                    "source": "Google Earth Engine",
                    "collection": self.COLLECTION_ID,
                    "polarizations": ["VV", "VH"],
                    "instrument_mode": "IW",
                    "scenes_found": count,
                    "dates": dates,
                    "orbit_pass": orbit_pass or "BOTH",
                    "status": "ready" if count > 0 else "no_scenes_found",
                }
            except Exception as e:
                logger.warning(f"EE query failed: {e}. Falling back to simulated metadata.")

        # Fallback metadata for local development & offline testing
        return {
            "source": "Sentinel-1 Offline / Simulated Ingestion",
            "collection": self.COLLECTION_ID,
            "polarizations": ["VV", "VH"],
            "instrument_mode": "IW",
            "scenes_found": 2,
            "dates": [start_date, end_date],
            "orbit_pass": orbit_pass or "DESCENDING",
            "resolution_m": 10.0,
            "bands": ["VV", "VH", "angle"],
            "status": "ready",
            "aoi": {"lat": lat, "lon": lon, "radius_km": radius_km},
        }

    def process_sar_bands(
        self,
        vv_values: List[float],
        vh_values: Optional[List[float]] = None,
        vv_threshold_db: float = -16.0,
        vh_threshold_db: float = -23.0,
    ) -> Dict[str, Any]:
        """
        Processes Sentinel-1 VV and VH backscatter arrays:
        1. VV thresholding: Open water has low specular backscatter (< -16 dB).
        2. VH thresholding: Sensitive to volumetric scattering / flooded vegetation (< -23 dB).
        3. Cross-polarization difference in dB: VV - VH.
        """
        if not vv_values:
            return {
                "error": "Empty VV backscatter array",
                "total_pixels": 0,
                "water_pixels": 0,
                "water_fraction": 0.0,
                "vv_mask": [],
            }

        total_pixels = len(vv_values)
        vv_water_mask = [1 if v < vv_threshold_db else 0 for v in vv_values]
        vv_water_count = sum(vv_water_mask)

        result: Dict[str, Any] = {
            "total_pixels": total_pixels,
            "vv_threshold_db": vv_threshold_db,
            "water_pixels": vv_water_count,
            "water_fraction": round(vv_water_count / total_pixels, 4) if total_pixels > 0 else 0.0,
            "vv_mask": vv_water_mask,
        }

        # Process VH polarization if provided
        if vh_values and len(vh_values) == total_pixels:
            vh_water_mask = [1 if v < vh_threshold_db else 0 for v in vh_values]
            diff_ratios = [vv - vh for vv, vh in zip(vv_values, vh_values)]
            result["vh_threshold_db"] = vh_threshold_db
            result["vh_water_pixels"] = sum(vh_water_mask)
            result["mean_vv_vh_ratio_db"] = round(sum(diff_ratios) / total_pixels, 2)
            result["vh_mask"] = vh_water_mask

        return result

    def get_sar_composite_ee(
        self,
        aoi,
        start_date: str,
        end_date: str,
        vv_threshold_db: float = -16.0,
    ):
        """
        Produces an Earth Engine composite for Sentinel-1 GRD imagery clipped to AOI.
        Computes VV water mask (< -16 dB) and VV/VH cross-polarization difference.
        """
        if not self.is_ee_initialized or ee is None:
            return None

        col = (
            ee.ImageCollection(self.COLLECTION_ID)
            .filterBounds(aoi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        )

        composite = col.median().clip(aoi)
        vv = composite.select("VV")
        vh = composite.select("VH")

        vv_water_mask = vv.lt(vv_threshold_db).rename("sar_water_mask")
        vv_vh_diff = vv.subtract(vh).rename("vv_vh_ratio")

        return composite.addBands([vv_water_mask, vv_vh_diff])

    def compute_sar_water_mask(self, vv_threshold_db: float = -16.0) -> Dict[str, Any]:
        """
        Threshold helper metadata for SAR VV backscatter.
        Water bodies typically exhibit specular reflection causing low backscatter (often < -16 dB).
        """
        return {
            "method": "Thresholding (VV Polarization)",
            "polarization": "VV",
            "threshold_db": vv_threshold_db,
            "description": "Smooth open water reflects radar signal away from sensor, yielding low dB values.",
        }

    def build_live_sar_mask(
        self,
        aoi,
        start_date: str,
        end_date: str,
        crs: Optional[str] = None,
        crs_transform: Optional[List[float]] = None,
        vv_threshold_db: float = -16.0,
    ) -> Dict[str, Any]:
        """
        Builds a genuine Sentinel-1 SAR water classification mask on Earth Engine.
        Filters:
        - Collection: COPERNICUS/S1_GRD
        - Bounds: aoi
        - Date: start_date to end_date
        - Instrument Mode: IW
        - Polarizations: VV and VH
        Classification:
        - Open water exhibits specular reflection in VV backscatter: VV < vv_threshold_db (-16.0 dB).
        - Valid observation mask: vv.mask().And(vh.mask())
        - Projection: aligned to crs and crs_transform (e.g. UTM 45N 20m grid)
        Returns:
            Dict containing:
            - "status": "ready" | "no_scenes_found" | "ee_unavailable" | "sar_processing_failed"
            - "scene_count": int
            - "mask_image": ee.Image (byte raster with 1 for water, 0 for non-water) or None
            - "vv_threshold_db": float
            - "polarizations": ["VV", "VH"]
            - "instrument_mode": "IW"
            - "collection": self.COLLECTION_ID
        """
        if not self.is_ee_initialized:
            self._check_ee_status()

        if not self.is_ee_initialized or ee is None:
            return {
                "status": "ee_unavailable",
                "scene_count": 0,
                "mask_image": None,
                "vv_threshold_db": vv_threshold_db,
                "polarizations": ["VV", "VH"],
                "instrument_mode": "IW",
                "collection": self.COLLECTION_ID,
            }

        try:
            col = (
                ee.ImageCollection(self.COLLECTION_ID)
                .filterBounds(aoi)
                .filterDate(start_date, end_date)
                .filter(ee.Filter.eq("instrumentMode", "IW"))
                .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
                .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
            )

            count = col.size().getInfo()
            if count == 0:
                logger.info(f"Sentinel-1 SAR query returned 0 scenes between {start_date} and {end_date}.")
                return {
                    "status": "no_scenes_found",
                    "scene_count": 0,
                    "mask_image": None,
                    "vv_threshold_db": vv_threshold_db,
                    "polarizations": ["VV", "VH"],
                    "instrument_mode": "IW",
                    "collection": self.COLLECTION_ID,
                }

            composite = col.median().clip(aoi)
            if crs and crs_transform:
                composite = composite.setDefaultProjection(crs=crs, crsTransform=crs_transform)

            vv = composite.select("VV")
            vh = composite.select("VH")

            valid_mask = vv.mask().And(vh.mask())
            water_mask = vv.lt(vv_threshold_db).And(valid_mask).rename("sar_water").unmask(0).toByte()

            return {
                "status": "ready",
                "scene_count": count,
                "mask_image": water_mask,
                "vv_threshold_db": vv_threshold_db,
                "polarizations": ["VV", "VH"],
                "instrument_mode": "IW",
                "collection": self.COLLECTION_ID,
            }
        except Exception as e:
            logger.warning(f"Error building Sentinel-1 SAR mask in Earth Engine: {e}")
            return {
                "status": "sar_processing_failed",
                "scene_count": 0,
                "mask_image": None,
                "error": str(e),
                "vv_threshold_db": vv_threshold_db,
                "polarizations": ["VV", "VH"],
                "instrument_mode": "IW",
                "collection": self.COLLECTION_ID,
            }


sar_service = Sentinel1SARService()
