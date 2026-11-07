"""``build_camera_pipeline``: wires source, masks, detector, tracker and hints for one camera.

Matches ``rv_edge.interfaces.CameraPipelineFactory`` exactly. Extra per-camera knobs travel in
``SourceSpec.options`` (edge-local, never sent to the cloud):

* ``track_id_ttl_h`` (float, default 24): id rotation period (``Thresholds.track_id_ttl_h``).
* ``simulated_detector`` (dict): ``SimulatedDetector`` noise (``jitter``, ``miss_rate``,
  ``false_positive_rate``, ``seed``; the seed defaults to a hash of the camera id).
* ``realtime`` (bool, file sources): pace to the wall clock (default True).
* ``source`` (simulated sources): the simulator's ``FrameSource``.

YOLOX sessions are shared across cameras (one model in memory). Inference threads come from
:func:`set_inference_threads`, else ``RV_INFERENCE_THREADS``, else ``OMP_NUM_THREADS`` (set by
the resource governor; ONNX Runtime ignores it on its own), else ONNX Runtime's default.
"""

from __future__ import annotations

import os
import zlib
from pathlib import Path
from typing import Any, Literal

from rv_contracts import CameraConfig, Clock, Polygon

from ..ingest.factory import build_source
from ..interfaces import CameraPipeline, HintExtractor, SourceSpec
from .detectors.factory import build_detector
from .hints import NullHints, SyntheticHints, UniformColorHints
from .pipeline import DefaultCameraPipeline
from .tracking import ByteTrackTracker

THREAD_ENV_VARS = ("RV_INFERENCE_THREADS", "OMP_NUM_THREADS")

_inference_threads: int | None = None


def set_inference_threads(threads: int | None) -> None:
    """Cap ONNX Runtime intra-op threads for detectors built from now on (None: automatic)."""
    global _inference_threads
    if threads is not None and threads < 1:
        raise ValueError("threads must be >= 1")
    _inference_threads = threads


def inference_threads() -> int | None:
    """The thread cap in effect (see module docstring)."""
    if _inference_threads is not None:
        return _inference_threads
    for var in THREAD_ENV_VARS:
        value = os.environ.get(var, "").strip()
        if value.isdigit() and int(value) > 0:
            return int(value)
    return None


def _unique_masks(*groups: list[Polygon]) -> list[list[tuple[float, float]]]:
    seen: set[tuple[tuple[float, float], ...]] = set()
    out: list[list[tuple[float, float]]] = []
    for group in groups:
        for poly in group:
            key = tuple((float(x), float(y)) for x, y in poly)
            if key not in seen:
                seen.add(key)
                out.append(list(key))
    return out


def _simulated_options(spec: SourceSpec) -> dict[str, Any]:
    options = dict(spec.options.get("simulated_detector") or {})
    options.setdefault("seed", zlib.crc32(spec.camera_id.encode("utf-8")))
    return options


def build_camera_pipeline(
    camera: CameraConfig,
    spec: SourceSpec,
    *,
    clock: Clock,
    privacy_masks: list[Polygon],
    detector_backend: Literal["auto", "yolox", "simulated"] = "auto",
    model_path: Path | None = None,
    uniform_hsv: tuple[float, float, float] | None = None,
) -> CameraPipeline:
    """Build the pipeline for ``camera``. Privacy masks are the union of ``privacy_masks`` and
    ``camera.privacy_masks``. Raises ``ModelNotFoundError`` when a real camera needs YOLOX and
    the model file is missing."""
    source = build_source(spec, clock=clock, target_fps=camera.target_fps)
    detector = build_detector(
        detector_backend,
        model_path,
        source_kind=spec.kind,
        threads=inference_threads(),
        simulated_options=_simulated_options(spec),
        shared=True,
    )
    tracker = ByteTrackTracker(
        frame_rate=camera.target_fps,
        track_id_ttl_h=float(spec.options.get("track_id_ttl_h", 24.0)),
    )
    hints: HintExtractor
    if spec.kind == "simulated":
        hints = SyntheticHints()
    elif uniform_hsv is not None:
        hints = UniformColorHints(uniform_hsv)
    else:
        hints = NullHints()
    return DefaultCameraPipeline(
        camera.camera_id,
        source,
        detector,
        tracker,
        hints,
        clock=clock,
        target_fps=camera.target_fps,
        privacy_masks=_unique_masks(list(privacy_masks), list(camera.privacy_masks)),
        anchor=camera.anchor,
    )
