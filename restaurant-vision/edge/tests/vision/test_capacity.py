from __future__ import annotations

import math
import time

import pytest
from rv_contracts import Detection, Frame

from rv_edge.vision.capacity import CPU_BUDGET, CapacityReport, estimate_capacity
from rv_edge.vision.detectors import DEFAULT_MODEL_DIR, SimulatedDetector

TINY = DEFAULT_MODEL_DIR / "yolox_tiny.onnx"


class SlowDetector:
    def __init__(self, delay_s: float) -> None:
        self.delay_s = delay_s
        self.calls = 0

    def detect(self, frame: Frame) -> list[Detection]:
        self.calls += 1
        time.sleep(self.delay_s)
        return []


def test_report_shape_with_simulated_detector() -> None:
    report = estimate_capacity(SimulatedDetector(), seconds=0.01)
    assert isinstance(report, CapacityReport)
    assert report.ms_per_inference >= 0
    assert isinstance(report.max_cameras_at_5fps, int) and report.max_cameras_at_5fps > 0
    assert "5 fps" in report.recommendation_text


def test_capacity_math_and_warmup() -> None:
    det = SlowDetector(0.02)
    report = estimate_capacity(det, seconds=0.05)
    assert det.calls >= 4  # warm-up + at least 3 timed runs
    assert report.ms_per_inference >= 20
    expected = math.floor(CPU_BUDGET * 1000 / report.ms_per_inference / 5)
    assert abs(report.max_cameras_at_5fps - expected) <= 1


def test_too_slow_pc_gets_advice() -> None:
    report = estimate_capacity(SlowDetector(0.15), seconds=0.0)
    assert report.max_cameras_at_5fps == 0
    assert "mini PC" in report.recommendation_text


def test_builds_detector_when_none_given() -> None:
    report = estimate_capacity(detector_backend="simulated", seconds=0.01)
    assert report.max_cameras_at_5fps > 0


@pytest.mark.skipif(not TINY.is_file(), reason="yolox_tiny.onnx not downloaded")
def test_real_model_capacity() -> None:
    report = estimate_capacity(model_path=TINY, seconds=0.2)
    assert report.ms_per_inference > 0 and report.max_cameras_at_5fps >= 0
