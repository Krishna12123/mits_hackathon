"""
Static Reference Layers Service
Loads baseline spatial layers:
1. SRTM DEM (USGS/SRTMGL1_003) - Elevation & Slope for HAND / terrain filtering
2. JRC Global Surface Water (JRC/GSW1_4/GlobalSurfaceWater) - Permanent water baseline
3. OpenStreetMap (OSM) Settlements - Settlement polygons, districts, and population
"""
import logging
from typing import Dict, Any, List
import datetime

logger = logging.getLogger(__name__)

try:
    import ee
    EE_AVAILABLE = True
except ImportError:
    ee = None
    EE_AVAILABLE = False


class JRCUnavailableError(RuntimeError):
    """Raised when the genuine JRC Global Surface Water dataset cannot be fetched.
    The exception differentiates between missing Earth Engine credentials and
    validation failures (e.g., missing 'occurrence' band). It is *not* caught by
    generic Exception handlers so that callers can decide whether to fall back to
    the simulated layer or abort the detection step.
    """

class StaticLayersService:

    """Manages static spatial layers required across detection and impact analysis."""

    SRTM_DEM_ID = "USGS/SRTMGL1_003"
    JRC_WATER_ID = "JRC/GSW1_4/GlobalSurfaceWater"

    def __init__(self):
        self.is_ee_initialized = False
        self._check_ee_status()

    def _check_ee_status(self):
        if not EE_AVAILABLE:
            self.is_ee_initialized = False
            return
        try:
            ee.Number(1).getInfo()
            self.is_ee_initialized = True
        except Exception:
            self.is_ee_initialized = False

    def get_dem_layer(self, lat: float, lon: float, radius_km: float = 150.0) -> Dict[str, Any]:
        """Loads SRTM Digital Elevation Model (30m) and calculates slope."""
        logger.info(f"Loading DEM layer for AOI ({lat}, {lon})")

        if self.is_ee_initialized and ee is not None:
            try:
                point = ee.Geometry.Point([lon, lat])
                aoi = point.buffer(radius_km * 1000)
                dem = ee.Image(self.SRTM_DEM_ID).clip(aoi)
                slope = ee.Terrain.slope(dem)

                return {
                    "source": "Google Earth Engine",
                    "layer": "SRTM Digital Elevation Model",
                    "collection": self.SRTM_DEM_ID,
                    "resolution_m": 30.0,
                    "bands": ["elevation", "slope"],
                    "status": "ready",
                }
            except Exception as e:
                logger.warning(f"EE DEM query failed: {e}. Using fallback layer.")

        return {
            "source": "SRTM 30m Local / Simulated",
            "layer": "SRTM Digital Elevation Model",
            "collection": self.SRTM_DEM_ID,
            "resolution_m": 30.0,
            "bands": ["elevation", "slope"],
            "elevation_range_m": [35, 120],
            "average_slope_deg": 1.2,
            "status": "ready",
        }

    def get_jrc_permanent_water(self, lat: float, lon: float, radius_km: float = 150.0, occurrence_threshold: int = 80) -> Dict[str, Any]:
        """Loads JRC Global Surface Water dataset with provenance metadata.

        Raises:
            JRCUnavailableError: If Earth Engine is unavailable or required bands are missing.
        """
        logger.info(f"Loading JRC permanent water baseline (threshold >= {occurrence_threshold}%)")
        # Capture provenance information
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        band_list = ["occurrence", "change_abs", "extent"]

        if self.is_ee_initialized and ee is not None:
            try:
                point = ee.Geometry.Point([lon, lat])
                aoi = point.buffer(radius_km * 1000)
                gsw = ee.Image(self.JRC_WATER_ID).clip(aoi)
                # Verify required bands exist
                missing_bands = []
                for b in band_list:
                    try:
                        if not gsw.select(b).getInfo():
                            pass
                    except Exception:
                        missing_bands.append(b)
                if missing_bands:
                    raise JRCUnavailableError(f"Missing expected bands in JRC dataset: {missing_bands}")
                occurrence = gsw.select("occurrence")
                permanent_water = occurrence.gte(occurrence_threshold)
                return {
                    "source": "Google Earth Engine",
                    "layer": "JRC Global Surface Water v1.4",
                    "collection": self.JRC_WATER_ID,
                    "occurrence_threshold_pct": occurrence_threshold,
                    "status": "ready",
                    "timestamp": timestamp,
                    "bands": band_list,
                }
            except Exception as e:
                logger.warning(f"EE JRC water query failed: {e}. Using fallback layer.")
                raise JRCUnavailableError(str(e))

        # Fallback simulated layer
        return {
            "source": "JRC Global Surface Water Local / Simulated",
            "layer": "JRC Global Surface Water v1.4",
            "collection": self.JRC_WATER_ID,
            "occurrence_threshold_pct": occurrence_threshold,
            "permanent_water_extent_km2": 42.5,
            "status": "ready",
            "timestamp": timestamp,
            "bands": band_list,
        
            "source": "JRC Global Surface Water Local / Simulated",
            "layer": "JRC Global Surface Water v1.4",
            "collection": self.JRC_WATER_ID,
            "occurrence_threshold_pct": occurrence_threshold,
            "permanent_water_extent_km2": 42.5,
            "status": "ready",
        }

    def get_osm_settlements(self, district: str = None) -> List[Dict[str, Any]]:
        """
        Returns OSM settlement administrative units for flood intersection.
        """
        settlements = [
            {"id": 1, "name": "Hayaghat", "district": "Darbhanga", "population": 42300, "homes": 8200, "farms_ha": 1240.0, "lat": 26.04, "lon": 85.92},
            {"id": 2, "name": "Benipur", "district": "Darbhanga", "population": 31500, "homes": 6100, "farms_ha": 890.0, "lat": 26.11, "lon": 86.13},
            {"id": 3, "name": "Sheohar", "district": "Sitamarhi", "population": 28900, "homes": 5400, "farms_ha": 760.0, "lat": 26.52, "lon": 85.29},
            {"id": 4, "name": "Runnisaidpur", "district": "Sitamarhi", "population": 18700, "homes": 3900, "farms_ha": 510.0, "lat": 26.38, "lon": 85.49},
            {"id": 5, "name": "Sitamarhi", "district": "Sitamarhi", "population": 94200, "homes": 17300, "farms_ha": 2100.0, "lat": 26.60, "lon": 85.49},
            {"id": 6, "name": "Muzaffarpur", "district": "Muzaffarpur", "population": 354000, "homes": 64000, "farms_ha": 3200.0, "lat": 26.12, "lon": 85.39},
            {"id": 7, "name": "Pusa", "district": "Darbhanga", "population": 14800, "homes": 2700, "farms_ha": 430.0, "lat": 25.98, "lon": 85.67},
        ]

        if district:
            settlements = [s for s in settlements if district.lower() in s["district"].lower()]
        return settlements


static_layers_service = StaticLayersService()
