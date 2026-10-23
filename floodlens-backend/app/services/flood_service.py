import math
from typing import Dict, List, Optional, Any
try:
    import ee
except ImportError:
    ee = None


CLOUD_LIMIT_PERCENT = 80
ANALYSIS_SCALE_M = 20
MINIMUM_VALID_COVERAGE_PERCENT = 50

# A fixed reference grid makes pre/post analysis use the same
# CRS, pixel size, and grid origin.
# EPSG:32645 is UTM Zone 45N, suitable for the eastern Nepal AOI.
ANALYSIS_CRS = "EPSG:32645"
GRID_TRANSFORM = [20, 0, 200000, 0, -20, 3100000]


# ─── OTSU AUTOMATED THRESHOLDING PER SCENE ───────────────────────────────────

def compute_otsu_threshold(values: List[float], num_bins: int = 128) -> float:
    """
    Computes optimal threshold using Otsu's method for floating-point water index arrays.
    Maximizes inter-class variance between water and non-water classes.
    """
    if not values:
        return 0.0

    v_min, v_max = min(values), max(values)
    if v_min == v_max:
        return v_min

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
    sum_total = 0.0
    for i in range(num_bins):
        sum_total += i * hist[i]

    current_max = 0.0
    threshold_idx = 0
    weight_bg = 0
    sum_bg = 0.0

    for i in range(num_bins):
        weight_bg += hist[i]
        if weight_bg == 0:
            continue
        weight_fg = total_pixels - weight_bg
        if weight_fg == 0:
            break

        sum_bg += i * hist[i]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_total - sum_bg) / weight_fg

        # Between-class variance
        var_between = float(weight_bg) * float(weight_fg) * ((mean_bg - mean_fg) ** 2)

        if var_between > current_max:
            current_max = var_between
            threshold_idx = i

    optimal_threshold = v_min + (threshold_idx + 0.5) * bin_width
    return round(optimal_threshold, 4)


def compute_scene_otsu_thresholds(
    ndwi_values: Optional[List[float]] = None,
    mndwi_values: Optional[List[float]] = None,
    awei_values: Optional[List[float]] = None,
) -> Dict[str, float]:
    """
    Computes per-scene Otsu thresholds for all available spectral indices.
    Falls back to robust standard defaults if array is not provided.
    """
    thresholds: Dict[str, float] = {}

    if ndwi_values:
        thresholds["NDWI"] = compute_otsu_threshold(ndwi_values)
    else:
        thresholds["NDWI"] = -0.10

    if mndwi_values:
        thresholds["MNDWI"] = compute_otsu_threshold(mndwi_values)
    else:
        thresholds["MNDWI"] = 0.0

    if awei_values:
        thresholds["AWEI"] = compute_otsu_threshold(awei_values)
    else:
        thresholds["AWEI"] = 0.0

    return thresholds


# ─── CORE SENTINEL-2 DETECTION PIPELINE ──────────────────────────────────────

def detect_flood(
    aoi,
    pre_start: str,
    pre_end: str,
    post_start: str,
    post_end: str,
    custom_thresholds: Optional[Dict[str, float]] = None,
):
    """
    Estimate potential new water using Sentinel-2 surface reflectance.
    Supports dynamic Otsu thresholds or standard defaults for NDWI, MNDWI, and AWEI.

    Both composites are analyzed on one fixed 20 m grid and clipped
    to the supplied AOI. This is grid alignment, not a guarantee of
    geometric co-registration or confirmed flood extent.
    """
    # Active thresholds: custom (e.g. from scene Otsu) or standard defaults
    active_thresh = {
        "NDWI": -0.10,
        "MNDWI": 0.0,
        "AWEI": 0.0,
    }
    if custom_thresholds:
        active_thresh.update(custom_thresholds)

    def prepare_image(image):
        scl = image.select("SCL")

        clear_mask = (
            scl.neq(0)
            .And(scl.neq(1))
            .And(scl.neq(3))
            .And(scl.neq(7))
            .And(scl.neq(8))
            .And(scl.neq(9))
            .And(scl.neq(10))
            .And(scl.neq(11))
        )

        image = image.updateMask(clear_mask)

        green = image.select("B3")
        nir = image.select("B8")
        swir1 = image.select("B11")
        swir2 = image.select("B12")

        # Avoid division by zero.
        ndwi_denominator = green.add(nir)
        mndwi_denominator = green.add(swir1)

        ndwi = (
            green.subtract(nir)
            .divide(ndwi_denominator)
            .updateMask(ndwi_denominator.neq(0))
            .rename("NDWI")
        )

        mndwi = (
            green.subtract(swir1)
            .divide(mndwi_denominator)
            .updateMask(mndwi_denominator.neq(0))
            .rename("MNDWI")
        )

        # AWEI: Automated Water Extraction Index (Feyisa et al., 2014)
        # Suppresses shadow and dark surface false positives:
        # AWEI = 4 * (Green - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)
        awei = (
            green.subtract(swir1).multiply(4)
            .subtract(nir.multiply(0.25).add(swir2.multiply(2.75)))
            .rename("AWEI")
        )

        return image.addBands([ndwi, mndwi, awei])

    def build_composite(start, end):
        collection = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(aoi)
            .filterDate(start, end)
            .filter(
                ee.Filter.lte(
                    "CLOUDY_PIXEL_PERCENTAGE",
                    CLOUD_LIMIT_PERCENT,
                )
            )
            .map(prepare_image)
        )

        count = collection.size().getInfo()

        if count == 0:
            return 0, None

        composite = (
            collection
            .median()
            .select(["NDWI", "MNDWI", "AWEI"])
            .clip(aoi)
        )

        return count, composite

    pre_count, pre = build_composite(pre_start, pre_end)
    post_count, post = build_composite(post_start, post_end)

    if pre is None or post is None:
        return {
            "status": "insufficient_imagery",
            "pre_image_count": pre_count,
            "post_image_count": post_count,
            "message": (
                "No suitable Sentinel-2 images found in one "
                "or both date windows."
            ),
            "note": (
                "Try different date windows or inspect imagery "
                "availability. No area estimate was produced."
            ),
        }

    # Set the same CRS and affine grid for both composites.
    pre = pre.setDefaultProjection(
        crs=ANALYSIS_CRS,
        crsTransform=GRID_TRANSFORM,
    )

    post = post.setDefaultProjection(
        crs=ANALYSIS_CRS,
        crsTransform=GRID_TRANSFORM,
    )

    pre_valid = (
        pre.select("NDWI").mask()
        .And(pre.select("MNDWI").mask())
        .And(pre.select("AWEI").mask())
    )

    post_valid = (
        post.select("NDWI").mask()
        .And(post.select("MNDWI").mask())
        .And(post.select("AWEI").mask())
    )

    aoi_area_m2 = aoi.area(maxError=1).getInfo()

    if not aoi_area_m2 or aoi_area_m2 <= 0:
        return {
            "status": "invalid_aoi",
            "pre_image_count": pre_count,
            "post_image_count": post_count,
            "message": "AOI area is empty or invalid.",
        }

    def calculate_coverage(valid_mask):
        valid_area = (
            ee.Image.pixelArea()
            .updateMask(valid_mask)
            .reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=aoi,
                crs=ANALYSIS_CRS,
                crsTransform=GRID_TRANSFORM,
                maxPixels=1_000_000_000,
                tileScale=4,
            )
            .get("area")
            .getInfo()
        )

        valid_area = valid_area or 0.0

        return round(
            min(100.0, 100.0 * valid_area / aoi_area_m2),
            2,
        )

    pre_coverage = calculate_coverage(pre_valid)
    post_coverage = calculate_coverage(post_valid)

    if (
        pre_coverage < MINIMUM_VALID_COVERAGE_PERCENT
        or post_coverage < MINIMUM_VALID_COVERAGE_PERCENT
    ):
        return {
            "status": "insufficient_coverage",
            "pre_image_count": pre_count,
            "post_image_count": post_count,
            "pre_valid_coverage_percent": pre_coverage,
            "post_valid_coverage_percent": post_coverage,
            "message": (
                "Valid-pixel coverage is below the configured "
                "threshold in at least one date window."
            ),
            "note": (
                "No area estimate was produced because coverage "
                "was insufficient."
            ),
        }

    # Water classification applying per-scene thresholds:
    pre_water = (
        pre.select("MNDWI").gt(active_thresh["MNDWI"])
        .And(pre.select("NDWI").gt(active_thresh["NDWI"]))
        .Or(pre.select("AWEI").gt(active_thresh["AWEI"]))
    )

    post_water = (
        post.select("MNDWI").gt(active_thresh["MNDWI"])
        .And(post.select("NDWI").gt(active_thresh["NDWI"]))
        .Or(post.select("AWEI").gt(active_thresh["AWEI"]))
    )

    # Only compare pixels that are valid in both periods.
    comparable_pixels = pre_valid.And(post_valid)

    new_water = (
        post_water
        .And(pre_water.Not())
        .And(comparable_pixels)
        .rename("new_water")
        .clip(aoi)
    )

    area_m2 = (
        ee.Image.pixelArea()
        .updateMask(new_water)
        .rename("area")
        .reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=aoi,
            crs=ANALYSIS_CRS,
            crsTransform=GRID_TRANSFORM,
            maxPixels=1_000_000_000,
            tileScale=4,
        )
        .get("area")
        .getInfo()
    )

    area_m2 = area_m2 or 0.0

    return {
        "status": "analysis_complete",
        "pre_image_count": pre_count,
        "post_image_count": post_count,
        "pre_valid_coverage_percent": pre_coverage,
        "post_valid_coverage_percent": post_coverage,
        "potential_new_water_area_m2": round(area_m2, 2),
        "potential_new_water_area_km2": round(
            area_m2 / 1_000_000, 4
        ),
        "analysis_scale_m": ANALYSIS_SCALE_M,
        "cloud_limit_percent": CLOUD_LIMIT_PERCENT,
        "thresholds_applied": active_thresh,
        "message": (
            "Potential new-water area calculated inside the AOI "
            "using a common analysis grid and scene thresholding."
        ),
        "note": (
            "Preliminary index-based water-change estimate, not "
            "confirmed flood extent. A common pixel grid does not "
            "guarantee geometric co-registration. Seasonal water, "
            "cloud contamination, mixed pixels and classification "
            "errors may affect results. Independent validation "
            "is required."
        ),
    }


def get_flood_status():
    return {
        "status": "Flood service is working!"
    }
