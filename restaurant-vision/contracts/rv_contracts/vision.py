"""Edge hot-path internals (architecture 5.2): frozen slotted dataclasses and protocols.

These never leave the edge process and are not serialized; they are plain dataclasses (no
pydantic validation cost per frame). Boxes are normalized ``(x1, y1, x2, y2)``, see
:mod:`rv_contracts.geometry`. Timestamps are Unix epoch seconds from the runtime's
:class:`Clock` (a simulated clock in tests and the simulator).

Privacy: ``Frame.image`` exists only in RAM and must never be persisted or sent anywhere.
``Track.track_id`` is random, camera-scoped and rotated at least daily
(``Thresholds.track_id_ttl_h``). ``AppearanceHints`` holds scalars only: no embeddings.

Protocols are ``runtime_checkable`` (``isinstance`` checks member presence only). Read-only
attributes (``FrameSource.camera_id``, ``AnalyticsModule.name``) are declared as properties so
that both plain attributes and properties satisfy them.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from .config import SiteConfig
from .events import EdgeEvent
from .geometry import Box


@dataclass(frozen=True, slots=True)
class Detection:
    """One person detection."""

    box: Box
    """Normalized ``(x1, y1, x2, y2)``."""
    score: float
    """Detector confidence, 0..1."""


@dataclass(frozen=True, slots=True)
class AppearanceHints:
    """Scalar appearance cues computed in RAM and discarded. Never an embedding."""

    uniform_score: float | None = None
    """0..1 similarity of the torso colour to the site's calibrated staff uniform; None if
    not computed (no calibration, or crop too small)."""


@dataclass(frozen=True, slots=True)
class Track:
    """A tracked person on one camera."""

    track_id: str
    """Random, camera-scoped, rotated at least daily. Not linkable across cameras or days."""
    box: Box
    score: float
    first_seen_ts: float
    """Epoch seconds when this track id first appeared."""
    hints: AppearanceHints = field(default_factory=AppearanceHints)


@dataclass(frozen=True, slots=True)
class Frame:
    """A decoded frame. For real cameras ``image`` is a numpy ``HxWx3`` uint8 BGR array that
    lives only in RAM and is never persisted. Simulated sources (``rv_sim``) put a
    ``rv_edge.interfaces.SyntheticImage`` there instead: ground-truth person boxes and uniform
    scores, no pixels (the simulated detector and hint extractor read it)."""

    camera_id: str
    ts: float
    """Capture time, epoch seconds."""
    index: int
    """Monotonic frame counter per camera (after fps decimation)."""
    width: int
    """Source image width in pixels."""
    height: int
    """Source image height in pixels."""
    image: Any
    """numpy array (never persisted) or ``SyntheticImage``; typed ``Any`` to keep numpy and
    edge internals out of the contracts. Check ``hasattr(image, "shape")`` before treating it
    as pixels."""


@dataclass(frozen=True, slots=True)
class TrackFrame:
    """Tracker output for one frame; the analytics input."""

    camera_id: str
    ts: float
    index: int
    tracks: tuple[Track, ...]


@runtime_checkable
class Clock(Protocol):
    """Time source. ``SimClock`` (simulator/tests) may run accelerated."""

    def now(self) -> float:
        """Current time, Unix epoch seconds."""
        ...


@runtime_checkable
class FrameSource(Protocol):
    """Strategy for getting frames from one camera (RTSP, file, simulated)."""

    @property
    def camera_id(self) -> str: ...

    def open(self) -> None: ...

    def read(self) -> Frame | None:
        """Next frame at ~``target_fps``, or None if none is available right now (reconnecting,
        or a finite source is exhausted). Should not raise for transient errors."""
        ...

    def close(self) -> None: ...


@runtime_checkable
class Detector(Protocol):
    """Strategy for person detection (YOLOX ONNX, simulated)."""

    def detect(self, frame: Frame) -> list[Detection]: ...


@runtime_checkable
class Tracker(Protocol):
    """Multi-object tracker for one camera."""

    def update(self, detections: list[Detection], frame: Frame) -> list[Track]: ...

    def reset(self) -> None: ...


@runtime_checkable
class EventSink(Protocol):
    """Observer receiving every published event (outbox, local WebSocket, logger)."""

    def publish(self, event: EdgeEvent) -> None: ...


@runtime_checkable
class AnalyticsModule(Protocol):
    """A pluggable analytics module (tables, queue, occupancy ...). Single-threaded, pure logic:
    no I/O, time only from the arguments."""

    @property
    def name(self) -> str: ...

    def configure(self, config: SiteConfig) -> None:
        """(Re)configure from a site config; called at start and on every config change."""
        ...

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]: ...

    def on_tick(self, now: float) -> list[EdgeEvent]:
        """Called about once per second for timers."""
        ...

    def snapshot(self) -> dict[str, Any]:
        """JSON-safe live state for ``GET /local/state`` and debugging."""
        ...
