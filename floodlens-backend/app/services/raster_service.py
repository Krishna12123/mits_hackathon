"""
Raster Validation and Alignment Service
Provides robust verification for Earth Engine and local raster outputs:
- GeoTIFF structure, CRS, and affine transform parsing.
- Width, height, pixel size, extent, band count, and datatype validation.
- Expected pixel-value ranges (strict binary {0, 1} for masks).
- Nodata isolation and valid-data coverage checks (never treats nodata as water or land).
- Grid compatibility validation for pixel-wise ensemble and change detection.
  (Enforces: Matching CRS alone is NOT sufficient to prove alignment).
- Safe resampling for categorical masks (nearest-neighbor) and continuous data (bilinear).
"""

import math
import struct
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional, Set, Union

logger = logging.getLogger(__name__)

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    PIL_AVAILABLE = False


@dataclass
class RasterMetadata:
    """Encapsulates parsed spatial, structural, and radiometric metadata of a raster."""
    filepath: Optional[str] = None
    crs: Optional[str] = None  # e.g. "EPSG:4326", "EPSG:32645"
    width: int = 0
    height: int = 0
    bands: int = 1
    dtype: str = "uint8"  # "uint8", "float32", etc.
    transform: Optional[Tuple[float, float, float, float, float, float]] = None
    # [scale_x, 0.0, origin_x, 0.0, -scale_y, origin_y]
    pixel_size: Optional[Tuple[float, float]] = None  # (scale_x, scale_y)
    extent: Optional[Tuple[float, float, float, float]] = None  # (min_x, min_y, max_x, max_y)
    nodata: Optional[float] = None
    total_pixels: int = 0
    valid_pixels: int = 0
    valid_coverage_pct: float = 100.0
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    unique_values: Set[Any] = field(default_factory=set)


@dataclass
class GridDefinition:
    """Canonical grid target for pixel-wise operations."""
    crs: str
    transform: Tuple[float, float, float, float, float, float]
    width: int
    height: int

    @property
    def pixel_size(self) -> Tuple[float, float]:
        return (abs(self.transform[0]), abs(self.transform[4]))

    @property
    def origin(self) -> Tuple[float, float]:
        return (self.transform[2], self.transform[5])

    @property
    def extent(self) -> Tuple[float, float, float, float]:
        min_x = self.transform[2]
        max_y = self.transform[5]
        max_x = min_x + self.width * abs(self.transform[0])
        min_y = max_y - self.height * abs(self.transform[4])
        return (min_x, min_y, max_x, max_y)


@dataclass
class RasterValidationResult:
    """Detailed result of a raster validation check."""
    is_valid: bool
    error_message: Optional[str] = None
    metadata: Optional[RasterMetadata] = None


def parse_raster_metadata(filepath_or_bytes: Union[Path, str, bytes]) -> RasterMetadata:
    """
    Parses structural, spatial, and radiometric metadata from a GeoTIFF.
    Extracts GeoTIFF tags:
    - 256 (ImageWidth), 257 (ImageLength), 258 (BitsPerSample), 277 (SamplesPerPixel)
    - 33550 (ModelPixelScaleTag), 33922 (ModelTiepointTag), 34264 (ModelTransformationTag)
    - 34735 (GeoKeyDirectoryTag: extracts EPSG code)
    - 42113 (GDAL_NODATA)
    """
    if not PIL_AVAILABLE or Image is None:
        raise RuntimeError("Pillow (PIL) is required for raster parsing.")

    if isinstance(filepath_or_bytes, (str, Path)):
        p = Path(filepath_or_bytes)
        if not p.exists() or p.stat().st_size <= 100:
            raise ValueError(f"File {p} does not exist or is too small to be a valid GeoTIFF.")
        with open(p, "rb") as f:
            header = f.read(4)
            if header not in (b"II*\x00", b"MM\x00*"):
                raise ValueError(f"File {p} does not contain valid TIFF magic byte header.")
        img = Image.open(p)
        filepath_str = str(p)
    else:
        import io
        if len(filepath_or_bytes) <= 100:
            raise ValueError("Byte stream too small to be a valid GeoTIFF.")
        if filepath_or_bytes[:4] not in (b"II*\x00", b"MM\x00*"):
            raise ValueError("Byte stream does not contain valid TIFF magic header.")
        img = Image.open(io.BytesIO(filepath_or_bytes))
        filepath_str = None

    try:
        width, height = img.size
        bands = len(img.getbands()) if hasattr(img, "getbands") else 1
        mode = img.mode

        # Determine dtype
        if mode == "L":
            dtype = "uint8"
        elif mode == "F":
            dtype = "float32"
        elif mode == "I":
            dtype = "int32"
        else:
            dtype = mode

        tags = getattr(img, "tag_v2", {})

        # 1. Parse Spatial Reference (CRS)
        crs = None
        geokey = tags.get(34735)
        if geokey:
            # GeoKey directory contains (KeyID, TagLoc, Count, Value/Offset)
            try:
                num_keys = geokey[3] if len(geokey) >= 4 else 0
                keys = {}
                for i in range(num_keys):
                    offset = 4 + i * 4
                    if offset + 3 < len(geokey):
                        k_id = geokey[offset]
                        val = geokey[offset + 3]
                        keys[k_id] = val
                epsg_code = keys.get(3072) or keys.get(2048)
                if epsg_code:
                    crs = f"EPSG:{epsg_code}"
            except Exception as e:
                logger.debug(f"Could not parse GeoKeyDirectoryTag: {e}")

        # 2. Parse Affine Transform & Pixel Scale
        transform = None
        pixel_size = None
        extent = None

        scale_tag = tags.get(33550)  # ModelPixelScaleTag [scale_x, scale_y, scale_z]
        tie_tag = tags.get(33922)    # ModelTiepointTag [i, j, k, x, y, z]
        trans_tag = tags.get(34264)  # ModelTransformationTag (4x4 matrix)

        if scale_tag and tie_tag and len(scale_tag) >= 2 and len(tie_tag) >= 6:
            scale_x = float(scale_tag[0])
            scale_y = float(scale_tag[1])
            origin_x = float(tie_tag[3])
            origin_y = float(tie_tag[4])
            transform = (scale_x, 0.0, origin_x, 0.0, -scale_y, origin_y)
            pixel_size = (scale_x, scale_y)
            min_x = origin_x
            max_y = origin_y
            max_x = origin_x + width * scale_x
            min_y = origin_y - height * scale_y
            extent = (min_x, min_y, max_x, max_y)
        elif trans_tag and len(trans_tag) >= 16:
            scale_x = abs(float(trans_tag[0]))
            scale_y = abs(float(trans_tag[5]))
            origin_x = float(trans_tag[3])
            origin_y = float(trans_tag[7])
            transform = (scale_x, 0.0, origin_x, 0.0, -scale_y, origin_y)
            pixel_size = (scale_x, scale_y)
            min_x = origin_x
            max_y = origin_y
            max_x = origin_x + width * scale_x
            min_y = origin_y - height * scale_y
            extent = (min_x, min_y, max_x, max_y)

        # 3. Parse Nodata
        nodata = None
        nodata_tag = tags.get(42113)  # GDAL_NODATA
        if nodata_tag:
            try:
                if isinstance(nodata_tag, bytes):
                    nodata_str = nodata_tag.decode("ascii", errors="ignore").strip("\x00 \r\n")
                else:
                    nodata_str = str(nodata_tag).strip("\x00 \r\n")
                nodata = float(nodata_str)
            except Exception:
                nodata = None

        # 4. Pixel Inspection
        total_pixels = width * height
        raw_bytes = img.tobytes()
        unique_vals = set(raw_bytes) if dtype == "uint8" else set()

        if dtype == "uint8":
            min_val = float(min(unique_vals)) if unique_vals else None
            max_val = float(max(unique_vals)) if unique_vals else None
            if nodata is not None and nodata in unique_vals:
                nodata_count = raw_bytes.count(int(nodata))
                valid_pixels = total_pixels - nodata_count
            else:
                valid_pixels = total_pixels
        else:
            # Float32 or other mode
            import array
            arr = array.array("f")
            arr.frombytes(raw_bytes)
            valid_arr = [x for x in arr if not math.isnan(x) and (nodata is None or x != nodata)]
            valid_pixels = len(valid_arr)
            min_val = min(valid_arr) if valid_arr else None
            max_val = max(valid_arr) if valid_arr else None
            unique_vals = set(valid_arr[:1000])

        valid_coverage_pct = round((valid_pixels / max(1, total_pixels)) * 100.0, 2)

        return RasterMetadata(
            filepath=filepath_str,
            crs=crs,
            width=width,
            height=height,
            bands=bands,
            dtype=dtype,
            transform=transform,
            pixel_size=pixel_size,
            extent=extent,
            nodata=nodata,
            total_pixels=total_pixels,
            valid_pixels=valid_pixels,
            valid_coverage_pct=valid_coverage_pct,
            min_val=min_val,
            max_val=max_val,
            unique_values=unique_vals,
        )
    finally:
        img.close()


def check_grid_alignment(
    meta_a: Union[RasterMetadata, GridDefinition],
    meta_b: Union[RasterMetadata, GridDefinition],
    tolerance: float = 1e-5,
) -> Tuple[bool, Optional[str]]:
    """
    Verifies that two rasters share the identical grid definition for pixel-wise operations.
    Enforces that matching CRS alone is NOT sufficient to prove alignment.
    Checks:
    1. CRS equality.
    2. Pixel resolution (scale_x, scale_y) within tolerance.
    3. Origin tiepoints (origin_x, origin_y) within tolerance.
    4. Matrix dimensions (width, height).
    5. Geospatial bounding extent.
    """
    if meta_a.crs != meta_b.crs:
        return False, f"CRS mismatch: '{meta_a.crs}' vs '{meta_b.crs}'."

    if not meta_a.transform or not meta_b.transform:
        return False, "One or both rasters lack valid affine transformation parameters."

    # Pixel resolution check
    scale_x_diff = abs(meta_a.transform[0] - meta_b.transform[0])
    scale_y_diff = abs(meta_a.transform[4] - meta_b.transform[4])
    if scale_x_diff > tolerance or scale_y_diff > tolerance:
        return (
            False,
            f"Pixel size mismatch: {meta_a.pixel_size} vs {meta_b.pixel_size}. "
            "Matching CRS alone is not sufficient to prove alignment.",
        )

    # Origin / phase alignment check
    origin_x_diff = abs(meta_a.transform[2] - meta_b.transform[2])
    origin_y_diff = abs(meta_a.transform[5] - meta_b.transform[5])
    if origin_x_diff > tolerance or origin_y_diff > tolerance:
        return (
            False,
            f"Grid origin / phase shift mismatch: ({meta_a.transform[2]}, {meta_a.transform[5]}) vs "
            f"({meta_b.transform[2]}, {meta_b.transform[5]}). "
            "Matching CRS alone is not sufficient to prove alignment.",
        )

    # Dimension check
    if meta_a.width != meta_b.width or meta_a.height != meta_b.height:
        return (
            False,
            f"Dimension mismatch: ({meta_a.width}x{meta_a.height}) vs ({meta_b.width}x{meta_b.height}).",
        )

    return True, None


def validate_raster(
    filepath_or_bytes: Union[Path, str, bytes],
    expected_type: str = "mask",  # "mask" (categorical {0, 1}) or "continuous"
    target_grid: Optional[Union[RasterMetadata, GridDefinition]] = None,
    min_valid_coverage: float = 0.0,
    allowed_values: Optional[Set[Any]] = None,
    value_range: Optional[Tuple[float, float]] = None,
) -> RasterValidationResult:
    """
    Performs comprehensive structural, spatial, radiometric, and semantic validation.
    
    Rejects:
    - Empty, truncated, or non-TIFF files.
    - Rasters with missing CRS or affine transforms.
    - Non-single-band images for masks.
    - Datatypes other than uint8 for categorical masks.
    - Masks containing values other than {0, 1} (or nodata).
    - Rasters with valid data coverage below min_valid_coverage.
    - Incompatible grids when target_grid is supplied.
    """
    try:
        meta = parse_raster_metadata(filepath_or_bytes)
    except Exception as e:
        return RasterValidationResult(is_valid=False, error_message=f"Corrupt or unreadable raster: {e}")

    # 1. Dimension & Spatial Referencing Checks
    if meta.width <= 0 or meta.height <= 0:
        return RasterValidationResult(
            is_valid=False,
            error_message=f"Invalid raster dimensions: ({meta.width}x{meta.height}).",
            metadata=meta,
        )

    if not meta.crs:
        return RasterValidationResult(
            is_valid=False,
            error_message="Missing CRS (spatial referencing) in GeoTIFF metadata.",
            metadata=meta,
        )

    if not meta.transform or meta.pixel_size is None or meta.pixel_size[0] <= 0 or meta.pixel_size[1] <= 0:
        return RasterValidationResult(
            is_valid=False,
            error_message="Missing or degenerate affine transform / pixel scale.",
            metadata=meta,
        )

    # 2. Band Count & Datatype
    if expected_type == "mask":
        if meta.bands != 1:
            return RasterValidationResult(
                is_valid=False,
                error_message=f"Categorical mask must have 1 band, found {meta.bands}.",
                metadata=meta,
            )
        if meta.dtype != "uint8":
            return RasterValidationResult(
                is_valid=False,
                error_message=f"Categorical mask must be uint8, found {meta.dtype}.",
                metadata=meta,
            )

    # 3. Expected Value Ranges & Nodata
    if expected_type == "mask":
        valid_set = allowed_values or {0, 1}
        # Check that unique values strictly match valid_set (plus optional nodata)
        non_nodata_values = {v for v in meta.unique_values if meta.nodata is None or v != meta.nodata}
        invalid_values = non_nodata_values - valid_set
        if invalid_values:
            return RasterValidationResult(
                is_valid=False,
                error_message=(
                    f"Invalid pixel values in categorical mask: {invalid_values}. "
                    f"Expected only {valid_set} (nodata: {meta.nodata})."
                ),
                metadata=meta,
            )

    if value_range is not None:
        min_allowed, max_allowed = value_range
        if meta.min_val is not None and meta.min_val < min_allowed:
            return RasterValidationResult(
                is_valid=False,
                error_message=f"Minimum pixel value {meta.min_val} below allowed {min_allowed}.",
                metadata=meta,
            )
        if meta.max_val is not None and meta.max_val > max_allowed:
            return RasterValidationResult(
                is_valid=False,
                error_message=f"Maximum pixel value {meta.max_val} exceeds allowed {max_allowed}.",
                metadata=meta,
            )

    # 4. Valid-data Coverage Check
    if meta.valid_coverage_pct < min_valid_coverage:
        return RasterValidationResult(
            is_valid=False,
            error_message=(
                f"Valid data coverage ({meta.valid_coverage_pct}%) is below required "
                f"minimum ({min_valid_coverage}%)."
            ),
            metadata=meta,
        )

    # 5. Target Grid Alignment Check
    if target_grid is not None:
        is_aligned, reason = check_grid_alignment(meta, target_grid)
        if not is_aligned:
            return RasterValidationResult(
                is_valid=False,
                error_message=f"Grid compatibility failure: {reason}",
                metadata=meta,
            )

    return RasterValidationResult(is_valid=True, metadata=meta)


def validate_layer_grid_consistency(
    layer_paths: Dict[str, str],
    expected_type: str = "mask",
    target_grid: Optional[GridDefinition] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Validates that a collection of output raster layers are mutually grid-compatible.
    Ensures that optical masks, SAR mask, ensemble, baseline, and final flood
    can be combined pixel-wise without geometric distortion.
    """
    if not layer_paths:
        return True, None

    parsed_layers: Dict[str, RasterMetadata] = {}

    for name, path in layer_paths.items():
        if not path or not Path(path).exists():
            continue
        val = validate_raster(path, expected_type=expected_type, target_grid=target_grid)
        if not val.is_valid:
            return False, f"Layer '{name}' ({path}) failed validation: {val.error_message}"
        parsed_layers[name] = val.metadata

    if len(parsed_layers) <= 1:
        return True, None

    # Pairwise grid compatibility check
    layer_items = list(parsed_layers.items())
    ref_name, ref_meta = layer_items[0]

    for name, meta in layer_items[1:]:
        aligned, reason = check_grid_alignment(ref_meta, meta)
        if not aligned:
            return False, f"Incompatible grid alignment between '{ref_name}' and '{name}': {reason}"

    return True, None


def resample_grid(
    grid: List[List[Any]],
    src_meta: RasterMetadata,
    dst_grid: GridDefinition,
    method: str = "nearest",
    nodata_value: Optional[Any] = None,
) -> List[List[Any]]:
    """
    Resamples a 2D raster grid from src_meta geometry to dst_grid geometry.
    - Categorical/binary masks MUST use method="nearest" to preserve discrete {0, 1} labels.
    - Continuous layers can use method="bilinear".
    - Nodata pixels are strictly preserved and never treated as water or land.
    """
    src_rows = src_meta.height
    src_cols = src_meta.width
    dst_rows = dst_grid.height
    dst_cols = dst_grid.width

    if src_meta.crs != dst_grid.crs:
        raise ValueError(f"Cross-CRS reprojection not supported in pure Python: {src_meta.crs} -> {dst_grid.crs}")

    src_scale_x = src_meta.transform[0]
    src_scale_y = abs(src_meta.transform[4])
    src_orig_x = src_meta.transform[2]
    src_orig_y = src_meta.transform[5]

    dst_scale_x = dst_grid.transform[0]
    dst_scale_y = abs(dst_grid.transform[4])
    dst_orig_x = dst_grid.transform[2]
    dst_orig_y = dst_grid.transform[5]

    nodata = nodata_value if nodata_value is not None else src_meta.nodata
    fill_nodata = nodata if nodata is not None else 0

    resampled = [[fill_nodata for _ in range(dst_cols)] for _ in range(dst_rows)]

    for dst_r in range(dst_rows):
        # Y coordinate at center of destination pixel
        geo_y = dst_orig_y - (dst_r + 0.5) * dst_scale_y

        # Corresponding fractional row in source grid
        src_r_frac = (src_orig_y - geo_y) / src_scale_y - 0.5

        for dst_c in range(dst_cols):
            # X coordinate at center of destination pixel
            geo_x = dst_orig_x + (dst_c + 0.5) * dst_scale_x

            # Corresponding fractional column in source grid
            src_c_frac = (geo_x - src_orig_x) / src_scale_x - 0.5

            if method == "nearest":
                src_r = int(round(src_r_frac))
                src_c = int(round(src_c_frac))

                if 0 <= src_r < src_rows and 0 <= src_c < src_cols:
                    val = grid[src_r][src_c]
                    resampled[dst_r][dst_c] = val
                else:
                    resampled[dst_r][dst_c] = fill_nodata

            elif method == "bilinear":
                r0 = int(math.floor(src_r_frac))
                c0 = int(math.floor(src_c_frac))
                r1 = r0 + 1
                c1 = c0 + 1

                dr = src_r_frac - r0
                dc = src_c_frac - c0

                if 0 <= r0 < src_rows and 0 <= r1 < src_rows and 0 <= c0 < src_cols and 0 <= c1 < src_cols:
                    v00 = grid[r0][c0]
                    v01 = grid[r0][c1]
                    v10 = grid[r1][c0]
                    v11 = grid[r1][c1]

                    # If any neighbor is nodata, treat as nodata
                    if nodata is not None and (v00 == nodata or v01 == nodata or v10 == nodata or v11 == nodata):
                        resampled[dst_r][dst_c] = nodata
                    else:
                        top = v00 * (1.0 - dc) + v01 * dc
                        bottom = v10 * (1.0 - dc) + v11 * dc
                        val = top * (1.0 - dr) + bottom * dr
                        resampled[dst_r][dst_c] = round(val, 4)
                else:
                    resampled[dst_r][dst_c] = fill_nodata

    return resampled
