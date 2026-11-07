from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pytest
from rv_contracts import Detection, Detector

from rv_edge.interfaces import SyntheticPerson
from rv_edge.vision.detectors import (
    DEFAULT_MODEL_DIR,
    ModelNotFoundError,
    SimulatedDetector,
    YoloxOnnxDetector,
    build_detector,
    clear_shared_detectors,
    resolve_backend,
)
from rv_edge.vision.detectors.yolox_onnx import (
    decode_persons,
    make_grids,
    nms,
    preprocess,
    resolve_input_size,
    select_providers,
)

from .fakes import pixel_frame, synthetic_frame, walking_people

TINY = DEFAULT_MODEL_DIR / "yolox_tiny.onnx"
needs_tiny = pytest.mark.skipif(not TINY.is_file(), reason="yolox_tiny.onnx not downloaded")


# ------------------------------------------------------------------ simulated detector


def test_simulated_without_noise_is_ground_truth() -> None:
    boxes = walking_people(1)[0]
    dets = SimulatedDetector().detect(synthetic_frame(boxes))
    assert [d.box for d in dets] == boxes
    assert all(d.score == 0.9 for d in dets)
    assert isinstance(SimulatedDetector(), Detector)


def _run(det: SimulatedDetector, n: int = 30) -> list[list[Detection]]:
    return [det.detect(synthetic_frame(people)) for people in walking_people(n)]


def test_simulated_noise_is_deterministic_per_seed() -> None:
    noisy = {"jitter": 0.05, "miss_rate": 0.2, "false_positive_rate": 0.3}
    a = _run(SimulatedDetector(**noisy, seed=7))
    b = _run(SimulatedDetector(**noisy, seed=7))
    c = _run(SimulatedDetector(**noisy, seed=8))
    assert a == b
    assert a != c


def test_simulated_noise_effects() -> None:
    people = walking_people(1)[0]
    assert SimulatedDetector(miss_rate=1.0).detect(synthetic_frame(people)) == []
    dets = SimulatedDetector(false_positive_rate=1.0).detect(synthetic_frame(people))
    assert len(dets) == len(people) + 1
    jittered = SimulatedDetector(jitter=0.1, seed=1).detect(synthetic_frame(people))
    assert [d.box for d in jittered] != people
    for d in jittered + dets:
        x1, y1, x2, y2 = d.box
        assert 0.0 <= x1 <= x2 <= 1.0 and 0.0 <= y1 <= y2 <= 1.0


def test_simulated_validation_and_input_types() -> None:
    with pytest.raises(ValueError):
        SimulatedDetector(miss_rate=1.5)
    with pytest.raises(TypeError):
        SimulatedDetector().detect(pixel_frame())
    assert SimulatedDetector().detect(type(pixel_frame())("c", 0, 0, 0, 0, None)) == []
    person = SyntheticPerson(box=(0.1, 0.1, 0.2, 0.5), uniform_score=0.8)
    assert len(SimulatedDetector().detect(synthetic_frame([person]))) == 1


# ------------------------------------------------------------------ factory


def test_resolve_backend_rules() -> None:
    assert resolve_backend("auto", "simulated") == "simulated"
    assert resolve_backend("auto", "rtsp") == "yolox"
    assert resolve_backend("auto", "file") == "yolox"
    assert resolve_backend("yolox", "rtsp") == "yolox"
    with pytest.raises(ValueError):
        resolve_backend("simulated", "rtsp")
    with pytest.raises(ValueError):
        resolve_backend("yolox", "simulated")


def test_build_detector_simulated_and_missing_model(tmp_path: Path) -> None:
    det = build_detector("auto", None, source_kind="simulated", simulated_options={"seed": 3})
    assert isinstance(det, SimulatedDetector)
    with pytest.raises(ModelNotFoundError, match="fetch_models.py"):
        build_detector("auto", tmp_path / "missing.onnx", source_kind="rtsp")


@needs_tiny
def test_build_detector_shares_sessions() -> None:
    clear_shared_detectors()
    a = build_detector("yolox", TINY, shared=True)
    b = build_detector("auto", TINY, source_kind="file", shared=True)
    c = build_detector("yolox", TINY, shared=False)
    assert a is b and a is not c
    clear_shared_detectors()


# ------------------------------------------------------------------ YOLOX pre/post-processing


def test_preprocess_letterbox_matches_official_demo() -> None:
    image = np.zeros((100, 200, 3), dtype=np.uint8)
    image[..., 0], image[..., 1], image[..., 2] = 10, 20, 30  # B, G, R
    chw, ratio = preprocess(image, (64, 64))
    assert ratio == pytest.approx(0.32)
    assert chw.shape == (3, 64, 64) and chw.dtype == np.float32
    assert np.all(chw[:, 32:, :] == 114.0), "bottom padding is 114"
    assert np.all(chw[0, :32, :] == 10.0) and np.all(chw[2, :32, :] == 30.0), "BGR, unscaled"


def test_grids_match_model_output_rows() -> None:
    grids, strides = make_grids((416, 416))
    assert grids.shape == (3549, 2) and strides.shape == (3549, 1)
    assert make_grids((640, 640))[0].shape[0] == 8400
    assert tuple(grids[52 * 52]) == (0.0, 0.0) and strides[52 * 52, 0] == 16.0


def test_decode_persons_grid_decode_threshold_and_nms() -> None:
    grids, strides = make_grids((64, 64))
    raw = np.zeros((grids.shape[0], 85), dtype=np.float32)
    cell = 2 * 8 + 3  # stride 8, gx=3, gy=2
    raw[cell, :6] = [0.5, 0.5, math.log(2.0), math.log(4.0), 0.9, 0.9]
    dup = 2 * 8 + 4  # neighbouring cell predicting nearly the same box, lower score
    raw[dup, :6] = [-0.4, 0.5, math.log(2.0), math.log(4.0), 0.8, 0.8]
    raw[0, :6] = [0.5, 0.5, 0.0, 0.0, 0.9, 0.1]  # person score 0.09 < threshold
    raw[1, :5] = [0.5, 0.5, 0.0, 0.0, 0.95]
    raw[1, 5 + 2] = 0.99  # a car, not a person
    dets = decode_persons(
        raw, grids, strides, ratio=0.5, width=128, height=128, score_thr=0.35, nms_thr=0.45
    )
    assert len(dets) == 1
    # centre (28, 20), size (16, 32) in input pixels -> /ratio -> /128
    assert dets[0].box == pytest.approx((0.3125, 0.0625, 0.5625, 0.5625))
    assert dets[0].score == pytest.approx(0.81)


def test_nms_keeps_best_of_overlaps() -> None:
    boxes = np.array([[0, 0, 10, 10], [1, 1, 10, 10], [20, 20, 30, 30]], dtype=np.float32)
    scores = np.array([0.8, 0.9, 0.5], dtype=np.float32)
    assert nms(boxes, scores, 0.45) == [1, 2]


def test_input_size_and_provider_selection() -> None:
    p = Path("yolox_tiny.onnx")
    assert resolve_input_size(None, [1, 3, 416, 416], p) == (416, 416)
    assert resolve_input_size(None, ["batch", 3, "h", "w"], p) == (416, 416)
    assert resolve_input_size(None, [1, 3, "h", "w"], Path("yolox_s.onnx")) == (640, 640)
    assert resolve_input_size(320, [1, 3, 416, 416], p) == (320, 320)
    assert select_providers(["CPUExecutionProvider"]) == ["CPUExecutionProvider"]
    assert select_providers(["OpenVINOExecutionProvider", "CPUExecutionProvider"])[0] == (
        "OpenVINOExecutionProvider"
    )


def test_yolox_missing_model(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        YoloxOnnxDetector(tmp_path / "nope.onnx")


@needs_tiny
def test_real_yolox_tiny_on_synthetic_image() -> None:
    det = YoloxOnnxDetector(TINY, threads=2)
    assert det.input_size == (416, 416)
    assert "CPUExecutionProvider" in det.providers
    rng = np.random.default_rng(0)
    image = rng.integers(0, 256, size=(360, 640, 3), dtype=np.uint8)
    dets = det.detect(pixel_frame(image))
    assert isinstance(dets, list)
    for d in dets:
        assert all(0.0 <= v <= 1.0 for v in d.box) and d.score > 0.35
    with pytest.raises(TypeError):
        det.detect(synthetic_frame([]))
    with pytest.raises(ValueError, match="rows"):
        det.postprocess(np.zeros((10, 85), dtype=np.float32), 1.0, 640, 360)
