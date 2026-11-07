"""Factory: choose and build a ``Detector`` backend (Strategy)."""

from __future__ import annotations

import os
import threading
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Literal

from rv_contracts import Detector

from .simulated import SimulatedDetector
from .yolox_onnx import YoloxOnnxDetector

DetectorBackend = Literal["auto", "yolox", "simulated"]
SourceKind = Literal["rtsp", "file", "simulated"]

DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[3] / "models"
"""``edge/models`` in a source checkout (where ``scripts/fetch_models.py`` downloads to)."""
DEFAULT_MODEL_NAME = "yolox_tiny.onnx"
MODEL_ENV = "RV_EDGE_MODEL"
"""Environment variable overriding the default model path."""


class ModelNotFoundError(FileNotFoundError):
    """The YOLOX model file is missing."""


def default_model_path() -> Path:
    """``$RV_EDGE_MODEL`` if set, else ``edge/models/yolox_tiny.onnx``."""
    env = os.environ.get(MODEL_ENV)
    return Path(env) if env else DEFAULT_MODEL_DIR / DEFAULT_MODEL_NAME


def resolve_backend(
    backend: DetectorBackend, source_kind: SourceKind
) -> Literal["yolox", "simulated"]:
    """``auto`` -> simulated for simulated sources, yolox for real ones. Rejects mismatches
    (a simulated source has no pixels; a real camera has no ground truth)."""
    simulated_source = source_kind == "simulated"
    if backend == "auto":
        return "simulated" if simulated_source else "yolox"
    if backend == "simulated" and not simulated_source:
        raise ValueError(f"the simulated detector cannot run on a {source_kind} source")
    if backend == "yolox" and simulated_source:
        raise ValueError("the yolox detector needs pixels; simulated sources have none")
    if backend not in ("yolox", "simulated"):
        raise ValueError(f"unknown detector backend {backend!r}")
    return backend


_shared_lock = threading.Lock()
_shared_yolox: dict[tuple[str, int | None], YoloxOnnxDetector] = {}


def _yolox(path: Path, threads: int | None, shared: bool) -> YoloxOnnxDetector:
    if not path.is_file():
        raise ModelNotFoundError(
            f"YOLOX model not found at {path}. Download it with "
            "`python edge/scripts/fetch_models.py --model tiny` (or set RV_EDGE_MODEL)."
        )
    if not shared:
        return YoloxOnnxDetector(path, threads=threads)
    key = (str(path.resolve()), threads)
    with _shared_lock:
        detector = _shared_yolox.get(key)
        if detector is None:
            detector = YoloxOnnxDetector(path, threads=threads)
            _shared_yolox[key] = detector
        return detector


def clear_shared_detectors() -> None:
    """Drop cached shared YOLOX sessions (frees their memory once pipelines are gone)."""
    with _shared_lock:
        _shared_yolox.clear()


def build_detector(
    backend: DetectorBackend = "auto",
    model_path: Path | str | None = None,
    *,
    source_kind: SourceKind = "rtsp",
    threads: int | None = None,
    simulated_options: Mapping[str, Any] | None = None,
    shared: bool = False,
) -> Detector:
    """Build the detector for a camera.

    ``model_path`` defaults to :func:`default_model_path`; a missing model raises
    :class:`ModelNotFoundError` with download instructions. ``simulated_options`` are passed to
    :class:`SimulatedDetector` (``jitter``, ``miss_rate``, ``false_positive_rate``, ``seed``).
    ``shared=True`` reuses one ONNX session per (model, threads) across cameras, which saves
    memory; ONNX Runtime sessions are safe to call from several threads.
    """
    chosen = resolve_backend(backend, source_kind)
    if chosen == "simulated":
        return SimulatedDetector(**dict(simulated_options or {}))
    path = Path(model_path) if model_path is not None else default_model_path()
    return _yolox(path, threads, shared)
