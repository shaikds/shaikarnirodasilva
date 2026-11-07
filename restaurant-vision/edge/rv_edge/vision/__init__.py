"""Edge vision: privacy masks, person detection, tracking with rotating ids, appearance hints.

Frames stay in RAM; nothing here writes images to disk, recognises faces or builds
embeddings. Hints are scalars only.
"""

from .capacity import CapacityReport, estimate_capacity
from .detectors import (
    ModelNotFoundError,
    SimulatedDetector,
    YoloxOnnxDetector,
    build_detector,
    default_model_path,
)
from .factory import build_camera_pipeline, inference_threads, set_inference_threads
from .hints import NullHints, SyntheticHints, UniformColorHints, measure_uniform_hsv
from .pipeline import DefaultCameraPipeline
from .privacy import apply_masks
from .tracking import ByteTrackTracker

__all__ = [
    "ByteTrackTracker",
    "CapacityReport",
    "DefaultCameraPipeline",
    "ModelNotFoundError",
    "NullHints",
    "SimulatedDetector",
    "SyntheticHints",
    "UniformColorHints",
    "YoloxOnnxDetector",
    "apply_masks",
    "build_camera_pipeline",
    "build_detector",
    "default_model_path",
    "estimate_capacity",
    "inference_threads",
    "measure_uniform_hsv",
    "set_inference_threads",
]
