"""
Report Generation Service
Generates Settlement Impact CSV Reports (name, population, flood %, flag),
GeoJSON summaries, and handles report file artifact management.
"""
import os
import csv
import io
import datetime
from typing import Optional, List, Dict, Any, Union
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.settlement import Settlement

REPORTS_DIR = "outputs/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)


def build_artifact_provenance(
    layer_key: str,
    job_context: Dict[str, Any],
    raster_meta: Optional[Any] = None,
    status: str = "ready",
    unavailable_reason: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Builds standardized, truthful, and non-sensitive provenance metadata for any generated or attempted artifact.
    
    Includes:
    - Actual source dataset (Earth Engine, Sentinel-1, Sentinel-2, JRC, or Synthetic Simulation)
    - Sensor specification and acquisition modes
    - Processing methods, band expressions, and classification assumptions
    - Dates (pre-flood baseline and post-flood observation windows)
    - Spatial extent, CRS, resolution, and affine transform
    - Applied classification thresholds
    - List of actual inputs used (for ensemble consensus and final flood mask)
    - Honest status and failure explanation for unavailable or partial artifacts
    
    Guarantees zero credentials or secrets are leaked.
    """
    data_source = job_context.get("data_source", "synthetic_demo")
    is_live = (data_source == "gee_live")

    # Base spatial reference
    spatial_info: Dict[str, Any] = {
        "crs": "EPSG:4326" if not is_live else "EPSG:32645",
        "aoi_center": {
            "lat": float(job_context.get("lat") or job_context.get("aoi_lat", 26.3)),
            "lon": float(job_context.get("lon") or job_context.get("aoi_lon", 85.8)),
        },
        "aoi_radius_km": float(job_context.get("radius_km") or job_context.get("aoi_radius_km", 150.0)),
    }

    if raster_meta is not None:
        spatial_info.update({
            "crs": raster_meta.crs or spatial_info["crs"],
            "dimensions": {"width": raster_meta.width, "height": raster_meta.height},
            "pixel_size": list(raster_meta.pixel_size) if raster_meta.pixel_size else None,
            "transform": list(raster_meta.transform) if raster_meta.transform else None,
            "extent": list(raster_meta.extent) if raster_meta.extent else None,
            "nodata_value": raster_meta.nodata,
            "valid_data_coverage_pct": raster_meta.valid_coverage_pct,
        })

    # Dates with explicit timezone and GEE half-open query intervals in UTC
    pre_start_u = job_context.get("pre_start") or job_context.get("pre_date", "2026-10-11")
    pre_end_u = job_context.get("pre_end") or job_context.get("pre_date", "2026-10-11")
    post_start_u = job_context.get("post_start") or job_context.get("post_date", "2026-10-19")
    post_end_u = job_context.get("post_end") or job_context.get("post_date", "2026-10-19")

    try:
        pre_e_date = datetime.date.fromisoformat(str(pre_end_u)[:10])
        pre_gee_end = (pre_e_date + datetime.timedelta(days=1)).isoformat()
    except Exception:
        pre_gee_end = str(pre_end_u)

    try:
        post_e_date = datetime.date.fromisoformat(str(post_end_u)[:10])
        post_gee_end = (post_e_date + datetime.timedelta(days=1)).isoformat()
    except Exception:
        post_gee_end = str(post_end_u)

    dates_info = {
        "timezone": "UTC",
        "pre_flood_window": [str(pre_start_u)[:10], str(pre_end_u)[:10]],
        "post_flood_window": [str(post_start_u)[:10], str(post_end_u)[:10]],
        "gee_query_intervals_utc": {
            "pre_flood_half_open": [f"{str(pre_start_u)[:10]}T00:00:00Z", f"{pre_gee_end}T00:00:00Z"],
            "post_flood_half_open": [f"{str(post_start_u)[:10]}T00:00:00Z", f"{post_gee_end}T00:00:00Z"],
        },
    }

    otsu_thresh = job_context.get("otsu_thresholds", {})

    # Layer-specific provenance specifications
    provenance_catalog: Dict[str, Dict[str, Any]] = {
        "ndwi": {
            "dataset": "COPERNICUS/S2_SR_HARMONIZED" if is_live else "Synthetic Optical Simulation",
            "sensor": "Sentinel-2 MultiSpectral Instrument (MSI Level-2A)" if is_live else "Synthetic Simulator",
            "bands": ["B3 (Green)", "B8 (NIR)"],
            "processing_method": "Normalized Difference Water Index: (B3 - B8) / (B3 + B8) > threshold",
            "threshold_applied": float(otsu_thresh.get("NDWI", -0.10)),
            "resolution_m": 20.0 if is_live else 60.0,
        },
        "mndwi": {
            "dataset": "COPERNICUS/S2_SR_HARMONIZED" if is_live else "Synthetic Optical Simulation",
            "sensor": "Sentinel-2 MultiSpectral Instrument (MSI Level-2A)" if is_live else "Synthetic Simulator",
            "bands": ["B3 (Green)", "B11 (SWIR1)"],
            "processing_method": "Modified Normalized Difference Water Index: (B3 - B11) / (B3 + B11) > threshold",
            "threshold_applied": float(otsu_thresh.get("MNDWI", 0.0)),
            "resolution_m": 20.0 if is_live else 60.0,
        },
        "awei": {
            "dataset": "COPERNICUS/S2_SR_HARMONIZED" if is_live else "Synthetic Optical Simulation",
            "sensor": "Sentinel-2 MultiSpectral Instrument (MSI Level-2A)" if is_live else "Synthetic Simulator",
            "bands": ["B3 (Green)", "B8 (NIR)", "B11 (SWIR1)", "B12 (SWIR2)"],
            "processing_method": "Automated Water Extraction Index: 4*(B3 - B11) - (0.25*B8 + 2.75*B12) > threshold",
            "threshold_applied": float(otsu_thresh.get("AWEI", 0.0)),
            "resolution_m": 20.0 if is_live else 60.0,
        },
        "sar": {
            "dataset": "COPERNICUS/S1_GRD" if is_live else "Synthetic SAR Simulation",
            "sensor": "Sentinel-1 C-band Synthetic Aperture Radar (SAR GRD)" if is_live else "Synthetic Simulator",
            "instrument_mode": "IW (Interferometric Wide Swath)",
            "polarizations": ["VV", "VH"],
            "processing_method": "Specular radar backscatter thresholding in VV (VV < -16.0 dB) with valid nodata masking",
            "threshold_applied": float(otsu_thresh.get("SAR", -16.0)),
            "resolution_m": 20.0 if is_live else 60.0,
        },
        "jrc_baseline": {
            "dataset": "JRC/GSW1_4/GlobalSurfaceWater",
            "sensor": "Landsat 38-year Global Surface Water (European Commission JRC)",
            "processing_method": "Permanent water occurrence baseline filter (occurrence >= 80%)",
            "resolution_m": 30.0,
        },
        "ensemble": {
            "dataset": "Multi-Sensor Consensus Composite",
            "processing_method": "Majority vote consensus across valid index masks (water where votes >= min_votes)",
            "min_votes": int(job_context.get("min_votes", 2)),
            "inputs_used": job_context.get("inputs_used_ensemble", ["ndwi", "mndwi", "awei"]),
        },
        "final_flood": {
            "dataset": "Multi-Temporal Change Detection Composite",
            "processing_method": "Inundation change detection (post-flood water consensus excluding permanent water baseline)",
            "inputs_used": job_context.get("inputs_used_final", ["ensemble_water", "baseline_water"]),
            "flood_extent_km2": float(job_context.get("flood_extent_km2", 0.0)),
        },
        "csv": {
            "dataset": "OpenStreetMap Settlements & District Census Baseline",
            "processing_method": "Zonal spatial intersection between final flood mask polygons and settlement administrative boundaries",
            "settlements_evaluated": int(job_context.get("affected_settlements_count", 0)),
        },
    }

    layer_prov = provenance_catalog.get(layer_key.lower(), {
        "dataset": "Derived Analytical Product",
        "processing_method": f"Processing layer {layer_key}",
    })

    result_prov: Dict[str, Any] = {
        "layer_key": layer_key,
        "data_source": data_source,
        "status": status,
        "is_available": (status == "ready"),
        "dates": dates_info,
        "spatial": spatial_info,
        **layer_prov,
    }

    if status != "ready":
        result_prov["unavailable_reason"] = unavailable_reason or f"Artifact '{layer_key}' was not generated or failed validation."

    return result_prov


def determine_impact_flag(flooded_pct: float, severity: Optional[str] = None) -> str:
    """
    Computes human-readable severity flag badge based on flooded area percentage.
    - >= 70%: 🔴 Severely Affected
    - >= 30%: 🟡 Partially Affected
    - < 30%:  🟢 Safe
    """
    if severity and severity.lower() == "severe" or flooded_pct >= 70.0:
        return "🔴 Severely Affected"
    elif severity and severity.lower() in ("high", "medium") or flooded_pct >= 30.0:
        return "🟡 Partially Affected"
    else:
        return "🟢 Safe"


def build_settlement_csv_rows(db: Optional[Session] = None) -> List[dict]:
    """Retrieves settlements and formats data rows for CSV report."""
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        settlements = db.query(Settlement).order_by(Settlement.flooded_pct.desc()).all()
        rows = []
        for s in settlements:
            flag = determine_impact_flag(s.flooded_pct, s.severity)
            rows.append({
                "Settlement Name": s.name,
                "District": s.district,
                "State": s.state or "Bihar",
                "Population": s.population,
                "Flooded %": f"{s.flooded_pct:.1f}%",
                "Impact Flag": flag,
                "Homes Affected": s.homes,
                "Farmland Flooded (ha)": f"{s.farms_ha:.1f}",
            })
        return rows
    finally:
        if close_db:
            db.close()


def generate_settlement_impact_csv_string(db: Optional[Session] = None, job_id: Optional[str] = None) -> str:
    """Generates Settlement Impact CSV report as an in-memory string."""
    rows = build_settlement_csv_rows(db)
    output = io.StringIO()
    if job_id and db:
        try:
            from app.models.job import Job
            job = db.query(Job).filter(Job.id == job_id).first()
            if job and job.data_source:
                output.write(f"# Provenance Data Source: {job.data_source}\n")
        except Exception:
            pass
    fieldnames = [
        "Settlement Name",
        "District",
        "State",
        "Population",
        "Flooded %",
        "Impact Flag",
        "Homes Affected",
        "Farmland Flooded (ha)",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def generate_settlement_impact_csv(job_id: Optional[str] = None, db: Optional[Session] = None) -> str:
    """
    Generates and saves the Settlement Impact CSV Report to disk.
    Returns the absolute or relative file path to the generated CSV.
    """
    csv_content = generate_settlement_impact_csv_string(db, job_id=job_id)
    filename = f"settlement_impact_{job_id or 'latest'}.csv"
    file_path = os.path.join(REPORTS_DIR, filename)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(csv_content)

    return file_path
