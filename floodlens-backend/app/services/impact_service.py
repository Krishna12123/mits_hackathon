"""
Settlement Impact Assessment & Geospatial Outputs Service
Handles Day 4 tasks:
1. Spatial intersection of flood extent polygons with OSM settlement boundaries
2. Accurate geodesic/projected area calculations (km² and %)
3. Impact severity classification:
   - 🔴 Severely Affected (>= 70%)
   - 🟡 Partially Affected (30% - 69.9%)
   - 🟢 Safe (< 30%)
4. GeoJSON FeatureCollection generation and GeoTIFF export
"""
import math
import logging
from typing import List, Dict, Any, Optional, Tuple
from shapely.geometry import shape, Polygon, MultiPolygon, box, mapping
from shapely.ops import unary_union

from app.services.static_layers_service import static_layers_service
from app.services.report_service import determine_impact_flag
from app.services.detection_service import GeoTIFFExporter

logger = logging.getLogger(__name__)


def degrees_to_km2(area_deg2: float, lat: float) -> float:
    """
    Converts planar square degrees to square kilometers at a given latitude (WGS84).
    1 deg latitude ≈ 111.0 km
    1 deg longitude ≈ 111.0 * cos(lat) km
    """
    lat_rad = math.radians(lat)
    km_per_deg_lat = 111.0
    km_per_deg_lon = 111.0 * math.cos(lat_rad)
    return area_deg2 * km_per_deg_lat * km_per_deg_lon


class SettlementImpactService:
    """Computes settlement-level flood exposure, area intersections, and exports."""

    @staticmethod
    def get_settlement_polygon(settlement_data: Dict[str, Any]) -> Tuple[Polygon, float]:
        """
        Retrieves or constructs a realistic bounding polygon for a settlement.
        Returns: (shapely_polygon, approx_total_area_km2)
        """
        lat = float(settlement_data.get("lat", 26.0))
        lon = float(settlement_data.get("lon", 85.8))

        # If explicit GeoJSON geometry is stored in data, use it
        if "geom_geojson" in settlement_data and settlement_data["geom_geojson"]:
            try:
                poly = shape(settlement_data["geom_geojson"])
                area_km2 = degrees_to_km2(poly.area, lat)
                return poly, max(0.1, round(area_km2, 2))
            except Exception as e:
                logger.warning(f"Could not parse geom_geojson for settlement: {e}")

        # Construct realistic municipal bounding footprint (~3.5 km radius equivalent)
        delta_lat = 0.03  # ~3.3 km
        delta_lon = 0.035 # ~3.4 km at 26 deg N
        poly = box(lon - delta_lon, lat - delta_lat, lon + delta_lon, lat + delta_lat)
        total_area_km2 = degrees_to_km2(poly.area, lat)
        return poly, round(total_area_km2, 2)

    @classmethod
    def assess_settlement_impact(
        cls,
        flood_geojson: Dict[str, Any],
        settlements_list: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Performs spatial polygon intersection between flood extent polygons and settlements.
        Calculates:
        - flooded_area_km2
        - total_area_km2
        - flooded_pct
        - severity ("severe", "high", "medium", "safe")
        - severity_badge ("🔴 Severely Affected", "🟡 Partially Affected", "🟢 Safe")
        - estimated affected population and homes
        """
        if settlements_list is None:
            settlements_list = static_layers_service.get_osm_settlements()

        # Parse and union all flood polygons into a single spatial geometry
        flood_polys = []
        features = flood_geojson.get("features", [])
        for f in features:
            geom = f.get("geometry")
            if geom and geom.get("type") in ("Polygon", "MultiPolygon"):
                try:
                    s_geom = shape(geom)
                    if not s_geom.is_valid:
                        s_geom = s_geom.buffer(0)
                    if not s_geom.is_empty:
                        flood_polys.append(s_geom)
                except Exception as e:
                    logger.warning(f"Invalid flood feature geometry: {e}")

        union_flood = unary_union(flood_polys) if flood_polys else None

        results = []
        for s in settlements_list:
            settlement_poly, total_area_km2 = cls.get_settlement_polygon(s)
            lat = float(s.get("lat", 26.0))

            flooded_area_km2 = 0.0
            flooded_pct = 0.0

            if union_flood and not union_flood.is_empty:
                try:
                    intersection = settlement_poly.intersection(union_flood)
                    if not intersection.is_empty:
                        flooded_area_deg2 = intersection.area
                        flooded_area_km2 = degrees_to_km2(flooded_area_deg2, lat)
                        flooded_area_km2 = min(flooded_area_km2, total_area_km2)
                        flooded_pct = (flooded_area_km2 / max(0.001, total_area_km2)) * 100.0
                        flooded_pct = min(100.0, max(0.0, flooded_pct))
                except Exception as e:
                    logger.warning(f"Intersection failed for {s.get('name')}: {e}")

            flooded_area_km2 = round(flooded_area_km2, 2)
            flooded_pct = round(flooded_pct, 1)

            # Determine severity and impact flag according to protocol
            severity_badge = determine_impact_flag(flooded_pct)
            if flooded_pct >= 70.0:
                severity = "severe"
            elif flooded_pct >= 50.0:
                severity = "high"
            elif flooded_pct >= 30.0:
                severity = "medium"
            else:
                severity = "safe"

            pop = int(s.get("population", 0))
            homes = int(s.get("homes", 0))
            ratio = flooded_pct / 100.0

            results.append({
                "id": s.get("id"),
                "name": s.get("name"),
                "district": s.get("district"),
                "state": s.get("state", "Bihar"),
                "lat": lat,
                "lon": float(s.get("lon", 85.8)),
                "total_area_km2": total_area_km2,
                "flooded_area_km2": flooded_area_km2,
                "flooded_pct": flooded_pct,
                "severity": severity,
                "severity_badge": severity_badge,
                "total_population": pop,
                "affected_population": int(pop * ratio),
                "total_homes": homes,
                "affected_homes": int(homes * ratio),
                "geometry_geojson": mapping(settlement_poly),
            })

        # Sort with most severely affected settlements first
        results.sort(key=lambda x: x["flooded_pct"], reverse=True)
        return results

    @classmethod
    def export_impact_geojson(cls, impact_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Formats settlement impact statistics into an official GeoJSON FeatureCollection
        suitable for Leaflet maps, QGIS, and web visualization.
        """
        features = []
        for item in impact_results:
            feat = {
                "type": "Feature",
                "geometry": item.get("geometry_geojson"),
                "properties": {
                    "settlement_id": item.get("id"),
                    "name": item.get("name"),
                    "district": item.get("district"),
                    "state": item.get("state"),
                    "flooded_pct": item.get("flooded_pct"),
                    "flooded_area_km2": item.get("flooded_area_km2"),
                    "total_area_km2": item.get("total_area_km2"),
                    "severity": item.get("severity"),
                    "severity_badge": item.get("severity_badge"),
                    "affected_population": item.get("affected_population"),
                    "total_population": item.get("total_population"),
                },
            }
            features.append(feat)

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "total_settlements": len(impact_results),
                "severely_affected_count": sum(1 for x in impact_results if x["flooded_pct"] >= 70.0),
                "partially_affected_count": sum(1 for x in impact_results if 30.0 <= x["flooded_pct"] < 70.0),
                "safe_count": sum(1 for x in impact_results if x["flooded_pct"] < 30.0),
            },
        }

    @staticmethod
    def export_flood_map_geotiff(
        grid: List[List[int]],
        bounds: Tuple[float, float, float, float],
        output_path: str,
    ) -> str:
        """
        Exports a classified flood raster grid to a GeoTIFF file with EPSG:4326 metadata.
        Reuses existing GeoTIFFExporter.
        """
        return GeoTIFFExporter.export_geotiff(
            grid=grid,
            bounds=bounds,
            output_path=output_path,
            dtype="uint8",
        )


settlement_impact_service = SettlementImpactService()
