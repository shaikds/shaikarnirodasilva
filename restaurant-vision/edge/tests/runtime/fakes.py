"""Fakes for the vision pipeline and the analytics engine, plus small test helpers."""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from rv_contracts import (
    AckVia,
    AlertAcknowledged,
    AlertKind,
    AlertRaised,
    AlertSeverity,
    AlertStatus,
    AlertView,
    CameraConfig,
    CameraStatus,
    Clock,
    EdgeEvent,
    EventsAccepted,
    Frame,
    Polygon,
    SiteConfig,
    TableLive,
    TableState,
    Track,
    TrackFrame,
    make_event,
)

from rv_edge.interfaces import (
    Box,
    CameraHealthInfo,
    LiveState,
    SourceSpec,
    SyntheticImage,
    SyntheticPerson,
)

PERSON_BOX: Box = (0.25, 0.25, 0.5, 0.75)
ALERT_ID = "alert-1"
TOKEN = "device-token-secret"


def wait_until(cond: Callable[[], bool], timeout: float = 3.0, interval: float = 0.01) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if cond():
            return True
        time.sleep(interval)
    return cond()


class ManualClock:
    """Deterministic clock; ``advance`` moves time forward."""

    def __init__(self, start: float = 1_793_988_000.0) -> None:
        self._now = start
        self._lock = threading.Lock()

    def now(self) -> float:
        with self._lock:
            return self._now

    def advance(self, seconds: float) -> None:
        with self._lock:
            self._now += seconds


class FakePipeline:
    """Emits ``max_frames`` track frames with one person, then idles."""

    def __init__(
        self,
        camera: CameraConfig,
        spec: SourceSpec,
        *,
        clock: Clock,
        privacy_masks: list[Polygon],
        uniform_hsv: tuple[float, float, float] | None,
        max_frames: int,
        image: Any,
    ) -> None:
        self.camera = camera
        self.spec = spec
        self.clock = clock
        self.privacy_masks = privacy_masks
        self.uniform_hsv = uniform_hsv
        self.max_frames = max_frames
        self.image = image
        self.started = False
        self.stopped = False
        self.count = 0
        self._last: Frame | None = None
        self._lock = threading.Lock()

    @property
    def camera_id(self) -> str:
        return self.camera.camera_id

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.stopped = True

    def step(self) -> TrackFrame | None:
        if not self.started or self.stopped or self.count >= self.max_frames:
            time.sleep(0.002)
            return None
        ts = self.clock.now()
        image = (
            self.image
            if self.image is not None
            else SyntheticImage(people=(SyntheticPerson(PERSON_BOX),))
        )
        frame = Frame(self.camera_id, ts, self.count, 320, 240, image)
        with self._lock:
            self._last = frame
        track = Track(f"trk-{self.camera_id}", PERSON_BOX, 0.9, ts)
        self.count += 1
        time.sleep(0.001)
        return TrackFrame(self.camera_id, ts, frame.index, (track,))

    def health(self) -> CameraHealthInfo:
        return CameraHealthInfo(self.camera_id, CameraStatus.OK, 5.0, 0.2)

    def snapshot(self) -> tuple[Frame, Sequence[Box]] | None:
        with self._lock:
            return None if self._last is None else (self._last, [PERSON_BOX])


class FakeFactory:
    """``CameraPipelineFactory`` that records every pipeline it builds."""

    def __init__(self, *, max_frames: int = 10_000, image: Any = None) -> None:
        self.max_frames = max_frames
        self.image = image
        self.built: list[FakePipeline] = []
        self.kwargs: list[dict[str, Any]] = []

    def __call__(
        self,
        camera: CameraConfig,
        spec: SourceSpec,
        *,
        clock: Clock,
        privacy_masks: list[Polygon],
        detector_backend: str = "auto",
        model_path: Path | None = None,
        uniform_hsv: tuple[float, float, float] | None = None,
    ) -> FakePipeline:
        pipeline = FakePipeline(
            camera,
            spec,
            clock=clock,
            privacy_masks=privacy_masks,
            uniform_hsv=uniform_hsv,
            max_frames=self.max_frames,
            image=self.image,
        )
        self.built.append(pipeline)
        self.kwargs.append({"detector_backend": detector_backend, "model_path": model_path})
        return pipeline


class FakeEngine:
    """Raises one ``waiter_needed`` alert on the first frame; records every call and the
    threads it was called from."""

    def __init__(self, config: SiteConfig, clock: Clock) -> None:
        self.config = config
        self.clock = clock
        self.configs: list[SiteConfig] = [config]
        self.frames: list[TrackFrame] = []
        self.ticks: list[float] = []
        self.acks: list[tuple[str, float, AckVia]] = []
        self.threads: set[str] = set()
        self.raised_at: float | None = None
        self.acked: tuple[float, AckVia] | None = None

    def _seen(self) -> None:
        self.threads.add(threading.current_thread().name)

    def configure(self, config: SiteConfig) -> None:
        self._seen()
        self.config = config
        self.configs.append(config)

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        self._seen()
        self.frames.append(tf)
        if self.raised_at is None:
            self.raised_at = tf.ts
            return [
                make_event(
                    AlertRaised,
                    self.config.site_id,
                    tf.ts,
                    alert_id=ALERT_ID,
                    kind=AlertKind.WAITER_NEEDED,
                    table_id="t1",
                    severity=AlertSeverity.WARN,
                )
            ]
        return []

    def on_tick(self, now: float) -> list[EdgeEvent]:
        self._seen()
        self.ticks.append(now)
        return []

    def apply_ack(self, alert_id: str, ack_at: float, via: AckVia) -> list[EdgeEvent]:
        self._seen()
        self.acks.append((alert_id, ack_at, via))
        if alert_id != ALERT_ID or self.raised_at is None or self.acked is not None:
            return []
        self.acked = (ack_at, via)
        return [
            make_event(
                AlertAcknowledged,
                self.config.site_id,
                ack_at,
                alert_id=alert_id,
                ack_at=ack_at,
                via=via,
            )
        ]

    def live(self) -> LiveState:
        self._seen()
        alerts: list[AlertView] = []
        if self.raised_at is not None:
            alerts.append(
                AlertView(
                    alert_id=ALERT_ID,
                    site_id=self.config.site_id,
                    kind=AlertKind.WAITER_NEEDED,
                    severity=AlertSeverity.WARN,
                    status=AlertStatus.ACKNOWLEDGED if self.acked else AlertStatus.OPEN,
                    table_id="t1",
                    table_label="1",
                    zone_id=None,
                    raised_at=self.raised_at,
                    acked_at=self.acked[0] if self.acked else None,
                    ack_via=self.acked[1] if self.acked else None,
                    resolved_at=None,
                    resolve_reason=None,
                )
            )
        tables = [
            TableLive(
                table_id=t.table_id,
                label=t.label,
                seats=t.seats,
                state=TableState.EMPTY,
                guest_count=0,
                since_ts=None,
                open_alert_ids=[ALERT_ID] if alerts and t.table_id == "t1" else [],
            )
            for t in self.config.tables
        ]
        return LiveState(tables=tables, occupancy=None, queues=[], open_alerts=alerts)


class EngineHolder:
    """``EngineBuilder`` that keeps the engines it builds."""

    def __init__(self) -> None:
        self.engines: list[FakeEngine] = []

    def __call__(self, config: SiteConfig, *, clock: Clock) -> FakeEngine:
        engine = FakeEngine(config, clock)
        self.engines.append(engine)
        return engine

    @property
    def engine(self) -> FakeEngine:
        assert self.engines, "engine not built yet"
        return self.engines[-1]


class RecordingSink:
    def __init__(self) -> None:
        self.events: list[EdgeEvent] = []
        self._lock = threading.Lock()

    def publish(self, event: EdgeEvent) -> None:
        with self._lock:
            self.events.append(event)

    def of_type(self, type_value: str) -> list[EdgeEvent]:
        with self._lock:
            return [e for e in self.events if e.type.value == type_value]


def checkerboard(width: int = 320, height: int = 240, cell: int = 4) -> np.ndarray:
    """High-frequency test image: blurring flattens it."""
    ys, xs = np.indices((height, width))
    board = (((xs // cell) + (ys // cell)) % 2 * 255).astype(np.uint8)
    return np.dstack([board, board, board])


class FakeCloud:
    """Minimal cloud edge API behind ``httpx.MockTransport``."""

    def __init__(self) -> None:
        self.stored: dict[str, dict[str, Any]] = {}
        self.requests: list[httpx.Request] = []
        self.event_statuses: list[int] = []
        self.reject_event_ids: set[str] = set()
        self.pages: list[dict[str, Any]] = []
        self.cursor = "c0"
        self.config: SiteConfig | None = None
        self.config_puts: list[dict[str, Any]] = []
        self.status_override: int | None = None

    @property
    def etag(self) -> str | None:
        return None if self.config is None else f'"{self.config.config_version}"'

    def requests_to(self, method: str, path: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == method and r.url.path == path]

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("Authorization") != f"Bearer {TOKEN}":
            return httpx.Response(401, json={"detail": "bad token"})
        if self.status_override is not None:
            return httpx.Response(self.status_override)
        path = request.url.path
        if path == "/api/v1/edge/events" and request.method == "POST":
            if self.event_statuses:
                return httpx.Response(self.event_statuses.pop(0))
            events = json.loads(request.content)["events"]
            if any(e["event_id"] in self.reject_event_ids for e in events):
                return httpx.Response(422, json={"detail": "bad event"})
            accepted = 0
            for event in events:
                if event["event_id"] not in self.stored:
                    self.stored[event["event_id"]] = event
                    accepted += 1
            body = EventsAccepted(accepted=accepted, duplicates=len(events) - accepted)
            return httpx.Response(200, content=body.model_dump_json())
        if path == "/api/v1/edge/commands":
            page: dict[str, Any] = (
                self.pages.pop(0) if self.pages else {"cursor": self.cursor, "commands": []}
            )
            self.cursor = str(page["cursor"])
            return httpx.Response(200, json=page)
        if path == "/api/v1/edge/config" and request.method == "GET":
            if self.config is None:
                return httpx.Response(404)
            if request.headers.get("If-None-Match") == self.etag:
                return httpx.Response(304)
            return httpx.Response(
                200, content=self.config.model_dump_json(), headers={"ETag": self.etag or ""}
            )
        if path == "/api/v1/edge/config" and request.method == "PUT":
            data = json.loads(request.content)
            self.config_puts.append(data)
            version = (self.config.config_version if self.config else 0) + 1
            self.config = SiteConfig.model_validate({**data, "config_version": version})
            return httpx.Response(
                200, content=self.config.model_dump_json(), headers={"ETag": self.etag or ""}
            )
        return httpx.Response(404)
