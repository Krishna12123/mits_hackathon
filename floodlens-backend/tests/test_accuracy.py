"""
Unit Tests for FloodLens Day 3 Accuracy Gate & Feedback Loop
Tests:
1. Metrics Calculation: IoU, F1 score, Precision, Recall
2. Reference Validation Mask generation
3. Accuracy Gate: IoU threshold comparison (pass / fail)
4. Re-run retuning loop: dynamic threshold adaptation
5. Database logging to AccuracyRecord table
6. API Endpoints: GET /api/accuracy/{job_id}, GET /api/accuracy, POST /api/accuracy/evaluate
"""

import asyncio
import unittest
from app.services.accuracy_service import AccuracyGateService, accuracy_service
from app.database import SessionLocal, init_db
from app.models.job import Job
from app.models.accuracy import AccuracyRecord
from app.models.schemas import AccuracyResponse, AccuracyEvaluateRequest
from app.routers.accuracy import get_job_accuracy, get_latest_accuracy, evaluate_accuracy


class TestAccuracyMetrics(unittest.TestCase):
    """Unit tests for IoU, F1 score, precision, and recall math."""

    def test_metrics_perfect_match(self):
        """Identical predicted and reference masks should yield 1.0 for all scores."""
        mask = [
            [1, 1, 0],
            [0, 1, 0],
            [0, 0, 0],
        ]
        metrics = AccuracyGateService.compute_metrics(mask, mask)
        self.assertEqual(metrics["iou"], 1.0)
        self.assertEqual(metrics["f1"], 1.0)
        self.assertEqual(metrics["precision"], 1.0)
        self.assertEqual(metrics["recall"], 1.0)
        self.assertEqual(metrics["tp"], 3)
        self.assertEqual(metrics["fp"], 0)
        self.assertEqual(metrics["fn"], 0)

    def test_metrics_zero_overlap(self):
        """Completely disjoint predicted and reference masks should yield 0.0."""
        pred = [
            [1, 1],
            [0, 0],
        ]
        ref = [
            [0, 0],
            [1, 1],
        ]
        metrics = AccuracyGateService.compute_metrics(pred, ref)
        self.assertEqual(metrics["iou"], 0.0)
        self.assertEqual(metrics["f1"], 0.0)
        self.assertEqual(metrics["precision"], 0.0)
        self.assertEqual(metrics["recall"], 0.0)
        self.assertEqual(metrics["tp"], 0)
        self.assertEqual(metrics["fp"], 2)
        self.assertEqual(metrics["fn"], 2)

    def test_metrics_partial_overlap(self):
        """Verify mathematical calculation with known confusion matrix."""
        pred = [
            [1, 1],
            [0, 0],
        ]
        ref = [
            [1, 0],
            [1, 0],
        ]
        # Pixel (0,0): P=1, R=1 -> TP
        # Pixel (0,1): P=1, R=0 -> FP
        # Pixel (1,0): P=0, R=1 -> FN
        # Pixel (1,1): P=0, R=0 -> TN
        metrics = AccuracyGateService.compute_metrics(pred, ref)
        self.assertEqual(metrics["tp"], 1)
        self.assertEqual(metrics["fp"], 1)
        self.assertEqual(metrics["fn"], 1)
        self.assertEqual(metrics["tn"], 1)

        # IoU = 1 / (1 + 1 + 1) = 0.3333
        self.assertAlmostEqual(metrics["iou"], 1 / 3, places=3)
        # F1 = 2*1 / (2*1 + 1 + 1) = 2/4 = 0.5
        self.assertEqual(metrics["f1"], 0.5)
        self.assertEqual(metrics["precision"], 0.5)
        self.assertEqual(metrics["recall"], 0.5)


class TestReferenceMask(unittest.TestCase):
    """Unit tests for ground truth reference mask generation."""

    def test_reference_mask_structure(self):
        """Reference mask must have requested dimensions and both water and land."""
        mask = AccuracyGateService.generate_reference_mask(rows=50, cols=50)
        self.assertEqual(len(mask), 50)
        self.assertEqual(len(mask[0]), 50)

        flat = [val for row in mask for val in row]
        self.assertIn(1, flat)
        self.assertIn(0, flat)


class TestAccuracyGateFeedbackLoop(unittest.TestCase):
    """Unit tests for iterative accuracy gate and retuning loop."""

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_gate_passes_when_target_achieved(self):
        """Accuracy gate should pass when IoU >= target_iou."""
        result = asyncio.run(accuracy_service.run_accuracy_gate(
            job_id="TEST-ACC-PASS",
            lat=26.3,
            lon=85.8,
            radius_km=50.0,
            target_iou=0.65,
            max_iterations=3,
        ))
        self.assertTrue(result["passed_gate"])
        self.assertEqual(result["status"], "PASSED")
        self.assertGreaterEqual(result["current_iou"], 0.65)
        self.assertGreater(len(result["history"]), 0)

    def test_rerun_retuning_loop_multiple_iterations(self):
        """When target is demanding, the feedback loop should adjust parameters and run iterations."""
        result = asyncio.run(accuracy_service.run_accuracy_gate(
            job_id="TEST-ACC-RERUN",
            lat=26.3,
            lon=85.8,
            radius_km=50.0,
            target_iou=0.98,  # Deliberately demanding target
            max_iterations=3,
        ))
        # Loop ran up to max iterations
        self.assertEqual(result["iterations_count"], 3)
        self.assertEqual(len(result["history"]), 3)

        # Check that thresholds were adjusted between iterations
        thresholds = [it["otsu_threshold"] for it in result["history"]]
        self.assertEqual(len(thresholds), 3)

    def test_database_logging(self):
        """Each iteration must be logged to the AccuracyRecord table in the database."""
        db = SessionLocal()
        test_job_id = "TEST-LOG-01"
        try:
            # Clean any old test records
            db.query(AccuracyRecord).filter(AccuracyRecord.job_id == test_job_id).delete()
            db.commit()

            result = asyncio.run(accuracy_service.run_accuracy_gate(
                job_id=test_job_id,
                lat=26.3,
                lon=85.8,
                radius_km=50.0,
                target_iou=0.95,
                max_iterations=3,
                db=db,
            ))

            # Query database
            records = db.query(AccuracyRecord).filter(AccuracyRecord.job_id == test_job_id).order_by(AccuracyRecord.iteration.asc()).all()
            self.assertEqual(len(records), result["iterations_count"])
            for idx, r in enumerate(records):
                self.assertEqual(r.iteration, idx + 1)
                self.assertGreater(r.iou_score, 0.0)
                self.assertGreater(r.f1_score, 0.0)
                self.assertIsNotNone(r.otsu_threshold)
        finally:
            db.close()


class TestAccuracyAPIEndpoints(unittest.TestCase):
    """Unit tests for /api/accuracy endpoints."""

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_get_job_accuracy_endpoint(self):
        """Test GET /api/accuracy/{job_id} endpoint."""
        db = SessionLocal()
        try:
            # Seed job
            job_id = "JOB-ACC-API-01"
            job = Job(
                id=job_id,
                status="completed",
                aoi_lat=26.3,
                aoi_lon=85.8,
                aoi_radius_km=100.0,
                pre_date="2026-10-11",
                post_date="2026-10-19",
            )
            db.merge(job)
            db.commit()

            response = asyncio.run(get_job_accuracy(job_id, db))
            self.assertIsInstance(response, AccuracyResponse)
            self.assertEqual(response.job_id, job_id)
            self.assertGreater(response.current_iou, 0.0)
            self.assertGreater(len(response.history), 0)
        finally:
            db.close()

    def test_get_latest_accuracy_endpoint(self):
        """Test GET /api/accuracy endpoint returning current/latest summary."""
        db = SessionLocal()
        try:
            response = asyncio.run(get_latest_accuracy(db))
            self.assertIsInstance(response, AccuracyResponse)
            self.assertIsNotNone(response.job_id)
            self.assertGreater(response.current_iou, 0.0)
            self.assertGreater(response.current_f1, 0.0)
        finally:
            db.close()

    def test_post_evaluate_endpoint(self):
        """Test POST /api/accuracy/evaluate with custom target and iterations."""
        db = SessionLocal()
        try:
            req = AccuracyEvaluateRequest(
                job_id="JOB-EVAL-TEST",
                target_iou=0.70,
                max_iterations=2,
                aoi_lat=26.3,
                aoi_lon=85.8,
                aoi_radius_km=60,
            )
            response = asyncio.run(evaluate_accuracy(req, db))
            self.assertIsInstance(response, AccuracyResponse)
            self.assertEqual(response.job_id, "JOB-EVAL-TEST")
            self.assertEqual(response.target_iou, 0.70)
            self.assertLessEqual(response.iterations_count, 2)
            self.assertGreater(len(response.history), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
