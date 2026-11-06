import dataclasses
import subprocess
import sys
from typing import Any

import pytest

from rv_contracts import (
    AnalyticsModule,
    AppearanceHints,
    Clock,
    Detection,
    Detector,
    EdgeEvent,
    EventSink,
    Frame,
    FrameSource,
    SiteConfig,
    Track,
    Tracker,
    TrackFrame,
)


def _frame() -> Frame:
    return Frame(camera_id="c1", ts=1.0, index=0, width=640, height=360, image=None)


def test_dataclasses_are_frozen_and_slotted() -> None:
    track = Track(track_id="tr-1", box=(0.1, 0.1, 0.2, 0.4), score=0.9, first_seen_ts=1.0)
    assert track.hints == AppearanceHints(uniform_score=None)
    for obj in (
        Detection(box=(0.1, 0.1, 0.2, 0.4), score=0.8),
        track,
        _frame(),
        TrackFrame(camera_id="c1", ts=1.0, index=0, tracks=(track,)),
        AppearanceHints(uniform_score=0.7),
    ):
        assert not hasattr(obj, "__dict__")
        first_field = dataclasses.fields(obj)[0].name
        with pytest.raises(dataclasses.FrozenInstanceError):
            setattr(obj, first_field, None)


class _Clock:
    def now(self) -> float:
        return 42.0


class _Source:
    camera_id = "c1"

    def open(self) -> None: ...

    def read(self) -> Frame | None:
        return _frame()

    def close(self) -> None: ...


class _Detector:
    def detect(self, frame: Frame) -> list[Detection]:
        return [Detection(box=(0.1, 0.1, 0.2, 0.4), score=0.9)]


class _Tracker:
    def update(self, detections: list[Detection], frame: Frame) -> list[Track]:
        return []

    def reset(self) -> None: ...


class _Sink:
    def __init__(self) -> None:
        self.events: list[EdgeEvent] = []

    def publish(self, event: EdgeEvent) -> None:
        self.events.append(event)


class _Module:
    @property
    def name(self) -> str:
        return "noop"

    def configure(self, config: SiteConfig) -> None: ...

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        return []

    def on_tick(self, now: float) -> list[EdgeEvent]:
        return []

    def snapshot(self) -> dict[str, Any]:
        return {}


def test_implementations_satisfy_protocols() -> None:
    # Statically checked by mypy as well: these assignments must type-check.
    clock: Clock = _Clock()
    source: FrameSource = _Source()
    detector: Detector = _Detector()
    tracker: Tracker = _Tracker()
    sink: EventSink = _Sink()
    module: AnalyticsModule = _Module()
    for obj, proto in [
        (clock, Clock), (source, FrameSource), (detector, Detector), (tracker, Tracker),
        (sink, EventSink), (module, AnalyticsModule),
    ]:
        assert isinstance(obj, proto)
    assert not isinstance(_Clock(), Detector)


def test_contracts_do_not_import_numpy() -> None:
    code = "import sys, rv_contracts, rv_contracts.fixtures; print('numpy' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "False"
