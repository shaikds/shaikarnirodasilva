"""Person detector backends (Strategy): YOLOX on ONNX Runtime, and a simulated detector."""

from .factory import (
    DEFAULT_MODEL_DIR,
    DetectorBackend,
    ModelNotFoundError,
    build_detector,
    clear_shared_detectors,
    default_model_path,
    resolve_backend,
)
from .simulated import SimulatedDetector
from .yolox_onnx import YoloxOnnxDetector

__all__ = [
    "DEFAULT_MODEL_DIR",
    "DetectorBackend",
    "ModelNotFoundError",
    "SimulatedDetector",
    "YoloxOnnxDetector",
    "build_detector",
    "clear_shared_detectors",
    "default_model_path",
    "resolve_backend",
]
