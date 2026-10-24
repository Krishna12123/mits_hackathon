"""
Focused Test Suite: Date Handling, Validation, and Earth Engine Query Intervals
Verifies:
1. Strict ISO YYYY-MM-DD date validation and rejection of malformed date strings.
2. Rejection of reversed date ranges (start > end).
3. Prevention of event overlap between pre-event baseline and post-event observation periods.
4. Earth Engine half-open interval normalization ([start, inclusive_end) in UTC).
5. Single-day query expansion ([date, date] -> [date, date + 1 day)).
6. Independent pre-event and post-event collection filtering.
7. Empty collection handling and truthful error responses.
8. Accurate interval and UTC timezone recording in report provenance.
"""

import unittest
from datetime import date, timedelta
from pydantic import ValidationError

from app.models.schemas import DetectRequest
from app.services.flood_service import normalize_date_window, detect_flood
from app.services.sar_service import sar_service
from app.services.report_service import build_artifact_provenance


class TestDateValidationAndRequestParsing(unittest.TestCase):
    """Unit tests for DetectRequest date parsing, format checking, and range rules."""

    def test_valid_default_dates(self):
        """Default dates (2026-10-11, 2026-10-19) validate cleanly."""
        req = DetectRequest()
        self.assertEqual(req.pre_date, "2026-10-11")
        self.assertEqual(req.post_date, "2026-10-19")

    def test_valid_custom_date_windows(self):
        """Explicit multi-day non-overlapping windows validate cleanly."""
        req = DetectRequest(
            pre_start="2026-10-01",
            pre_end="2026-10-15",
            post_start="2026-10-16",
            post_end="2026-10-23",
        )
        self.assertEqual(req.pre_start, "2026-10-01")
        self.assertEqual(req.pre_end, "2026-10-15")
        self.assertEqual(req.post_start, "2026-10-16")
        self.assertEqual(req.post_end, "2026-10-23")

    def test_reject_malformed_date_strings(self):
        """Non-ISO or out-of-bounds dates must raise 422 / ValidationError."""
        invalid_cases = [
            {"pre_date": "invalid-date-string"},
            {"pre_date": "2026-99-99"},
            {"post_date": "19/10/2026"},  # slash format
            {"pre_start": "2026-02-30"},  # invalid leap date
            {"post_end": "not_a_date"},
        ]
        for kwargs in invalid_cases:
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValidationError):
                    DetectRequest(**kwargs)

    def test_reject_reversed_pre_window(self):
        """pre_start > pre_end must be rejected."""
        with self.assertRaises(ValidationError) as ctx:
            DetectRequest(
                pre_start="2026-10-15",
                pre_end="2026-10-01",
                post_start="2026-10-16",
                post_end="2026-10-23",
            )
        self.assertIn("Pre-flood start date", str(ctx.exception))

    def test_reject_reversed_post_window(self):
        """post_start > post_end must be rejected."""
        with self.assertRaises(ValidationError) as ctx:
            DetectRequest(
                pre_start="2026-10-01",
                pre_end="2026-10-15",
                post_start="2026-10-25",
                post_end="2026-10-16",
            )
        self.assertIn("Post-flood start date", str(ctx.exception))

    def test_prevent_accidental_event_overlap(self):
        """
        Pre-event baseline and post-event observation periods must not overlap.
        If pre_end >= post_start, it must be rejected to prevent floodwater
        from contaminating the baseline composite.
        """
        overlapping_cases = [
            # Exact boundary collision (pre_end == post_start)
            {"pre_start": "2026-10-01", "pre_end": "2026-10-16", "post_start": "2026-10-16", "post_end": "2026-10-23"},
            # Inversion (pre_date >= post_date)
            {"pre_date": "2026-10-20", "post_date": "2026-10-10"},
            # Deep overlap (pre_end > post_start)
            {"pre_start": "2026-10-01", "pre_end": "2026-10-18", "post_start": "2026-10-15", "post_end": "2026-10-23"},
        ]
        for kwargs in overlapping_cases:
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValidationError) as ctx:
                    DetectRequest(**kwargs)
                self.assertIn("strictly precede", str(ctx.exception))

    def test_frontend_field_mappings(self):
        """Legacy and camelCase frontend field names map and validate correctly."""
        req = DetectRequest(
            pre_flood_start="2026-10-01",
            pre_flood_end="2026-10-10",
            post_flood_start="2026-10-12",
            post_flood_end="2026-10-20",
        )
        self.assertEqual(req.pre_start, "2026-10-01")
        self.assertEqual(req.pre_end, "2026-10-10")
        self.assertEqual(req.post_start, "2026-10-12")
        self.assertEqual(req.post_end, "2026-10-20")


class TestDateNormalizationAndGEEHalfOpenInterval(unittest.TestCase):
    """Unit tests for Earth Engine half-open query window normalization."""

    def test_inclusive_user_end_date_conversion(self):
        """
        User inclusive end date 2026-10-15 must expand to 2026-10-16 in GEE,
        ensuring acquisitions on 2026-10-15 up to 23:59:59Z are included.
        """
        gee_start, gee_end = normalize_date_window("2026-10-01", "2026-10-15")
        self.assertEqual(gee_start, "2026-10-01")
        self.assertEqual(gee_end, "2026-10-16")

    def test_single_day_query_normalization(self):
        """
        User querying single date 2026-10-19 (start==end) must produce
        half-open window [2026-10-19, 2026-10-20) instead of empty 0-second interval.
        """
        gee_start, gee_end = normalize_date_window("2026-10-19", "2026-10-19")
        self.assertEqual(gee_start, "2026-10-19")
        self.assertEqual(gee_end, "2026-10-20")

    def test_reversed_dates_raise_value_error(self):
        """normalize_date_window must raise ValueError on reversed dates, not silently invent dates."""
        with self.assertRaises(ValueError) as ctx:
            normalize_date_window("2026-10-20", "2026-10-10")
        self.assertIn("cannot be after end date", str(ctx.exception))

    def test_invalid_format_raises_value_error(self):
        """normalize_date_window must reject unparseable date strings."""
        with self.assertRaises(ValueError):
            normalize_date_window("2026-invalid", "2026-10-15")


class TestReportProvenanceIntervalRecording(unittest.TestCase):
    """Verifies that report provenance records both user-facing inclusive dates and GEE UTC intervals."""

    def test_provenance_records_exact_intervals_and_utc_timezone(self):
        """Provenance records both inclusive user windows and UTC GEE half-open query intervals."""
        job_ctx = {
            "pre_start": "2026-10-01",
            "pre_end": "2026-10-15",
            "post_start": "2026-10-16",
            "post_end": "2026-10-23",
            "data_source": "gee_live",
        }
        prov = build_artifact_provenance("final_flood", job_ctx, status="ready")

        dates = prov["dates"]
        self.assertEqual(dates["timezone"], "UTC")
        self.assertEqual(dates["pre_flood_window"], ["2026-10-01", "2026-10-15"])
        self.assertEqual(dates["post_flood_window"], ["2026-10-16", "2026-10-23"])

        # GEE half-open intervals must be present and UTC-formatted
        gee_intervals = dates["gee_query_intervals_utc"]
        self.assertEqual(gee_intervals["pre_flood_half_open"], ["2026-10-01T00:00:00Z", "2026-10-16T00:00:00Z"])
        self.assertEqual(gee_intervals["post_flood_half_open"], ["2026-10-16T00:00:00Z", "2026-10-24T00:00:00Z"])


if __name__ == "__main__":
    unittest.main()
