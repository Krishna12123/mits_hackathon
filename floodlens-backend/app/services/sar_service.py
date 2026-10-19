"""
Sentinel-1 SAR Data Ingestion Service
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

    def compute_sar_water_mask(self, vv_threshold_db: float = -16.0) -> Dict[str, Any]:
        """
        Threshold helper for SAR VV backscatter.
        Water bodies typically exhibit specular reflection causing low backscatter (often < -16 dB).
        """
        return {
            "method": "Thresholding (VV Polarization)",
            "polarization": "VV",
            "threshold_db": vv_threshold_db,
            "description": "Smooth open water reflects radar signal away from sensor, yielding low dB values.",
        }


sar_service = Sentinel1SARService()
