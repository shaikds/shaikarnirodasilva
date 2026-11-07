from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from rv_contracts import CameraConfig, CameraStatus, TrackFrame

from rv_edge.interfaces import CameraPipeline, SourceSpec, SyntheticImage, SyntheticPerson
from rv_edge.vision import factory as vision_factory
from rv_edge.vision.detectors import ModelNotFoundError, SimulatedDetector
from rv_edge.vision.factory import build_camera_pipeline, inference_threads, set_inference_threads
from rv_edge.vision.hints import NullHints, SyntheticHints
from rv_edge.vision.pipeline import DefaultCameraPipeline
from rv_edge.vision.tracking import ByteTrackTracker

from .fakes import (
    ListSource,
    ManualClock,
    RecordingDetector,
    StatsListSource,
    pixel_frame,
    synthetic_frame,
    walking_people,
)

MASK_RIGHT = [(0.75, 0.0), (1.0, 0.0), (1.0, 1.0), (0.75, 1.0)]


def staff_and_guests(n: int) -> list[list[SyntheticPerson]]:
    frames = []
    for boxes in walking_people(n):
        walker, other, seated = boxes
        frames.append(
            [
                SyntheticPerson(walker, uniform_score=0.9),
                SyntheticPerson(other, uniform_score=0.1),
                SyntheticPerson(seated, uniform_score=None),
            ]
        )
    return frames


def run(pipeline: CameraPipeline, clock: ManualClock, n: int, dt: float = 0.2) -> list[TrackFrame]:
    out = []
    for _ in range(n):
        tf = pipeline.step()
        if tf is not None:
            out.append(tf)
        clock.advance(dt)
    return out


def sim_pipeline(
    clock: ManualClock, frames: list[list[SyntheticPerson]], **kwargs: object
) -> DefaultCameraPipeline:
    source = ListSource([synthetic_frame(p, index=i) for i, p in enumerate(frames)], clock=clock)
    return DefaultCameraPipeline(
        "cam-1",
        source,
        SimulatedDetector(),
        ByteTrackTracker(frame_rate=5),
        SyntheticHints(),
        clock=clock,
        target_fps=5.0,
        **kwargs,  # type: ignore[arg-type]
    )


def test_pipeline_with_fake_source_produces_trackframes_with_hints() -> None:
    clock = ManualClock()
    pipeline = sim_pipeline(clock, staff_and_guests(20))
    assert isinstance(pipeline, CameraPipeline)
    assert pipeline.step() is None, "not started"
    pipeline.start()
    out = run(pipeline, clock, 25)
    assert len(out) == 20
    assert [tf.index for tf in out] == list(range(20))
    assert all(tf.camera_id == "cam-1" for tf in out)
    assert out[1].ts - out[0].ts == pytest.approx(0.2)
    ids = [{t.track_id for t in tf.tracks} for tf in out]
    assert all(s == ids[0] and len(s) == 3 for s in ids), "stable ids across the clip"
    scores = sorted((t.hints.uniform_score is None, t.hints.uniform_score) for t in out[-1].tracks)
    assert scores == [(False, 0.1), (False, 0.9), (True, None)]


def test_privacy_masks_applied_before_detection_synthetic() -> None:
    clock = ManualClock()
    frames = staff_and_guests(5)  # person 2 walks left from x=0.85: foot inside the mask
    pipeline = sim_pipeline(clock, frames, privacy_masks=[MASK_RIGHT])
    pipeline.start()
    out = run(pipeline, clock, 5)
    assert all(len(tf.tracks) == 2 for tf in out)
    assert all(t.box[0] < 0.75 for tf in out for t in tf.tracks)


def test_privacy_masks_applied_before_detection_pixels() -> None:
    clock = ManualClock()
    detector = RecordingDetector(boxes=[(0.1, 0.1, 0.2, 0.6)])
    source = ListSource([pixel_frame(index=i) for i in range(3)], clock=clock)
    pipeline = DefaultCameraPipeline(
        "cam-1",
        source,
        detector,
        ByteTrackTracker(),
        NullHints(),
        clock=clock,
        target_fps=5.0,
        privacy_masks=[MASK_RIGHT],
    )
    pipeline.start()
    out = run(pipeline, clock, 3)
    seen = detector.seen[0]
    assert np.all(seen[:, 481:] == 0) and np.all(seen[:, :479] == 128)
    assert len(out[-1].tracks) == 1
    snap = pipeline.snapshot()
    assert snap is not None
    frame, boxes = snap
    assert np.all(frame.image[:, 481:] == 0), "snapshot frame is the masked one"
    assert list(boxes) == [(0.1, 0.1, 0.2, 0.6)]
    pipeline.stop()
    assert pipeline.snapshot() is None and source.closed


def test_health_transitions() -> None:
    clock = ManualClock(start=1000.0)
    source = StatsListSource([], clock=clock)
    pipeline = DefaultCameraPipeline(
        "cam-1",
        source,
        SimulatedDetector(),
        ByteTrackTracker(),
        NullHints(),
        clock=clock,
        target_fps=5.0,
    )
    assert pipeline.health().status is CameraStatus.OFFLINE, "not started"
    pipeline.start()
    assert source.opened
    starting = pipeline.health()
    assert starting.status is CameraStatus.DEGRADED and starting.last_frame_age_s is None

    def feed(n: int, dt: float) -> None:
        for _ in range(n):
            source.push(synthetic_frame([(0.1, 0.1, 0.2, 0.6)]))
            assert pipeline.step() is not None
            clock.advance(dt)

    feed(60, 0.2)  # 5 fps for 12 s
    ok = pipeline.health()
    assert ok.status is CameraStatus.OK and ok.fps == pytest.approx(5.0, abs=0.3)
    assert ok.camera_id == "cam-1" and ok.last_frame_age_s == pytest.approx(0.2)

    clock.advance(5.5)
    assert pipeline.health().status is CameraStatus.DEGRADED  # last frame > 5 s old
    clock.advance(25.0)
    assert pipeline.health().status is CameraStatus.OFFLINE  # > 30 s old

    feed(60, 0.2)
    assert pipeline.health().status is CameraStatus.OK
    feed(30, 0.5)  # 2 fps < 50% of 5 fps
    slow = pipeline.health()
    assert slow.status is CameraStatus.DEGRADED and slow.fps < 2.5

    feed(60, 0.2)
    source.connected = False
    assert pipeline.health().status is CameraStatus.OFFLINE  # disconnected
    source.connected = True
    assert pipeline.health().status is CameraStatus.OK
    pipeline.stop()
    stopped = pipeline.health()
    assert stopped.status is CameraStatus.OFFLINE and stopped.fps == 0.0


def camera(**kwargs: object) -> CameraConfig:
    return CameraConfig(camera_id="cam-1", name="Dining room", source="simulated", **kwargs)  # type: ignore[arg-type]


def test_build_camera_pipeline_simulated() -> None:
    clock = ManualClock()
    frames = staff_and_guests(6)
    source = ListSource([synthetic_frame(p, index=i) for i, p in enumerate(frames)], clock=clock)
    pipeline = build_camera_pipeline(
        camera(privacy_masks=[MASK_RIGHT]),
        SourceSpec(camera_id="cam-1", kind="simulated", options={"source": source}),
        clock=clock,
        privacy_masks=[MASK_RIGHT, [(0.0, 0.0), (0.01, 0.0), (0.0, 0.01)]],
    )
    assert isinstance(pipeline, CameraPipeline) and pipeline.camera_id == "cam-1"
    pipeline.start()
    out = run(pipeline, clock, 6)
    assert len(out) == 6 and all(len(tf.tracks) == 2 for tf in out)
    assert {t.hints.uniform_score for t in out[-1].tracks} == {0.9, None}
    assert pipeline.health().status is CameraStatus.OK


def test_build_camera_pipeline_simulated_noise_options() -> None:
    clock = ManualClock()
    frames = staff_and_guests(30)

    def track_counts(seed: int) -> list[int]:
        src = ListSource([synthetic_frame(p) for p in frames], clock=clock)
        spec = SourceSpec(
            camera_id="cam-1",
            kind="simulated",
            options={"source": src, "simulated_detector": {"miss_rate": 0.3, "seed": seed}},
        )
        p = build_camera_pipeline(camera(), spec, clock=clock, privacy_masks=[])
        p.start()
        return [len(tf.tracks) for tf in run(p, clock, 30)]

    assert track_counts(1) == track_counts(1)
    assert track_counts(1) != track_counts(2)


def test_build_camera_pipeline_errors(tmp_path: Path) -> None:
    clock = ManualClock()
    sim_spec = SourceSpec(camera_id="cam-1", kind="simulated", options={"source": ListSource([])})
    with pytest.raises(ValueError):
        build_camera_pipeline(
            camera(), sim_spec, clock=clock, privacy_masks=[], detector_backend="yolox"
        )
    rtsp_spec = SourceSpec(camera_id="cam-1", kind="rtsp", url="rtsp://u:p@10.0.0.9/x")
    with pytest.raises(ModelNotFoundError):
        build_camera_pipeline(
            CameraConfig(camera_id="cam-1", name="Door"),
            rtsp_spec,
            clock=clock,
            privacy_masks=[],
            model_path=tmp_path / "missing.onnx",
        )


def test_inference_threads_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RV_INFERENCE_THREADS", raising=False)
    monkeypatch.setenv("OMP_NUM_THREADS", "3")
    assert inference_threads() == 3
    monkeypatch.setenv("RV_INFERENCE_THREADS", "2")
    assert inference_threads() == 2
    set_inference_threads(1)
    try:
        assert inference_threads() == 1
    finally:
        set_inference_threads(None)
    with pytest.raises(ValueError):
        set_inference_threads(0)
    monkeypatch.delenv("RV_INFERENCE_THREADS")
    monkeypatch.delenv("OMP_NUM_THREADS")
    assert vision_factory.inference_threads() is None


def test_synthetic_image_type_is_what_simulator_sends() -> None:
    frame = synthetic_frame([(0.1, 0.1, 0.2, 0.6)])
    assert isinstance(frame.image, SyntheticImage)
