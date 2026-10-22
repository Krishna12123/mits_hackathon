"""
Accuracy Gate and Quality Feedback Loop Service
Day 3 Implementation for Krishna (Backend)

Components:
1. Metrics Computation: IoU (Jaccard Index), F1 Score (Dice Coefficient), Precision, and Recall.
2. Reference Validation Mask: Ground truth reference generation (simulating Copernicus EMS validation).
3. Re-run Retuning Loop: Dynamically adjusts Otsu / index thresholds if IoU < target_iou.
4. Database Logger: Persists iteration history into the AccuracyRecord table.
"""

import math
import datetime
import logging
from typing import Dict, Any, List, Tuple, Optional
from sqlalchemy.orm import Session

from app.models.accuracy import AccuracyRecord
from app.services.detection_service import (
    WaterIndexEngine,
    MajorityVoteEnsemble,
    ChangeDetector,
    detection_pipeline,
)
from app.routers.ws import manager

logger = logging.getLogger(__name__)


class AccuracyGateService:
    """Manages accuracy verification, IoU/F1 calculation, and adaptive parameter retuning."""

    DEFAULT_TARGET_IOU = 0.75
    MAX_ITERATIONS = 4

    @staticmethod
    def compute_metrics(
        predicted_mask: List[List[int]],
        reference_mask: List[List[int]],
    ) -> Dict[str, Any]:
        """
        Computes binary segmentation metrics:
        - True Positives (TP)
        - False Positives (FP)
        - False Negatives (FN)
        - True Negatives (TN)
        - Intersection over Union (IoU)
        - F1 Score (Dice coefficient)
        - Precision & Recall
        """
        rows = len(predicted_mask)
        cols = len(predicted_mask[0]) if rows > 0 else 0

        tp = 0
        fp = 0
        fn = 0
        tn = 0

        for r in range(rows):
            for c in range(cols):
                p = predicted_mask[r][c]
                ref = reference_mask[r][c]

                if p == 1 and ref == 1:
                    tp += 1
                elif p == 1 and ref == 0:
                    fp += 1
                elif p == 0 and ref == 1:
                    fn += 1
                else:
                    tn += 1

        denom_iou = tp + fp + fn
        if denom_iou == 0:
            iou = 1.0 if (tp == 0 and fp == 0 and fn == 0) else 0.0
        else:
            iou = tp / denom_iou

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        denom_f1 = (2 * tp) + fp + fn
        f1 = (2 * tp) / denom_f1 if denom_f1 > 0 else 0.0

        return {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
            "total_pixels": rows * cols,
            "iou": round(iou, 4),
            "f1": round(f1, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
        }

    @staticmethod
    def generate_reference_mask(
        rows: int = 60,
        cols: int = 60,
    ) -> List[List[int]]:
        """
        Generates reference flood ground truth mask simulating Copernicus EMS
        emergency mapping delineation products.
        """
        ref_mask = [[0] * cols for _ in range(rows)]
        for r in range(rows):
            c_center = int(cols * 0.45 + cols * 0.15 * math.sin(r / 6.0))
            spread = 9 if r > 15 else 4
            for dc in range(-spread, spread + 2):
                c = c_center + dc
                if 0 <= c < cols:
                    ref_mask[r][c] = 1

        # Subtract permanent river channel from reference inundation
        for r in range(rows):
            c_center = int(cols * 0.45 + cols * 0.15 * math.sin(r / 6.0))
            for dc in range(-2, 3):
                c = c_center + dc
                if 0 <= c < cols:
                    ref_mask[r][c] = 0

        return ref_mask

    async def run_accuracy_gate(
        self,
        job_id: str,
        lat: float = 26.3,
        lon: float = 85.8,
        radius_km: float = 150.0,
        target_iou: float = DEFAULT_TARGET_IOU,
        max_iterations: int = MAX_ITERATIONS,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Runs the iterative accuracy gate feedback loop:
        1. Compares detected flood mask against reference ground truth.
        2. If IoU < target_iou:
           - Analyzes error bias (False Positives vs False Negatives)
           - Adjusts Otsu threshold / majority vote stringency
           - Re-runs detection and re-evaluates
        3. Logs each iteration to database AccuracyRecord.
        4. Broadcasts WebSocket progress events.
        """
        logger.info(f"Starting Accuracy Gate for {job_id} (target IoU: {target_iou})")

        # Synthesize base scene
        scene = detection_pipeline.generate_synthetic_scene(lat, lon, radius_km, rows=60, cols=60)
        reference_mask = self.generate_reference_mask(rows=scene["rows"], cols=scene["cols"])

        # Base flat values
        ndwi_flat = [val for row in scene["ndwi_raw"] for val in row]
        mndwi_flat = [val for row in scene["mndwi_raw"] for val in row]
        awei_flat = [val for row in scene["awei_raw"] for val in row]
        sar_flat = [val for row in scene["sar_db_raw"] for val in row]

        base_t_ndwi = WaterIndexEngine.compute_otsu_threshold(ndwi_flat)
        base_t_mndwi = WaterIndexEngine.compute_otsu_threshold(mndwi_flat)
        base_t_awei = WaterIndexEngine.compute_otsu_threshold(awei_flat)
        base_t_sar = WaterIndexEngine.compute_otsu_threshold(sar_flat)

        history = []
        passed_gate = False
        current_mask = None
        current_metrics = None

        # Feedback retuning loop
        threshold_offset = 0.0
        min_votes = 2

        for iteration in range(1, max_iterations + 1):
            # Threshold optical indices with current offset
            t_ndwi = base_t_ndwi + threshold_offset
            t_mndwi = base_t_mndwi + threshold_offset
            t_awei = base_t_awei + threshold_offset
            t_sar = base_t_sar - (threshold_offset * 10)  # SAR dB scale adjustment

            m_ndwi = WaterIndexEngine.threshold_grid(scene["ndwi_raw"], t_ndwi, condition="gt")
            m_mndwi = WaterIndexEngine.threshold_grid(scene["mndwi_raw"], t_mndwi, condition="gt")
            m_awei = WaterIndexEngine.threshold_grid(scene["awei_raw"], t_awei, condition="gt")
            m_sar = WaterIndexEngine.threshold_grid(scene["sar_db_raw"], t_sar, condition="lt")

            masks = {"NDWI": m_ndwi, "MNDWI": m_mndwi, "AWEI": m_awei, "SAR": m_sar}
            ens_mask, _, _ = MajorityVoteEnsemble.combine(masks, min_votes=min_votes)

            # Subtract permanent water
            flood_mask, _ = ChangeDetector.subtract_permanent_water(ens_mask, scene["permanent_jrc"])
            current_mask = flood_mask

            # Compute IoU, F1, Precision, Recall vs Reference Mask
            metrics = self.compute_metrics(flood_mask, reference_mask)
            current_metrics = metrics
            iou = metrics["iou"]
            f1 = metrics["f1"]

            passed = iou >= target_iou
            if passed:
                passed_gate = True

            iteration_data = {
                "iteration": iteration,
                "iou_score": iou,
                "f1_score": f1,
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "tp": metrics["tp"],
                "fp": metrics["fp"],
                "fn": metrics["fn"],
                "otsu_threshold": round(t_ndwi, 3),
                "min_votes": min_votes,
                "passed_gate": passed,
            }
            history.append(iteration_data)

            # Log to DB if session provided
            if db:
                record = AccuracyRecord(
                    job_id=job_id,
                    iteration=iteration,
                    iou_score=iou,
                    f1_score=f1,
                    otsu_threshold=round(t_ndwi, 3),
                    passed_gate=passed,
                    created_at=datetime.datetime.now(datetime.timezone.utc),
                )
                db.add(record)
                db.commit()

            # Broadcast progress
            try:
                await manager.broadcast({
                    "event": "accuracy_gate_iteration",
                    "job_id": job_id,
                    "iteration": iteration,
                    "iou_score": iou,
                    "f1_score": f1,
                    "passed_gate": passed,
                    "target_iou": target_iou,
                })
            except Exception:
                pass

            if passed_gate:
                logger.info(f"Accuracy Gate PASSED at iteration {iteration} (IoU: {iou} >= {target_iou})")
                break

            # Adaptive adjustment for next iteration if not passed
            if metrics["fp"] > metrics["fn"]:
                # Too many false positives -> tighten threshold
                threshold_offset += 0.05
                min_votes = min(4, min_votes + 1) if iteration == 1 else min_votes
            else:
                # Too many false negatives -> relax threshold
                threshold_offset -= 0.04
                min_votes = max(1, min_votes - 1) if iteration == 1 else min_votes

        return {
            "job_id": job_id,
            "passed_gate": passed_gate,
            "target_iou": target_iou,
            "current_iou": current_metrics["iou"] if current_metrics else 0.0,
            "current_f1": current_metrics["f1"] if current_metrics else 0.0,
            "precision": current_metrics["precision"] if current_metrics else 0.0,
            "recall": current_metrics["recall"] if current_metrics else 0.0,
            "iterations_count": len(history),
            "history": history,
            "status": "PASSED" if passed_gate else "BELOW_TARGET",
        }


accuracy_service = AccuracyGateService()
