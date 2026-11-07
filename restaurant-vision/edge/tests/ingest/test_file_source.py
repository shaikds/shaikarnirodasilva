from __future__ import annotations

from pathlib import Path

import pytest
from rv_contracts import CameraStatus

from rv_edge.ingest.file import FileSource
from rv_edge.interfaces import SourceSpec

from .fakes import FakeTime, FakeVideoFile, ManualClock


def make(
    n_frames: int = 12,
    *,
    loop: bool = True,
    realtime: bool = False,
    fake_time: FakeTime | None = None,
    clock: ManualClock | None = None,
) -> FileSource:
    fake_time = fake_time or FakeTime()
    return FileSource(
        SourceSpec(camera_id="demo", kind="file", url="demo.mp4", loop=loop),
        clock=clock or ManualClock(start=500.0),
        target_fps=5.0,
        realtime=realtime,
        capture_factory=lambda path: FakeVideoFile(n_frames, fps=25.0),
        sleep=fake_time.sleep,
        monotonic=fake_time.monotonic,
    )


def values(source: FileSource, n: int) -> list[int | None]:
    out: list[int | None] = []
    for _ in range(n):
        frame = source.read()
        out.append(None if frame is None else int(frame.image[0, 0, 0]))
    return out


def test_decimates_to_target_fps_and_uses_video_time() -> None:
    src = make(n_frames=100)
    src.open()
    frames = [src.read() for _ in range(4)]
    assert [int(f.image[0, 0, 0]) for f in frames if f] == [0, 5, 10, 15]
    assert [f.index for f in frames if f] == [0, 1, 2, 3]
    assert [f.ts for f in frames if f] == pytest.approx([500.0, 500.2, 500.4, 500.6])


def test_loops_and_keeps_video_time_increasing() -> None:
    src = make(n_frames=12, loop=True)
    src.open()
    frames = [src.read() for _ in range(5)]
    assert [int(f.image[0, 0, 0]) for f in frames if f] == [0, 5, 10, 3, 8]
    ts = [f.ts for f in frames if f]
    assert ts == sorted(ts) and ts[3] == pytest.approx(500.0 + 15 / 25)
    assert src.stats().connected


def test_non_looping_file_ends() -> None:
    src = make(n_frames=12, loop=False)
    src.open()
    assert values(src, 5) == [0, 5, 10, None, None]
    stats = src.stats()
    assert not stats.connected and stats.status is CameraStatus.OFFLINE


def test_realtime_paces_and_skips_when_lagging() -> None:
    fake_time = FakeTime()
    clock = ManualClock(start=42.0)
    src = make(n_frames=1000, realtime=True, fake_time=fake_time, clock=clock)
    src.open()
    assert values(src, 2) == [0, 5]
    assert fake_time.slept == pytest.approx([0.2])
    fake_time.t += 0.5  # processing fell behind by 2.5 frame periods
    assert values(src, 1) == [15]
    assert src.read() is not None
    assert src.read().ts == 42.0  # type: ignore[union-attr]


def test_missing_file_raises_clear_error(tmp_path: Path) -> None:
    src = FileSource(
        SourceSpec(camera_id="demo", kind="file", url=str(tmp_path / "nope.mp4")),
        clock=ManualClock(),
        target_fps=5.0,
    )
    with pytest.raises(FileNotFoundError, match="nope.mp4"):
        src.open()
    with pytest.raises(ValueError):
        FileSource(SourceSpec(camera_id="d", kind="file"), clock=ManualClock(), target_fps=5)


def test_read_before_open_and_after_close() -> None:
    src = make()
    assert src.read() is None
    src.open()
    assert src.read() is not None
    src.close()
    assert src.read() is None
