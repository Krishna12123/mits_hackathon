import ee


CLOUD_LIMIT_PERCENT = 80
ANALYSIS_SCALE_M = 20
MINIMUM_VALID_COVERAGE_PERCENT = 50

# A fixed reference grid makes pre/post analysis use the same
# CRS, pixel size, and grid origin.
# EPSG:32645 is UTM Zone 45N, suitable for the eastern Nepal AOI.
ANALYSIS_CRS = "EPSG:32645"
GRID_TRANSFORM = [20, 0, 200000, 0, -20, 3100000]


def detect_flood(aoi, pre_start, pre_end, post_start, post_end):
    """
    Estimate potential new water using Sentinel-2 surface reflectance.

    Both composites are analyzed on one fixed 20 m grid and clipped
    to the supplied AOI. This is grid alignment, not a guarantee of
    geometric co-registration or confirmed flood extent.
    """

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
        swir = image.select("B11")

        # Avoid division by zero.
        ndwi_denominator = green.add(nir)
        mndwi_denominator = green.add(swir)

        ndwi = (
            green.subtract(nir)
            .divide(ndwi_denominator)
            .updateMask(ndwi_denominator.neq(0))
            .rename("NDWI")
        )

        mndwi = (
            green.subtract(swir)
            .divide(mndwi_denominator)
            .updateMask(mndwi_denominator.neq(0))
            .rename("MNDWI")
        )

        return image.addBands([ndwi, mndwi])

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
            .select(["NDWI", "MNDWI"])
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
    # Earth Engine evaluates these operations when a reducer requests
    # pixels; this does not perform image-to-image feature matching.
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
    )

    post_valid = (
        post.select("NDWI").mask()
        .And(post.select("MNDWI").mask())
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

    pre_water = (
        pre.select("MNDWI").gt(0)
        .And(pre.select("NDWI").gt(-0.1))
    )

    post_water = (
        post.select("MNDWI").gt(0)
        .And(post.select("NDWI").gt(-0.1))
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
        "message": (
            "Potential new-water area calculated inside the AOI "
            "using a common analysis grid."
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
