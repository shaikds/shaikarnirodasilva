from __future__ import annotations

import pytest
from rv_contracts import CameraStatus, Frame

from rv_edge.ingest import FileSource, RtspSource, build_source
from rv_edge.ingest.stats import RateMeter, classify_health
from rv_edge.interfaces import SourceSpec

from .fakes import ManualClock


class SimSource:
    camera_id = "sim-1"

    def open(self) -> None: ...

    def read(self) -> Frame | None:
        return None

    def close(self) -> None: ...


def test_build_source_per_kind() -> None:
    clock = ManualClock()
    rtsp = build_source(
        SourceSpec(camera_id="a", kind="rtsp", url="rtsp://h/x"), clock=clock, target_fps=5
    )
    assert isinstance(rtsp, RtspSource)
    file = build_source(
        SourceSpec(camera_id="b", kind="file", url="x.mp4", options={"realtime": False}),
        clock=clock,
        target_fps=5,
    )
    assert isinstance(file, FileSource)
    sim = SimSource()
    built = build_source(
        SourceSpec(camera_id="sim-1", kind="simulated", options={"source": sim}),
        clock=clock,
        target_fps=5,
    )
    assert built is sim


def test_build_source_errors() -> None:
    clock = ManualClock()
    with pytest.raises(ValueError, match="simulator"):
        build_source(SourceSpec(camera_id="s", kind="simulated"), clock=clock, target_fps=5)
    with pytest.raises(TypeError):
        build_source(
            SourceSpec(camera_id="s", kind="simulated", options={"source": object()}),
            clock=clock,
            target_fps=5,
        )
    with pytest.raises(ValueError):
        build_source(SourceSpec(camera_id="r", kind="rtsp"), clock=clock, target_fps=5)


def test_rate_meter_windowed_rate() -> None:
    meter = RateMeter(window_s=5.0)
    meter.reset(0.0)
    for i in range(1, 51):
        meter.tick(i * 0.2)  # 5 fps for 10 s
    assert meter.rate(10.0) == pytest.approx(5.0)
    assert meter.rate(20.0) == 0.0
    assert RateMeter().rate(1.0) == 0.0


@pytest.mark.parametrize(
    ("connected", "fps", "age", "since", "expected"),
    [
        (True, 5.0, 0.1, 10.0, CameraStatus.OK),
        (True, 2.4, 0.1, 10.0, CameraStatus.DEGRADED),  # below 50% of 5 fps
        (True, 5.0, 6.0, 10.0, CameraStatus.DEGRADED),  # last frame older than 5 s
        (True, 5.0, 31.0, 40.0, CameraStatus.OFFLINE),  # older than 30 s
        (False, 5.0, 0.1, 10.0, CameraStatus.OFFLINE),  # disconnected
        (True, 0.0, None, 1.0, CameraStatus.DEGRADED),  # starting, no frame yet
        (True, 0.0, None, 31.0, CameraStatus.OFFLINE),  # never got a frame
    ],
)
def test_classify_health(
    connected: bool, fps: float, age: float | None, since: float, expected: CameraStatus
) -> None:
    status = classify_health(
        connected=connected, fps=fps, target_fps=5.0, last_frame_age_s=age, since_start_s=since
    )
    assert status is expected
