from __future__ import annotations

import logging
import time
from collections.abc import Callable, Iterator

import pytest
from rv_contracts import CameraStatus, Frame, FrameSource

from rv_edge.ingest.rtsp import RtspSource, next_backoff
from rv_edge.interfaces import SourceSpec

from .fakes import CaptureSequence, FakeLiveCapture, ManualClock

URL = "rtsp://admin:s3cret@192.168.1.64:554/Streaming/Channels/102"


def wait_until(cond: Callable[[], bool], timeout: float = 3.0) -> None:
    deadline = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > deadline:
            raise AssertionError("condition not met in time")
        time.sleep(0.005)


def read_frame(source: RtspSource, timeout: float = 3.0) -> Frame:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        frame = source.read()
        if frame is not None:
            return frame
    raise AssertionError("no frame")


@pytest.fixture
def make_source() -> Iterator[Callable[..., RtspSource]]:
    created: list[RtspSource] = []

    def make(factory: CaptureSequence, **kwargs: object) -> RtspSource:
        options: dict[str, object] = {
            "clock": ManualClock(),
            "target_fps": 50.0,
            "capture_factory": factory,
            "backoff_initial_s": 0.01,
            "backoff_max_s": 0.04,
            "max_wait_s": 0.2,
        }
        options.update(kwargs)
        src = RtspSource(SourceSpec(camera_id="cam-1", kind="rtsp", url=URL), **options)  # type: ignore[arg-type]
        created.append(src)
        return src

    yield make
    for src in created:
        src.close()


def test_backoff_doubles_up_to_30_seconds() -> None:
    delays = [1.0]
    for _ in range(6):
        delays.append(next_backoff(delays[-1]))
    assert delays == [1.0, 2.0, 4.0, 8.0, 16.0, 30.0, 30.0]


def test_requires_url() -> None:
    with pytest.raises(ValueError):
        RtspSource(SourceSpec(camera_id="c", kind="rtsp"), clock=ManualClock(), target_fps=5)


def test_frames_have_increasing_index_clock_ts_and_shape(
    make_source: Callable[..., RtspSource],
) -> None:
    clock = ManualClock(start=1000.0)
    src = make_source(CaptureSequence([FakeLiveCapture()]), clock=clock)
    assert isinstance(src, FrameSource)
    assert src.read() is None  # not opened yet
    src.open()
    frames = [read_frame(src) for _ in range(3)]
    assert [f.index for f in frames] == [0, 1, 2]
    assert all(f.camera_id == "cam-1" and f.ts == 1000.0 for f in frames)
    assert (frames[0].width, frames[0].height) == (6, 4)


def test_read_returns_latest_frame_and_skips_stale_ones(
    make_source: Callable[..., RtspSource],
) -> None:
    src = make_source(CaptureSequence([FakeLiveCapture(interval_s=0.001)]))
    src.open()
    first = read_frame(src)
    time.sleep(0.1)  # the camera produces many frames meanwhile
    second = read_frame(src)
    assert int(second.image[0, 0, 0]) - int(first.image[0, 0, 0]) > 5
    assert second.index == first.index + 1


def test_read_is_paced_to_target_fps(make_source: Callable[..., RtspSource]) -> None:
    src = make_source(CaptureSequence([FakeLiveCapture(interval_s=0.001)]), target_fps=20.0)
    src.open()
    read_frame(src)
    start = time.monotonic()
    for _ in range(4):
        read_frame(src)
    assert time.monotonic() - start >= 4 * 0.05 * 0.9


def test_reconnects_with_backoff_after_failures(make_source: Callable[..., RtspSource]) -> None:
    healthy = FakeLiveCapture()
    factory = CaptureSequence(
        [
            FakeLiveCapture(opened=False),
            FakeLiveCapture(opened=False),
            FakeLiveCapture(fail_after=3),
            healthy,
        ]
    )
    src = make_source(factory)
    src.open()
    wait_until(lambda: healthy.count > 0)
    assert factory.calls == 4
    frame = read_frame(src)
    assert frame.image is not None
    assert src.stats().connected


def test_stats_transitions(make_source: Callable[..., RtspSource]) -> None:
    capture = FakeLiveCapture(fail_after=20)
    src = make_source(CaptureSequence([capture]), target_fps=5.0)
    stats = src.stats()
    assert stats.status is CameraStatus.OFFLINE and not stats.connected
    src.open()
    wait_until(lambda: capture.count >= 5)
    stats = src.stats()
    assert stats.connected and stats.status is CameraStatus.OK
    assert stats.fps > 2.5 and stats.last_frame_age_s is not None
    wait_until(lambda: not src.stats().connected)  # stream fails, camera unreachable after
    assert src.stats().status is CameraStatus.OFFLINE
    src.close()
    assert src.stats().status is CameraStatus.OFFLINE


def test_close_stops_reader_and_releases(make_source: Callable[..., RtspSource]) -> None:
    capture = FakeLiveCapture()
    src = make_source(CaptureSequence([capture]))
    src.open()
    read_frame(src)
    src.close()
    assert capture.released
    assert src.read() is None


def test_credentials_never_logged(
    make_source: Callable[..., RtspSource], caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="rv_edge")
    factory = CaptureSequence([FakeLiveCapture(opened=False), FakeLiveCapture(fail_after=1)])
    src = make_source(factory)
    src.open()
    wait_until(lambda: factory.calls >= 3)
    src.close()
    assert "s3cret" not in caplog.text
    assert "admin" not in caplog.text
    assert "***@192.168.1.64" in caplog.text
    assert "s3cret" not in src.redacted_url
