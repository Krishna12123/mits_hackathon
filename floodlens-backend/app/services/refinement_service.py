"""
Refinement & Quality Gate Service
Handles Day 3 tasks:
1. Slope Filtering (removes false positives on steep terrain)
2. HAND Filtering (Height Above Nearest Drainage thresholding)
3. SAR Speckle Cleaning (Lee & Median filters)
4. SAR Gap Filling (replaces optical gaps with SAR evidence)
5. Orchestrated refinement pipeline for /api/refine endpoint
"""
import math
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Check if Earth Engine is available
try:
    import ee
    EE_AVAILABLE = True
except ImportError:
    ee = None
    EE_AVAILABLE = False


class RefinementService:
    """Provides terrain and radar refinement operations for flood extent masks."""

    DEFAULT_SLOPE_THRESHOLD_DEG = 5.0   # Slopes > 5 deg cannot hold flood water
    DEFAULT_HAND_THRESHOLD_M = 15.0     # HAND > 15m is outside hydrologic floodplain

    @staticmethod
    def apply_slope_filter(
        water_mask: List[List[int]],
        slope_grid: List[List[float]],
        max_slope_deg: float = DEFAULT_SLOPE_THRESHOLD_DEG,
    ) -> Dict[str, Any]:
        """
        Removes false-positive water pixels located on steep terrain.
        A pixel is retained as water ONLY if water_mask == 1 AND slope <= max_slope_deg.
        """
        if not water_mask or not slope_grid:
            return {"refined_mask": water_mask, "removed_pixels": 0}

        rows = len(water_mask)
        cols = len(water_mask[0])
        refined = [[0] * cols for _ in range(rows)]
        removed_count = 0
        retained_count = 0

        for r in range(rows):
            for c in range(cols):
                if water_mask[r][c] == 1:
                    if slope_grid[r][c] <= max_slope_deg:
                        refined[r][c] = 1
                        retained_count += 1
                    else:
                        refined[r][c] = 0
                        removed_count += 1

        return {
            "refined_mask": refined,
            "original_water_pixels": retained_count + removed_count,
            "retained_water_pixels": retained_count,
            "removed_pixels": removed_count,
            "max_slope_deg": max_slope_deg,
        }

    @staticmethod
    def apply_hand_filter(
        water_mask: List[List[int]],
        hand_grid: List[List[float]],
        max_hand_m: float = DEFAULT_HAND_THRESHOLD_M,
    ) -> Dict[str, Any]:
        """
        Height Above Nearest Drainage (HAND) filter.
        Removes water pixels that are vertically higher than the hydrologically plausible floodplain.
        """
        if not water_mask or not hand_grid:
            return {"refined_mask": water_mask, "removed_pixels": 0}

        rows = len(water_mask)
        cols = len(water_mask[0])
        refined = [[0] * cols for _ in range(rows)]
        removed_count = 0
        retained_count = 0

        for r in range(rows):
            for c in range(cols):
                if water_mask[r][c] == 1:
                    if hand_grid[r][c] <= max_hand_m:
                        refined[r][c] = 1
                        retained_count += 1
                    else:
                        refined[r][c] = 0
                        removed_count += 1

        return {
            "refined_mask": refined,
            "original_water_pixels": retained_count + removed_count,
            "retained_water_pixels": retained_count,
            "removed_pixels": removed_count,
            "max_hand_m": max_hand_m,
        }

    @staticmethod
    def apply_median_speckle_filter(
        raster_grid: List[List[float]],
        window_size: int = 3,
    ) -> List[List[float]]:
        """
        Applies a 2D moving median filter (window_size x window_size) to smooth SAR speckle noise
        while preserving sharp water-land boundaries.
        """
        rows = len(raster_grid)
        cols = len(raster_grid[0])
        half_w = window_size // 2
        filtered = [[0.0] * cols for _ in range(rows)]

        for r in range(rows):
            for c in range(cols):
                window = []
                for dr in range(-half_w, half_w + 1):
                    for dc in range(-half_w, half_w + 1):
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < rows and 0 <= nc < cols:
                            window.append(raster_grid[nr][nc])
                window.sort()
                mid = len(window) // 2
                filtered[r][c] = window[mid]

        return filtered

    @staticmethod
    def apply_lee_filter(
        raster_grid: List[List[float]],
        window_size: int = 3,
        damping_factor: float = 1.0,
    ) -> List[List[float]]:
        """
        Applies an adaptive Lee filter for SAR speckle noise reduction.
        Weights between the local mean and raw value based on local variance.
        """
        rows = len(raster_grid)
        cols = len(raster_grid[0])
        half_w = window_size // 2
        filtered = [[0.0] * cols for _ in range(rows)]

        for r in range(rows):
            for c in range(cols):
                window = []
                for dr in range(-half_w, half_w + 1):
                    for dc in range(-half_w, half_w + 1):
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < rows and 0 <= nc < cols:
                            window.append(raster_grid[nr][nc])

                n = len(window)
                mean = sum(window) / n
                variance = sum((x - mean) ** 2 for x in window) / n

                # Adaptive weighting
                if variance > 0:
                    weight = variance / (variance + damping_factor)
                else:
                    weight = 0.0

                filtered[r][c] = round(mean + weight * (raster_grid[r][c] - mean), 4)

        return filtered

    @staticmethod
    def apply_sar_gap_fill(
        optical_water_mask: List[List[int]],
        optical_valid_mask: List[List[int]],
        sar_water_mask: List[List[int]],
        sar_valid_mask: List[List[int]],
    ) -> Dict[str, Any]:
        """
        Fills cloudy/invalid optical observation gaps using valid SAR radar detections.
        - If optical is valid: use optical water mask.
        - If optical is invalid (cloud) AND SAR is valid: fill from SAR water mask.
        - Returns combined mask and tracks which pixels were contributed by SAR.
        """
        rows = len(optical_water_mask)
        cols = len(optical_water_mask[0])
        combined_mask = [[0] * cols for _ in range(rows)]
        sar_filled_count = 0
        optical_water_count = 0

        for r in range(rows):
            for c in range(cols):
                if optical_valid_mask[r][c] == 1:
                    # Valid optical observation takes precedence
                    val = optical_water_mask[r][c]
                    combined_mask[r][c] = val
                    if val == 1:
                        optical_water_count += 1
                elif sar_valid_mask[r][c] == 1:
                    # Optical has cloud gap -> fill with SAR observation
                    val = sar_water_mask[r][c]
                    combined_mask[r][c] = val
                    if val == 1:
                        sar_filled_count += 1
                else:
                    # Both invalid
                    combined_mask[r][c] = 0

        return {
            "combined_mask": combined_mask,
            "optical_water_pixels": optical_water_count,
            "sar_filled_water_pixels": sar_filled_count,
            "total_water_pixels": optical_water_count + sar_filled_count,
        }

    def refine_flood_extent(
        self,
        water_mask: List[List[int]],
        slope_grid: Optional[List[List[float]]] = None,
        hand_grid: Optional[List[List[float]]] = None,
        max_slope_deg: float = DEFAULT_SLOPE_THRESHOLD_DEG,
        max_hand_m: float = DEFAULT_HAND_THRESHOLD_M,
        optical_valid_mask: Optional[List[List[int]]] = None,
        sar_water_mask: Optional[List[List[int]]] = None,
        sar_valid_mask: Optional[List[List[int]]] = None,
        enable_gap_fill: bool = True,
    ) -> Dict[str, Any]:
        """
        Complete end-to-end multi-stage refinement pipeline:
        1. Gap Filling: merges valid optical + SAR water detections if cloud gaps exist.
        2. Slope Filtering: removes false positives on steep terrain (> max_slope_deg).
        3. HAND Filtering: removes hydrologically implausible heights (> max_hand_m).
        """
        current_mask = water_mask
        rows = len(water_mask)
        cols = len(water_mask[0]) if rows > 0 else 0

        initial_water = sum(sum(row) for row in current_mask)
        sar_filled = 0

        # Step 1: Gap Filling if inputs provided
        if (
            enable_gap_fill
            and optical_valid_mask
            and sar_water_mask
            and sar_valid_mask
        ):
            gap_result = self.apply_sar_gap_fill(
                optical_water_mask=current_mask,
                optical_valid_mask=optical_valid_mask,
                sar_water_mask=sar_water_mask,
                sar_valid_mask=sar_valid_mask,
            )
            current_mask = gap_result["combined_mask"]
            sar_filled = gap_result["sar_filled_water_pixels"]

        # Step 2: Slope filter if slope grid provided
        slope_removed = 0
        if slope_grid:
            slope_res = self.apply_slope_filter(
                water_mask=current_mask,
                slope_grid=slope_grid,
                max_slope_deg=max_slope_deg,
            )
            current_mask = slope_res["refined_mask"]
            slope_removed = slope_res["removed_pixels"]

        # Step 3: HAND filter if HAND grid provided
        hand_removed = 0
        if hand_grid:
            hand_res = self.apply_hand_filter(
                water_mask=current_mask,
                hand_grid=hand_grid,
                max_hand_m=max_hand_m,
            )
            current_mask = hand_res["refined_mask"]
            hand_removed = hand_res["removed_pixels"]

        final_water = sum(sum(row) for row in current_mask)

        return {
            "initial_water_pixels": initial_water,
            "sar_filled_pixels": sar_filled,
            "slope_removed_pixels": slope_removed,
            "hand_removed_pixels": hand_removed,
            "final_water_pixels": final_water,
            "net_pixel_change": final_water - initial_water,
            "refined_mask": current_mask,
            "filters_applied": {
                "slope_filter": slope_grid is not None,
                "max_slope_deg": max_slope_deg,
                "hand_filter": hand_grid is not None,
                "max_hand_m": max_hand_m,
                "sar_gap_fill": enable_gap_fill and sar_water_mask is not None,
            },
            "status": "success",
        }


refinement_service = RefinementService()
