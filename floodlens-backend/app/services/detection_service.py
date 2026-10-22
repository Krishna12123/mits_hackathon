"""
Core Detection Pipeline Service
Day 2 Implementation for Krishna (Backend)

Components:
1. WaterIndexEngine: Computes NDWI, MNDWI, AWEI, and Sentinel-1 SAR VV/VH masks with Otsu thresholding.
2. MajorityVoteEnsemble: Combines all 4 index results into an ensemble water mask with confidence scoring.
3. ChangeDetector: Implements post-flood water minus permanent water (JRC baseline) to isolate new flood inundation.
4. GeoTIFFExporter: Exports intermediate and final raster layers as GeoTIFF files (EPSG:4326).
5. DetectionPipeline: Orchestrates end-to-end detection from AOI + dates to GeoTIFF outputs and GeoJSON flood mask.
"""

import os
import math
import struct
import datetime
import logging
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# Check for rasterio
try:
    import rasterio
    from rasterio.transform import from_bounds
    RASTERIO_AVAILABLE = True
except ImportError:
    rasterio = None
    RASTERIO_AVAILABLE = False


# ─── 1. WATER INDEX ENGINE & OTSU THRESHOLDING ────────────────────────────────

class WaterIndexEngine:
    """
    Computes spectral and SAR water indices and applies automated Otsu thresholding.
    Indices:
    - NDWI:  (Green - NIR) / (Green + NIR)
    - MNDWI: (Green - SWIR1) / (Green + SWIR1)
    - AWEI:  4 * (Green - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)
    - SAR:   VV backscatter threshold (water typically < -16 dB)
    """

    @staticmethod
    def compute_otsu_threshold(values: List[float], num_bins: int = 128) -> float:
        """
        Otsu's thresholding algorithm implemented for continuous floating-point rasters.
        Finds the threshold that maximizes inter-class variance between water and land.
        """
        if not values:
            return 0.0

        v_min, v_max = min(values), max(values)
        if v_min == v_max:
            return v_min

        # Build histogram
        bin_width = (v_max - v_min) / num_bins
        hist = [0] * num_bins
        for v in values:
            b = int((v - v_min) / bin_width)
            if b >= num_bins:
                b = num_bins - 1
            elif b < 0:
                b = 0
            hist[b] += 1

        total_pixels = len(values)
        if total_pixels == 0:
            return 0.0

        # Otsu maximization with plateau midpoint averaging
        sum_total = sum(i * hist[i] for i in range(num_bins))
        sum_b = 0.0
        weight_b = 0.0
        max_variance = -1.0
        best_bins = [0]

        for t in range(num_bins):
            weight_b += hist[t]
            if weight_b == 0:
                continue
            weight_f = total_pixels - weight_b
            if weight_f == 0:
                break

            sum_b += t * hist[t]
            mean_b = sum_b / weight_b
            mean_f = (sum_total - sum_b) / weight_f

            between_variance = weight_b * weight_f * ((mean_b - mean_f) ** 2)
            if between_variance > max_variance + 1e-4:
                max_variance = between_variance
                best_bins = [t]
            elif abs(between_variance - max_variance) <= 1e-4:
                best_bins.append(t)

        best_threshold_bin = sum(best_bins) / len(best_bins)
        return v_min + (best_threshold_bin + 0.5) * bin_width

    @staticmethod
    def threshold_grid(grid: List[List[float]], threshold: float, condition: str = "gt") -> List[List[int]]:
        """
        Converts continuous raster values into binary water mask (1 = water, 0 = non-water).
        condition 'gt': water if value > threshold (optical indices: NDWI, MNDWI, AWEI)
        condition 'lt': water if value < threshold (SAR dB backscatter)
        """
        rows = len(grid)
        cols = len(grid[0]) if rows > 0 else 0
        binary_mask = [[0] * cols for _ in range(rows)]

        for r in range(rows):
            for c in range(cols):
                val = grid[r][c]
                if condition == "gt":
                    binary_mask[r][c] = 1 if val > threshold else 0
                else:
                    binary_mask[r][c] = 1 if val < threshold else 0

        return binary_mask


# ─── 2. MAJORITY VOTE ENSEMBLE ───────────────────────────────────────────────

class MajorityVoteEnsemble:
    """
    Combines binary water classification masks from 4 indices:
    NDWI, MNDWI, AWEI, and Sentinel-1 SAR.
    
    A pixel is classified as water if the number of agreeing indices >= min_votes.
    Confidence score is defined as votes / 4.0 (0.25 to 1.0).
    """

    INDEX_NAMES = ["NDWI", "MNDWI", "AWEI", "SAR"]

    @classmethod
    def combine(
        cls,
        masks: Dict[str, List[List[int]]],
        min_votes: int = 2,
    ) -> Tuple[List[List[int]], List[List[float]], Dict[str, Any]]:
        """
        Applies majority vote ensemble across all provided index masks.
        
        Args:
            masks: Dictionary of index_name -> 2D binary grid (0 or 1)
            min_votes: Minimum votes required to classify as water (default: 2 out of 4)
            
        Returns:
            (ensemble_mask, confidence_grid, statistics_dict)
        """
        # Ensure all required indices are present
        present_indices = [idx for idx in cls.INDEX_NAMES if idx in masks]
        if not present_indices:
            raise ValueError(f"No valid index masks provided. Expected indices: {cls.INDEX_NAMES}")

        rows = len(masks[present_indices[0]])
        cols = len(masks[present_indices[0]][0])
        total_indices = len(present_indices)

        ensemble_mask = [[0] * cols for _ in range(rows)]
        confidence_grid = [[0.0] * cols for _ in range(rows)]

        vote_distribution = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
        total_water_pixels = 0

        for r in range(rows):
            for c in range(cols):
                votes = sum(masks[idx][r][c] for idx in present_indices)
                confidence = votes / float(total_indices)
                confidence_grid[r][c] = round(confidence, 3)

                if votes in vote_distribution:
                    vote_distribution[votes] += 1

                if votes >= min_votes:
                    ensemble_mask[r][c] = 1
                    total_water_pixels += 1
                else:
                    ensemble_mask[r][c] = 0

        total_pixels = rows * cols
        stats = {
            "indices_used": present_indices,
            "min_votes_threshold": min_votes,
            "total_pixels": total_pixels,
            "water_pixels": total_water_pixels,
            "water_fraction": round(total_water_pixels / max(1, total_pixels), 4),
            "vote_distribution": vote_distribution,
            "consensus_pixels_unanimous": vote_distribution.get(4, 0),
            "high_agreement_pixels": vote_distribution.get(3, 0) + vote_distribution.get(4, 0),
        }

        return ensemble_mask, confidence_grid, stats


# ─── 3. CHANGE DETECTION (POST-FLOOD MINUS JRC BASELINE) ─────────────────────

class ChangeDetector:
    """
    Implements change detection by subtracting permanent baseline water bodies
    (JRC Global Surface Water) from the post-flood ensemble water mask.
    
    Formula:
        New Flood Inundation = Post-flood Water AND NOT (Permanent Water)
    """

    @staticmethod
    def subtract_permanent_water(
        post_flood_mask: List[List[int]],
        permanent_water_mask: List[List[int]],
    ) -> Tuple[List[List[int]], Dict[str, Any]]:
        """
        Subtracts permanent water baseline from post-flood classified water.
        
        Returns:
            (flood_extent_mask, change_statistics)
        """
        rows = len(post_flood_mask)
        cols = len(post_flood_mask[0]) if rows > 0 else 0

        flood_extent_mask = [[0] * cols for _ in range(rows)]
        permanent_count = 0
        total_post_water = 0
        new_flood_count = 0
        receded_count = 0

        for r in range(rows):
            for c in range(cols):
                post_val = post_flood_mask[r][c]
                perm_val = permanent_water_mask[r][c]

                if post_val == 1:
                    total_post_water += 1

                if perm_val == 1:
                    permanent_count += 1

                # Change detection logic
                if post_val == 1 and perm_val == 0:
                    # Newly flooded area (true flood event)
                    flood_extent_mask[r][c] = 1
                    new_flood_count += 1
                elif post_val == 0 and perm_val == 1:
                    # Receded / dry permanent water
                    receded_count += 1

        total_pixels = rows * cols
        stats = {
            "total_pixels": total_pixels,
            "post_flood_water_pixels": total_post_water,
            "permanent_water_pixels": permanent_count,
            "new_flood_pixels": new_flood_count,
            "receded_water_pixels": receded_count,
            "permanent_water_subtracted_pixels": total_post_water - new_flood_count,
            "flood_to_total_water_ratio": round(new_flood_count / max(1, total_post_water), 4),
        }

        return flood_extent_mask, stats


# ─── 4. GEOTIFF EXPORTER ─────────────────────────────────────────────────────

class GeoTIFFExporter:
    """
    Saves raster grids as standard GeoTIFF files.
    Prefers rasterio with geospatial affine transform; falls back to Pillow TIFF
    with standard GeoTIFF projection tags (EPSG:4326).
    """

    # Standard GeoTIFF TIFF tags
    TIFF_TAG_MODEL_PIXEL_SCALE = 33550
    TIFF_TAG_MODEL_TIEPOINT = 33922
    TIFF_TAG_GEO_KEY_DIRECTORY = 34735

    @classmethod
    def save_raster(
        cls,
        grid: List[List[float]],
        bounds: Tuple[float, float, float, float],  # (min_lon, min_lat, max_lon, max_lat)
        output_path: str,
        dtype: str = "uint8",
    ) -> str:
        """
        Saves a 2D float or integer grid as a GeoTIFF image.
        
        Args:
            grid: 2D list of numeric values
            bounds: (min_lon, min_lat, max_lon, max_lat) in EPSG:4326
            output_path: Destination .tif file path
            dtype: 'uint8' or 'float32'
            
        Returns:
            output_path: Path of the saved file
        """
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        rows = len(grid)
        cols = len(grid[0]) if rows > 0 else 0
        min_lon, min_lat, max_lon, max_lat = bounds

        res_x = (max_lon - min_lon) / max(1, cols)
        res_y = (max_lat - min_lat) / max(1, rows)

        if RASTERIO_AVAILABLE and rasterio is not None:
            try:
                import numpy as np
                arr = np.array(grid, dtype=np.uint8 if dtype == "uint8" else np.float32)
                transform = from_bounds(min_lon, min_lat, max_lon, max_lat, cols, rows)
                with rasterio.open(
                    output_path,
                    "w",
                    driver="GTiff",
                    height=rows,
                    width=cols,
                    count=1,
                    dtype=arr.dtype,
                    crs="EPSG:4326",
                    transform=transform,
                ) as dst:
                    dst.write(arr, 1)
                logger.info(f"Saved GeoTIFF via rasterio to {output_path}")
                return output_path
            except Exception as e:
                logger.warning(f"rasterio write failed: {e}. Falling back to Pillow GeoTIFF.")

        # Pillow Fallback with genuine GeoTIFF metadata tags
        # Convert grid values to uint8 bytes
        raw_bytes = bytearray()
        for r in range(rows):
            for c in range(cols):
                v = grid[r][c]
                if dtype == "uint8":
                    byte_val = max(0, min(255, int(v)))
                else:
                    # Normalize float to 0-255 for previewable TIFF
                    byte_val = max(0, min(255, int(v * 255)))
                raw_bytes.append(byte_val)

        img = Image.frombytes("L", (cols, rows), bytes(raw_bytes))

        # Add GeoTIFF metadata tags for GIS software (QGIS, Leaflet, rasterio)
        # ModelPixelScaleTag (33550): [ScaleX, ScaleY, ScaleZ]
        # ModelTiepointTag (33922): [I, J, K, X, Y, Z]
        # GeoKeyDirectoryTag (34735): EPSG:4326 WGS84 coordinates
        tiff_info = {
            cls.TIFF_TAG_MODEL_PIXEL_SCALE: (res_x, res_y, 0.0),
            cls.TIFF_TAG_MODEL_TIEPOINT: (0.0, 0.0, 0.0, min_lon, max_lat, 0.0),
            cls.TIFF_TAG_GEO_KEY_DIRECTORY: (
                1, 1, 0, 7,     # Header
                1024, 0, 1, 2,  # GTModelTypeGeoKey = 2 (ModelTypeGeographic)
                1025, 0, 1, 1,  # GTRasterTypeGeoKey = 1 (RasterPixelIsArea)
                2048, 0, 1, 4326 # GeographicTypeGeoKey = 4326 (WGS 84)
            ),
        }

        img.save(output_path, format="TIFF", tiffinfo=tiff_info)
        logger.info(f"Saved GeoTIFF via Pillow to {output_path}")
        return output_path


# ─── 5. FULL DETECTION PIPELINE ──────────────────────────────────────────────

class DetectionPipeline:
    """
    Coordinates data ingestion, multi-index calculation, Otsu thresholding,
    majority vote ensemble, permanent water subtraction, GeoTIFF exports,
    and GeoJSON polygon formatting.
    """

    def __init__(self, base_output_dir: str = "outputs/geotiff"):
        self.base_output_dir = base_output_dir

    def generate_synthetic_scene(
        self,
        lat: float,
        lon: float,
        radius_km: float,
        rows: int = 50,
        cols: int = 50,
    ) -> Dict[str, Any]:
        """
        Generates realistic spatial rasters for an AOI simulating North Bihar flood terrain:
        - Major rivers (Gandak / Bagmati / Kosi) as permanent water
        - Surrounding low-lying floodplains inundated during flood events
        - Agricultural fields with varying NDWI / MNDWI / AWEI / SAR responses
        """
        delta = radius_km / 111.0
        min_lon, max_lon = lon - delta, lon + delta
        min_lat, max_lat = lat - delta, lat + delta

        bounds = (min_lon, min_lat, max_lon, max_lat)

        # 1. Permanent river channel (curving river through the AOI)
        permanent_jrc = [[0] * cols for _ in range(rows)]
        for r in range(rows):
            # Sinusoidal river center
            c_center = int(cols * 0.45 + cols * 0.15 * math.sin(r / 6.0))
            for dc in range(-2, 3):
                c = c_center + dc
                if 0 <= c < cols:
                    permanent_jrc[r][c] = 1

        # 2. Flood inundation zone (expands outward from river into floodplains)
        post_flood_ground_truth = [[0] * cols for _ in range(rows)]
        for r in range(rows):
            c_center = int(cols * 0.45 + cols * 0.15 * math.sin(r / 6.0))
            # Flood expands widely in the lower basin (r > 15)
            spread = 10 if r > 15 else 4
            for dc in range(-spread, spread + 2):
                c = c_center + dc
                if 0 <= c < cols:
                    post_flood_ground_truth[r][c] = 1

        # 3. Simulate continuous index values with sensor characteristics
        ndwi_raw = [[0.0] * cols for _ in range(rows)]
        mndwi_raw = [[0.0] * cols for _ in range(rows)]
        awei_raw = [[0.0] * cols for _ in range(rows)]
        sar_db_raw = [[0.0] * cols for _ in range(rows)]

        for r in range(rows):
            for c in range(cols):
                is_water = post_flood_ground_truth[r][c] == 1
                # Add natural noise
                noise = 0.05 * math.sin(r * 1.5 + c * 2.0)

                if is_water:
                    # Water response
                    ndwi_raw[r][c] = round(0.45 + noise, 3)
                    mndwi_raw[r][c] = round(0.55 + noise, 3)
                    awei_raw[r][c] = round(0.35 + noise, 3)
                    sar_db_raw[r][c] = round(-19.5 + noise * 5, 2)  # Low dB backscatter
                else:
                    # Dry land / vegetation
                    ndwi_raw[r][c] = round(-0.25 + noise, 3)
                    mndwi_raw[r][c] = round(-0.35 + noise, 3)
                    awei_raw[r][c] = round(-0.40 + noise, 3)
                    sar_db_raw[r][c] = round(-10.0 + noise * 5, 2)  # Higher dB backscatter

        return {
            "bounds": bounds,
            "rows": rows,
            "cols": cols,
            "permanent_jrc": permanent_jrc,
            "ndwi_raw": ndwi_raw,
            "mndwi_raw": mndwi_raw,
            "awei_raw": awei_raw,
            "sar_db_raw": sar_db_raw,
        }

    def run_detection(
        self,
        job_id: str,
        lat: float = 26.3,
        lon: float = 85.8,
        radius_km: float = 150.0,
        pre_date: str = "2026-10-11",
        post_date: str = "2026-10-19",
        min_votes: int = 2,
        save_geotiffs: bool = True,
    ) -> Dict[str, Any]:
        """
        Executes the entire Day 2 core detection pipeline:
        1. Multi-index computation & Otsu thresholding
        2. Majority vote ensemble
        3. Change detection (subtract JRC permanent water)
        4. Intermediate GeoTIFF saving
        5. GeoJSON polygonization with flood extent area
        """
        logger.info(f"Running detection pipeline for {job_id} around ({lat}, {lon})")

        # Create output directory for this job's GeoTIFFs
        job_dir = Path(self.base_output_dir) / job_id
        if save_geotiffs:
            job_dir.mkdir(parents=True, exist_ok=True)

        # 1. Synthesize/Load Rasters for AOI
        scene = self.generate_synthetic_scene(lat, lon, radius_km, rows=60, cols=60)
        bounds = scene["bounds"]
        rows, cols = scene["rows"], scene["cols"]

        # 2. Otsu thresholding for optical indices & SAR
        ndwi_flat = [val for row in scene["ndwi_raw"] for val in row]
        mndwi_flat = [val for row in scene["mndwi_raw"] for val in row]
        awei_flat = [val for row in scene["awei_raw"] for val in row]
        sar_flat = [val for row in scene["sar_db_raw"] for val in row]

        t_ndwi = WaterIndexEngine.compute_otsu_threshold(ndwi_flat)
        t_mndwi = WaterIndexEngine.compute_otsu_threshold(mndwi_flat)
        t_awei = WaterIndexEngine.compute_otsu_threshold(awei_flat)
        t_sar = WaterIndexEngine.compute_otsu_threshold(sar_flat)

        mask_ndwi = WaterIndexEngine.threshold_grid(scene["ndwi_raw"], t_ndwi, condition="gt")
        mask_mndwi = WaterIndexEngine.threshold_grid(scene["mndwi_raw"], t_mndwi, condition="gt")
        mask_awei = WaterIndexEngine.threshold_grid(scene["awei_raw"], t_awei, condition="gt")
        mask_sar = WaterIndexEngine.threshold_grid(scene["sar_db_raw"], t_sar, condition="lt")

        # 3. Majority Vote Ensemble across all 4 indices
        index_masks = {
            "NDWI": mask_ndwi,
            "MNDWI": mask_mndwi,
            "AWEI": mask_awei,
            "SAR": mask_sar,
        }
        ensemble_mask, confidence_grid, ensemble_stats = MajorityVoteEnsemble.combine(
            index_masks, min_votes=min_votes
        )

        # 4. Change Detection: Post-Flood minus JRC Permanent Water Baseline
        permanent_water_mask = scene["permanent_jrc"]
        final_flood_mask, change_stats = ChangeDetector.subtract_permanent_water(
            post_flood_mask=ensemble_mask,
            permanent_water_mask=permanent_water_mask,
        )

        # 5. Save Intermediate & Final GeoTIFFs
        geotiff_files = {}
        if save_geotiffs:
            geotiff_files["ndwi"] = GeoTIFFExporter.save_raster(
                mask_ndwi, bounds, str(job_dir / "ndwi_mask.tif"), dtype="uint8"
            )
            geotiff_files["mndwi"] = GeoTIFFExporter.save_raster(
                mask_mndwi, bounds, str(job_dir / "mndwi_mask.tif"), dtype="uint8"
            )
            geotiff_files["awei"] = GeoTIFFExporter.save_raster(
                mask_awei, bounds, str(job_dir / "awei_mask.tif"), dtype="uint8"
            )
            geotiff_files["sar"] = GeoTIFFExporter.save_raster(
                mask_sar, bounds, str(job_dir / "sar_mask.tif"), dtype="uint8"
            )
            geotiff_files["ensemble"] = GeoTIFFExporter.save_raster(
                ensemble_mask, bounds, str(job_dir / "ensemble_mask.tif"), dtype="uint8"
            )
            geotiff_files["jrc_baseline"] = GeoTIFFExporter.save_raster(
                permanent_water_mask, bounds, str(job_dir / "jrc_baseline.tif"), dtype="uint8"
            )
            geotiff_files["final_flood"] = GeoTIFFExporter.save_raster(
                final_flood_mask, bounds, str(job_dir / "final_flood_mask.tif"), dtype="uint8"
            )

        # 6. Area Calculation
        # Cell size in kilometers
        min_lon, min_lat, max_lon, max_lat = bounds
        deg_to_km = 111.0
        cell_width_km = ((max_lon - min_lon) / cols) * deg_to_km * math.cos(math.radians(lat))
        cell_height_km = ((max_lat - min_lat) / rows) * deg_to_km
        pixel_area_km2 = cell_width_km * cell_height_km

        new_flood_pixels = change_stats["new_flood_pixels"]
        permanent_pixels = change_stats["permanent_water_pixels"]
        total_post_pixels = change_stats["post_flood_water_pixels"]

        flood_extent_km2 = round(new_flood_pixels * pixel_area_km2, 2)
        permanent_water_km2 = round(permanent_pixels * pixel_area_km2, 2)
        total_water_km2 = round(total_post_pixels * pixel_area_km2, 2)

        # 7. Convert Flood Raster to GeoJSON Polygons
        features = self._vectorize_flood_mask(
            final_flood_mask,
            confidence_grid,
            bounds,
            rows,
            cols,
            pixel_area_km2,
        )

        geojson_result = {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "job_id": job_id,
                "flood_extent_km2": flood_extent_km2,
                "permanent_water_km2": permanent_water_km2,
                "total_water_km2": total_water_km2,
                "pre_date": pre_date,
                "post_date": post_date,
                "min_votes": min_votes,
                "indices_used": list(index_masks.keys()),
                "otsu_thresholds": {
                    "NDWI": round(t_ndwi, 3),
                    "MNDWI": round(t_mndwi, 3),
                    "AWEI": round(t_awei, 3),
                    "SAR_dB": round(t_sar, 2),
                },
            },
        }

        return {
            "job_id": job_id,
            "status": "completed",
            "flood_extent_km2": flood_extent_km2,
            "permanent_water_km2": permanent_water_km2,
            "total_water_km2": total_water_km2,
            "change_statistics": change_stats,
            "ensemble_statistics": ensemble_stats,
            "otsu_thresholds": {
                "NDWI": round(t_ndwi, 3),
                "MNDWI": round(t_mndwi, 3),
                "AWEI": round(t_awei, 3),
                "SAR": round(t_sar, 2),
            },
            "geotiff_outputs": geotiff_files,
            "geojson": geojson_result,
        }

    def _vectorize_flood_mask(
        self,
        mask: List[List[int]],
        confidence_grid: List[List[float]],
        bounds: Tuple[float, float, float, float],
        rows: int,
        cols: int,
        pixel_area_km2: float,
    ) -> List[Dict[str, Any]]:
        """
        Groups connected flood pixels into distinct polygon features with
        severity ratings, area, and estimated depth.
        """
        min_lon, min_lat, max_lon, max_lat = bounds
        d_lon = (max_lon - min_lon) / cols
        d_lat = (max_lat - min_lat) / rows

        visited = [[False] * cols for _ in range(rows)]
        features = []

        # Find connected components (flood clusters)
        for r in range(rows):
            for c in range(cols):
                if mask[r][c] == 1 and not visited[r][c]:
                    # BFS to find component
                    cluster = []
                    queue = [(r, c)]
                    visited[r][c] = True

                    while queue:
                        curr_r, curr_c = queue.pop(0)
                        cluster.append((curr_r, curr_c))

                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = curr_r + dr, curr_c + dc
                            if 0 <= nr < rows and 0 <= nc < cols:
                                if mask[nr][nc] == 1 and not visited[nr][nc]:
                                    visited[nr][nc] = True
                                    queue.append((nr, nc))

                    if len(cluster) >= 3:  # Filter out single-pixel speckles
                        # Calculate bounding polygon for the cluster
                        min_r_c = min(p[0] for p in cluster)
                        max_r_c = max(p[0] for p in cluster)
                        min_c_c = min(p[1] for p in cluster)
                        max_c_c = max(p[1] for p in cluster)

                        poly_min_lon = round(min_lon + min_c_c * d_lon, 4)
                        poly_max_lon = round(min_lon + (max_c_c + 1) * d_lon, 4)
                        poly_min_lat = round(min_lat + (rows - max_r_c - 1) * d_lat, 4)
                        poly_max_lat = round(min_lat + (rows - min_r_c) * d_lat, 4)

                        mean_conf = sum(confidence_grid[p[0]][p[1]] for p in cluster) / len(cluster)
                        area_km2 = round(len(cluster) * pixel_area_km2, 2)

                        severity = "severe" if mean_conf >= 0.75 else ("high" if mean_conf >= 0.5 else "medium")
                        depth_est = 1.8 if severity == "severe" else (1.2 if severity == "high" else 0.7)

                        features.append({
                            "type": "Feature",
                            "properties": {
                                "cluster_id": len(features) + 1,
                                "severity": severity,
                                "mean_confidence": round(mean_conf, 2),
                                "area_sqkm": area_km2,
                                "depth_est_m": depth_est,
                                "pixel_count": len(cluster),
                                "detected_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            },
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [[
                                    [poly_min_lon, poly_min_lat],
                                    [poly_max_lon, poly_min_lat],
                                    [poly_max_lon, poly_max_lat],
                                    [poly_min_lon, poly_max_lat],
                                    [poly_min_lon, poly_min_lat],
                                ]],
                            },
                        })

        return features


detection_pipeline = DetectionPipeline()
