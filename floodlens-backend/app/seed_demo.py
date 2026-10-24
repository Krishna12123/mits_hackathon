"""
FloodLens Demo Dataset Seeder
Generates pre-loaded, realistic flood event data for the Bihar / Nepal Terai region (October 2026).
Ensures the system is 100% demo-ready out of the box with zero external dependencies.
"""
import os
import json
import datetime
import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models.job import Job
from app.models.settlement import Settlement
from app.models.report import Report
from app.models.accuracy import AccuracyRecord
from app.services.detection_service import GeoTIFFExporter
from app.services.report_service import generate_settlement_impact_csv

logger = logging.getLogger("floodlens.seed")

DEMO_JOB_ID = "JOB-DEMO-2026"
AOI_LAT = 26.3
AOI_LON = 85.8
AOI_RADIUS_KM = 150.0

# 10 Representative settlements in the Koshi & Bagmati river basins
DEMO_SETTLEMENTS = [
    {
        "id": 1,
        "name": "Hayaghat",
        "district": "Darbhanga",
        "state": "Bihar",
        "population": 42300,
        "flooded_pct": 78.0,
        "severity": "severe",
        "homes": 8200,
        "farms_ha": 1240.0,
        "total_area_km2": 45.2,
        "flooded_area_km2": 35.3,
        "latitude": 26.0215,
        "longitude": 85.9525,
    },
    {
        "id": 2,
        "name": "Benipur",
        "district": "Darbhanga",
        "state": "Bihar",
        "population": 31500,
        "flooded_pct": 55.0,
        "severity": "high",
        "homes": 6100,
        "farms_ha": 890.0,
        "total_area_km2": 38.0,
        "flooded_area_km2": 20.9,
        "latitude": 26.0821,
        "longitude": 86.1342,
    },
    {
        "id": 3,
        "name": "Sheohar",
        "district": "Sitamarhi",
        "state": "Bihar",
        "population": 28900,
        "flooded_pct": 63.0,
        "severity": "high",
        "homes": 5400,
        "farms_ha": 760.0,
        "total_area_km2": 29.5,
        "flooded_area_km2": 18.6,
        "latitude": 26.5211,
        "longitude": 85.2917,
    },
    {
        "id": 4,
        "name": "Runnisaidpur",
        "district": "Sitamarhi",
        "state": "Bihar",
        "population": 18700,
        "flooded_pct": 41.0,
        "severity": "medium",
        "homes": 3900,
        "farms_ha": 510.0,
        "total_area_km2": 32.1,
        "flooded_area_km2": 13.2,
        "latitude": 26.3842,
        "longitude": 85.4831,
    },
    {
        "id": 5,
        "name": "Sitamarhi",
        "district": "Sitamarhi",
        "state": "Bihar",
        "population": 94200,
        "flooded_pct": 32.0,
        "severity": "medium",
        "homes": 17300,
        "farms_ha": 2100.0,
        "total_area_km2": 64.0,
        "flooded_area_km2": 20.5,
        "latitude": 26.6014,
        "longitude": 85.4952,
    },
    {
        "id": 6,
        "name": "Muzaffarpur",
        "district": "Muzaffarpur",
        "state": "Bihar",
        "population": 354000,
        "flooded_pct": 11.0,
        "severity": "low",
        "homes": 64000,
        "farms_ha": 3200.0,
        "total_area_km2": 110.5,
        "flooded_area_km2": 12.2,
        "latitude": 26.1209,
        "longitude": 85.3912,
    },
    {
        "id": 7,
        "name": "Pusa",
        "district": "Darbhanga",
        "state": "Bihar",
        "population": 14800,
        "flooded_pct": 88.0,
        "severity": "severe",
        "homes": 2700,
        "farms_ha": 430.0,
        "total_area_km2": 18.4,
        "flooded_area_km2": 16.2,
        "latitude": 25.9812,
        "longitude": 85.6721,
    },
    {
        "id": 8,
        "name": "Sakra",
        "district": "Muzaffarpur",
        "state": "Bihar",
        "population": 22100,
        "flooded_pct": 19.0,
        "severity": "low",
        "homes": 4100,
        "farms_ha": 620.0,
        "total_area_km2": 26.8,
        "flooded_area_km2": 5.1,
        "latitude": 25.9928,
        "longitude": 85.5214,
    },
    {
        "id": 9,
        "name": "Kanti",
        "district": "Muzaffarpur",
        "state": "Bihar",
        "population": 29400,
        "flooded_pct": 0.0,
        "severity": "safe",
        "homes": 5100,
        "farms_ha": 0.0,
        "total_area_km2": 31.4,
        "flooded_area_km2": 0.0,
        "latitude": 26.1925,
        "longitude": 85.2911,
    },
    {
        "id": 10,
        "name": "Belsand",
        "district": "Sitamarhi",
        "state": "Bihar",
        "population": 19800,
        "flooded_pct": 0.0,
        "severity": "safe",
        "homes": 3600,
        "farms_ha": 0.0,
        "total_area_km2": 24.2,
        "flooded_area_km2": 0.0,
        "latitude": 26.4521,
        "longitude": 85.4012,
    },
]

DEMO_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Darbhanga Inundation Zone",
                "severity": "severe",
                "area_km2": 124.5,
                "district": "Darbhanga",
                "water_type": "flood",
                "depth_estimate_m": 2.4,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [85.80, 26.05],
                        [86.15, 26.05],
                        [86.18, 26.35],
                        [85.85, 26.38],
                        [85.80, 26.05],
                    ]
                ],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Sitamarhi Bagmati Overflow",
                "severity": "high",
                "area_km2": 87.2,
                "district": "Sitamarhi",
                "water_type": "flood",
                "depth_estimate_m": 1.8,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [85.45, 26.45],
                        [85.78, 26.45],
                        [85.82, 26.75],
                        [85.48, 26.78],
                        [85.45, 26.45],
                    ]
                ],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Muzaffarpur Burhi Gandak Sector",
                "severity": "medium",
                "area_km2": 43.1,
                "district": "Muzaffarpur",
                "water_type": "flood",
                "depth_estimate_m": 1.1,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [85.25, 25.95],
                        [85.58, 25.95],
                        [85.62, 26.22],
                        [85.28, 26.25],
                        [85.25, 25.95],
                    ]
                ],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Permanent River Baseline (JRC)",
                "severity": "safe",
                "area_km2": 112.4,
                "district": "Regional",
                "water_type": "permanent",
                "depth_estimate_m": 4.5,
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [85.30, 26.65],
                    [85.60, 26.30],
                    [85.90, 26.00],
                    [86.20, 25.75],
                ],
            },
        },
    ],
}


def _generate_synthetic_rasters(job_id: str, bounds: tuple) -> dict:
    """Creates realistic binary and classified GeoTIFF files on disk for the demo job."""
    out_dir = os.path.join("outputs", "geotiff", job_id)
    os.makedirs(out_dir, exist_ok=True)

    rows, cols = 64, 64
    grid_patterns = {
        "ndwi_mask.tif": [[1 if (r + c) % 3 == 0 or 20 <= r <= 45 and 15 <= c <= 50 else 0 for c in range(cols)] for r in range(rows)],
        "mndwi_mask.tif": [[1 if (r * c) % 5 == 0 or 22 <= r <= 44 and 18 <= c <= 48 else 0 for c in range(cols)] for r in range(rows)],
        "awei_mask.tif": [[1 if 21 <= r <= 46 and 16 <= c <= 49 else 0 for c in range(cols)] for r in range(rows)],
        "sar_mask.tif": [[1 if 19 <= r <= 47 and 14 <= c <= 52 and (r + c) % 2 == 0 else 0 for c in range(cols)] for r in range(rows)],
        "ensemble_mask.tif": [[1 if 20 <= r <= 45 and 15 <= c <= 50 else 0 for c in range(cols)] for r in range(rows)],
        "jrc_baseline.tif": [[1 if 30 <= r <= 34 and 5 <= c <= 60 else 0 for c in range(cols)] for r in range(rows)],
        "final_flood_mask.tif": [[1 if (20 <= r <= 45 and 15 <= c <= 50) and not (30 <= r <= 34 and 5 <= c <= 60) else 0 for c in range(cols)] for r in range(rows)],
    }

    output_paths = {}
    for filename, grid in grid_patterns.items():
        filepath = os.path.join(out_dir, filename)
        GeoTIFFExporter.save_raster(grid, bounds, filepath, dtype="uint8")
        output_paths[filename.replace(".tif", "")] = filepath

    return output_paths


def seed_demo_data(db: Optional[Session] = None):
    """
    Main seeding routine: creates database records, raster files, and reports.
    Idempotent: updates existing records if already present.
    """
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        logger.info("🌱 Seeding demo flood dataset...")

        # 1. Bounds for AOI (Lat: 26.3, Lon: 85.8, Radius ~150km)
        min_lon, max_lon = 84.8, 86.8
        min_lat, max_lat = 25.3, 27.3
        bounds = (min_lon, min_lat, max_lon, max_lat)

        # 2. Generate GeoTIFF Rasters
        geotiff_paths = _generate_synthetic_rasters(DEMO_JOB_ID, bounds)

        # 3. Seed / Update Settlements
        for s_data in DEMO_SETTLEMENTS:
            s_id = s_data["id"]
            existing = db.query(Settlement).filter(Settlement.id == s_id).first()
            if existing:
                for k, v in s_data.items():
                    setattr(existing, k, v)
            else:
                db.add(Settlement(**s_data))
        db.commit()

        # 4. Generate Settlement Impact CSV Report
        os.makedirs(os.path.join("outputs", "reports"), exist_ok=True)
        csv_path = generate_settlement_impact_csv(job_id=DEMO_JOB_ID, db=db)

        # 5. Seed / Update Demo Job
        demo_job = db.query(Job).filter(Job.id == DEMO_JOB_ID).first()
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        if not demo_job:
            demo_job = Job(
                id=DEMO_JOB_ID,
                status="completed",
                stage="completed",
                progress=100,
                satellite="Sentinel-1 + Sentinel-2 Ensemble",
                index="ALL",
                threshold=0.3,
                cloud_pct=15.0,
                aoi_lat=AOI_LAT,
                aoi_lon=AOI_LON,
                aoi_radius_km=AOI_RADIUS_KM,
                pre_date="2026-10-11",
                post_date="2026-10-19",
                min_votes=2,
                flood_extent_km2=254.8,
                permanent_water_km2=112.4,
                total_water_km2=367.2,
                affected_districts=3,
                at_risk_population=1240000,
                ndwi_score=0.74,
                result_geojson=DEMO_GEOJSON,
                created_at=now_utc - datetime.timedelta(hours=2),
                updated_at=now_utc,
            )
            db.add(demo_job)
        else:
            demo_job.status = "completed"
            demo_job.stage = "completed"
            demo_job.progress = 100
            demo_job.satellite = "Sentinel-1 + Sentinel-2 Ensemble"
            demo_job.flood_extent_km2 = 254.8
            demo_job.permanent_water_km2 = 112.4
            demo_job.total_water_km2 = 367.2
            demo_job.affected_districts = 3
            demo_job.at_risk_population = 1240000
            demo_job.ndwi_score = 0.74
            demo_job.result_geojson = DEMO_GEOJSON
            demo_job.updated_at = now_utc
        db.commit()

        # 6. Seed Accuracy Gate Records (Multi-iteration retuning history)
        db.query(AccuracyRecord).filter(AccuracyRecord.job_id == DEMO_JOB_ID).delete()
        db.commit()

        acc_records = [
            AccuracyRecord(
                job_id=DEMO_JOB_ID,
                iteration=1,
                iou_score=0.684,
                f1_score=0.762,
                otsu_threshold=-0.150,
                passed_gate=False,
                created_at=now_utc - datetime.timedelta(minutes=15),
            ),
            AccuracyRecord(
                job_id=DEMO_JOB_ID,
                iteration=2,
                iou_score=0.741,
                f1_score=0.819,
                otsu_threshold=-0.180,
                passed_gate=False,
                created_at=now_utc - datetime.timedelta(minutes=10),
            ),
            AccuracyRecord(
                job_id=DEMO_JOB_ID,
                iteration=3,
                iou_score=0.812,
                f1_score=0.884,
                otsu_threshold=-0.220,
                passed_gate=True,
                created_at=now_utc - datetime.timedelta(minutes=5),
            ),
        ]
        db.add_all(acc_records)
        db.commit()

        # 7. Seed Reports with actual on-disk file paths and truthful provenance
        final_tif = geotiff_paths.get("final_flood_mask", os.path.join("outputs", "geotiff", DEMO_JOB_ID, "final_flood_mask.tif"))
        reports_seed = [
            {
                "id": "RPT-0041",
                "title": "Bihar Flood Impact Report",
                "type": "PDF",
                "size": "3.8 MB",
                "status": "ready",
                "file_path": None,
                "data_source": "synthetic_demo",
                "provenance": {
                    "data_source": "synthetic_demo",
                    "dataset": "Synthetic Scenario Generator (Bihar Flood Simulation)",
                    "processing_method": "Multi-criteria flood impact aggregation and demographic risk modeling",
                    "spatial": {"crs": "EPSG:4326", "region": "North Bihar Basin"},
                },
                "created_at": (now_utc - datetime.timedelta(hours=1)).isoformat(),
            },
            {
                "id": "RPT-0040",
                "title": "Flood Extent GeoTIFF",
                "type": "GeoTIFF",
                "size": "42.1 MB",
                "status": "ready",
                "file_path": final_tif,
                "data_source": "synthetic_demo",
                "provenance": {
                    "data_source": "synthetic_demo",
                    "dataset": "Synthetic Earth Observation Simulation",
                    "sensor": "Simulated Sentinel-2 MSI + Sentinel-1 SAR",
                    "processing_method": "Synthetic 4-index majority vote ensemble with permanent water subtraction",
                    "inputs_used": ["NDWI", "MNDWI", "AWEI", "SAR"],
                    "spatial": {
                        "crs": "EPSG:4326",
                        "dimensions": {"width": 64, "height": 64},
                        "resolution_m": 60.0,
                    },
                },
                "created_at": (now_utc - datetime.timedelta(hours=1, minutes=5)).isoformat(),
            },
            {
                "id": "RPT-0039",
                "title": "Affected Settlements Shapefile",
                "type": "Shapefile",
                "size": "5.2 MB",
                "status": "ready",
                "file_path": None,
                "data_source": "synthetic_demo",
                "provenance": {
                    "data_source": "synthetic_demo",
                    "dataset": "Synthetic OpenStreetMap Settlement Polygons",
                    "processing_method": "Vector polygonization of classified inundation raster clusters",
                },
                "created_at": (now_utc - datetime.timedelta(hours=1, minutes=8)).isoformat(),
            },
            {
                "id": "RPT-0038",
                "title": "Pre/Post Change Detection Report",
                "type": "PDF",
                "size": "2.1 MB",
                "status": "ready",
                "file_path": None,
                "data_source": "synthetic_demo",
                "provenance": {
                    "data_source": "synthetic_demo",
                    "dataset": "Synthetic Baseline Comparison",
                    "processing_method": "Multi-temporal pixel difference analysis against JRC permanent surface water",
                },
                "created_at": (now_utc - datetime.timedelta(hours=18)).isoformat(),
            },
            {
                "id": "RPT-0037",
                "title": "District Summary CSV",
                "type": "CSV",
                "size": "0.4 MB",
                "status": "ready",
                "file_path": csv_path,
                "data_source": "synthetic_demo",
                "provenance": {
                    "data_source": "synthetic_demo",
                    "dataset": "OpenStreetMap Administrative Settlements & Census",
                    "processing_method": "Zonal intersection and settlement flood percentage calculation",
                    "settlements_evaluated": len(DEMO_SETTLEMENTS),
                },
                "created_at": (now_utc - datetime.timedelta(hours=18)).isoformat(),
            },
            {
                "id": "RPT-0036",
                "title": "Sentinel-1 SAR Analysis",
                "type": "PDF",
                "size": None,
                "status": "processing",
                "file_path": None,
                "data_source": "synthetic_demo",
                "provenance": {
                    "data_source": "synthetic_demo",
                    "dataset": "Simulated Sentinel-1 C-band SAR",
                    "status": "processing",
                    "processing_method": "Synthetic radar calibration and speckle filtering simulation",
                },
                "created_at": (now_utc - datetime.timedelta(days=1)).isoformat(),
            },
        ]

        for r_spec in reports_seed:
            existing_r = db.query(Report).filter(Report.id == r_spec["id"]).first()
            if existing_r:
                existing_r.title = r_spec["title"]
                existing_r.type = r_spec["type"]
                existing_r.size = r_spec["size"]
                existing_r.status = r_spec["status"]
                existing_r.file_path = r_spec["file_path"]
                existing_r.data_source = r_spec["data_source"]
                existing_r.provenance = r_spec["provenance"]
                existing_r.created_at = r_spec["created_at"]
            else:
                db.add(Report(**r_spec))
        db.commit()

        logger.info(f"✅ Demo flood dataset seeded successfully! (Job: {DEMO_JOB_ID})")
        return {
            "status": "success",
            "job_id": DEMO_JOB_ID,
            "settlements_count": len(DEMO_SETTLEMENTS),
            "reports_count": len(reports_seed),
            "geotiff_files": list(geotiff_paths.keys()),
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to seed demo data: {e}", exc_info=True)
        raise
    finally:
        if should_close:
            db.close()


if __name__ == "__main__":
    init_db()
    res = seed_demo_data()
    print("Seeding result:", json.dumps(res, indent=2))
