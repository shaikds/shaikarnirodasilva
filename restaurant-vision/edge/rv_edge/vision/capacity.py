"""``rv-edge check``: how many cameras this PC can analyse at 5 fps."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from rv_contracts import Detector, Frame

from ..interfaces import SyntheticImage, SyntheticPerson
from .detectors.factory import DetectorBackend, SourceKind, build_detector
from .detectors.simulated import SimulatedDetector

CPU_BUDGET = 0.7
"""Share of the CPU the analysis may use; the rest stays free for the PC's normal work."""
ANALYSIS_FPS = 5.0
BENCH_WIDTH, BENCH_HEIGHT = 640, 360
"""Typical substream resolution."""


@dataclass(frozen=True, slots=True)
class CapacityReport:
    """Result of :func:`estimate_capacity`."""

    ms_per_inference: float
    max_cameras_at_5fps: int
    recommendation_text: str


def _bench_frame(detector: Detector) -> Frame:
    if isinstance(detector, SimulatedDetector):
        people = (SyntheticPerson(box=(0.4, 0.3, 0.5, 0.9)),)
        return Frame("bench", 0.0, 0, BENCH_WIDTH, BENCH_HEIGHT, SyntheticImage(people=people))
    rng = np.random.default_rng(0)
    image = rng.integers(0, 256, size=(BENCH_HEIGHT, BENCH_WIDTH, 3), dtype=np.uint8)
    return Frame("bench", 0.0, 0, BENCH_WIDTH, BENCH_HEIGHT, image)


def _recommendation(ms: float, cameras: int) -> str:
    if cameras == 0:
        return (
            f"Detection takes {ms:.0f} ms per frame, too slow for live analysis at 5 fps "
            f"within {CPU_BUDGET:.0%} CPU. Use the YOLOX-tiny model, or a dedicated mini PC "
            "(Intel N100 or better)."
        )
    plural = "camera" if cameras == 1 else "cameras"
    return (
        f"Detection takes {ms:.0f} ms per frame: this PC can analyse up to {cameras} {plural} "
        f"at 5 fps while keeping {1 - CPU_BUDGET:.0%} of the CPU free."
    )


def estimate_capacity(
    detector: Detector | None = None,
    seconds: float = 5.0,
    *,
    model_path: Path | str | None = None,
    detector_backend: DetectorBackend = "auto",
    frame: Frame | None = None,
) -> CapacityReport:
    """Time ``detector`` on a substream-sized frame for about ``seconds`` (after a warm-up run).

    Without a detector one is built for a real camera from ``model_path``/``detector_backend``.
    Capacity = inferences per second within :data:`CPU_BUDGET`, divided by 5 fps.
    """
    if detector is None:
        backend: DetectorBackend = "yolox" if detector_backend == "auto" else detector_backend
        kind: SourceKind = "simulated" if backend == "simulated" else "rtsp"
        detector = build_detector(backend, model_path, source_kind=kind)
    bench = frame if frame is not None else _bench_frame(detector)
    detector.detect(bench)  # warm-up (session initialization, memory arenas)
    runs = 0
    start = time.perf_counter()
    elapsed = 0.0
    while runs < 3 or elapsed < seconds:
        detector.detect(bench)
        runs += 1
        elapsed = time.perf_counter() - start
    ms = 1000.0 * elapsed / runs
    cameras = int(math.floor(CPU_BUDGET * 1000.0 / max(ms, 1e-6) / ANALYSIS_FPS))
    return CapacityReport(
        ms_per_inference=round(ms, 2),
        max_cameras_at_5fps=cameras,
        recommendation_text=_recommendation(ms, cameras),
    )
