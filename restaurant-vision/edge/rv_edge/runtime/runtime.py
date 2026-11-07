"""``EdgeRuntime``: the facade that wires cameras, analytics, events, outbox and cloud sync.

Threads:

* one per camera (``rv-cam-<id>``): builds its ``CameraPipeline`` (with retry), calls
  ``step()`` in a loop and puts each ``TrackFrame`` on a bounded queue that drops the oldest
  frame when full; the resource governor adds a pause between frames under CPU pressure;
* one analytics thread (``rv-analytics``) that alone owns the ``AnalyticsEngine``: it consumes
  frames, ticks the engine about once per second of clock time, applies queued acks and config
  changes, publishes events to the bus, emits ``edge.heartbeat`` and keeps the latest
  ``LiveState`` for thread-safe reads;
* the cloud sync thread (:mod:`rv_edge.runtime.sync`).

The camera pipeline factory and the analytics engine builder are injected (tests pass fakes);
by default they are imported lazily from ``rv_edge.vision.factory`` and
``rv_edge.analytics.engine``.
"""

from __future__ import annotations

import functools
import importlib
import logging
import math
import queue
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import Future
from dataclasses import dataclass, field
from typing import Any, Generic, Protocol, TypeVar, cast, runtime_checkable

import httpx
from rv_contracts import (
    HEARTBEAT_INTERVAL_S,
    AckVia,
    AlertView,
    CameraConfig,
    CameraHealth,
    CameraSource,
    CameraStatus,
    Clock,
    DeviceStatus,
    EdgeEvent,
    EdgeHeartbeat,
    Frame,
    LiveSnapshot,
    PairResponse,
    SiteConfig,
    TrackFrame,
    make_event,
)

from rv_edge.interfaces import (
    AnalyticsEngine,
    Box,
    CameraHealthInfo,
    CameraPipeline,
    CameraPipelineFactory,
    LiveState,
    SourceSpec,
)

from . import EDGE_VERSION
from .bus import EventBus, LocalBroadcastSink, LogSink, OutboxSink
from .clock import SystemClock
from .config_store import ConfigStore
from .governor import ResourceGovernor
from .outbox import Outbox
from .pairing import pair as pair_device
from .secrets_store import SecretsStore
from .settings import EdgeSettings
from .snapshot import compose_snapshot, encode_jpeg
from .sync import CloudSync

log = logging.getLogger(__name__)

UNCONFIGURED_SITE_ID = "unconfigured"
LOCAL_DEVICE_ID = "edge-local"
"""Device id reported before the edge is paired."""

T = TypeVar("T")


class EngineBuilder(Protocol):
    """Signature of ``rv_edge.analytics.engine.build_analytics_engine``."""

    def __call__(self, config: SiteConfig, *, clock: Clock) -> AnalyticsEngine: ...


@runtime_checkable
class SnapshotCapable(Protocol):
    """Optional ``CameraPipeline`` extension used for setup snapshots and uniform calibration.

    ``snapshot()`` returns the latest frame processed by ``step()`` (privacy masks applied,
    RAM only) and every person box detected in it, or None before the first frame. Must be safe
    to call from another thread while ``step()`` runs.
    """

    def snapshot(self) -> tuple[Frame, Sequence[Box]] | None: ...


class ConfigRejected(ValueError):
    """A config cannot be applied on this edge (e.g. it belongs to another site)."""


class CalibrationError(RuntimeError):
    """Uniform calibration is not possible (no real image, or no hint extractor)."""


def default_pipeline_factory() -> CameraPipelineFactory:
    module = importlib.import_module("rv_edge.vision.factory")
    return cast(CameraPipelineFactory, module.build_camera_pipeline)


def default_engine_builder() -> EngineBuilder:
    module = importlib.import_module("rv_edge.analytics.engine")
    return cast(EngineBuilder, module.build_analytics_engine)


def empty_live_state() -> LiveState:
    return LiveState(tables=[], occupancy=None, queues=[], open_alerts=[])


def _finite(value: float | None, default: float = 0.0) -> float:
    if value is None or not math.isfinite(value):
        return default
    return max(0.0, float(value))


def to_camera_health(info: CameraHealthInfo) -> CameraHealth:
    age = info.last_frame_age_s
    return CameraHealth(
        camera_id=info.camera_id,
        status=info.status,
        fps=_finite(info.fps),
        last_frame_age_s=None if age is None or not math.isfinite(age) else max(0.0, age),
    )


class DropOldestQueue(Generic[T]):
    """Bounded thread-safe FIFO that discards the oldest item when full."""

    def __init__(self, maxsize: int) -> None:
        self._items: deque[T] = deque()
        self._maxsize = max(1, maxsize)
        self._cond = threading.Condition()
        self.dropped = 0

    def put(self, item: T) -> None:
        with self._cond:
            if len(self._items) >= self._maxsize:
                self._items.popleft()
                self.dropped += 1
            self._items.append(item)
            self._cond.notify()

    def get(self, timeout: float) -> T | None:
        with self._cond:
            if not self._items:
                self._cond.wait(timeout)
            return self._items.popleft() if self._items else None

    def wake(self) -> None:
        with self._cond:
            self._cond.notify_all()

    def __len__(self) -> int:
        with self._cond:
            return len(self._items)


@dataclass(frozen=True)
class Capture:
    """One grabbed frame (may be None when the pipeline cannot expose frames) and the person
    boxes to blur."""

    frame: Frame | None
    boxes: list[Box]
    kind: str


@dataclass
class _AckRequest:
    alert_id: str
    ack_at: float
    via: AckVia
    done: Future[list[EdgeEvent]] | None = None


@dataclass
class _ConfigRequest:
    config: SiteConfig
    done: Future[None] | None = field(default=None)


_Control = _AckRequest | _ConfigRequest


class CameraWorker:
    """Owns one camera thread: build pipeline (retrying), then ``step()`` until stopped."""

    def __init__(
        self,
        camera: CameraConfig,
        spec: SourceSpec,
        signature: tuple[Any, ...],
        build: Callable[[], CameraPipeline],
        frames: DropOldestQueue[TrackFrame],
        governor: ResourceGovernor,
    ) -> None:
        self.camera = camera
        self.spec = spec
        self.signature = signature
        self._build = build
        self._frames = frames
        self._governor = governor
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._pipeline: CameraPipeline | None = None
        self._latest: TrackFrame | None = None
        self.frames_out = 0
        self._thread = threading.Thread(
            target=self._run, name=f"rv-cam-{camera.camera_id}", daemon=True
        )

    @property
    def camera_id(self) -> str:
        return self.camera.camera_id

    @property
    def pipeline(self) -> CameraPipeline | None:
        with self._lock:
            return self._pipeline

    @property
    def latest_track_frame(self) -> TrackFrame | None:
        with self._lock:
            return self._latest

    def start(self) -> None:
        self._thread.start()

    def request_stop(self) -> None:
        self._stop.set()

    def join(self, timeout: float) -> None:
        self._thread.join(timeout)
        if self._thread.is_alive():
            # step() is blocked (e.g. a hung RTSP read): stopping the pipeline unblocks it.
            pipeline = self.pipeline
            if pipeline is not None:
                self._safe_stop(pipeline)
            self._thread.join(timeout)
            if self._thread.is_alive():
                log.warning("camera %s thread did not stop in time", self.camera_id)

    def stop(self, timeout: float = 5.0) -> None:
        self.request_stop()
        self.join(timeout)

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def health(self) -> CameraHealth:
        pipeline = self.pipeline
        if pipeline is None:
            return CameraHealth(camera_id=self.camera_id, status=CameraStatus.OFFLINE, fps=0.0)
        try:
            return to_camera_health(pipeline.health())
        except Exception:
            log.debug("health() failed for camera %s", self.camera_id, exc_info=True)
            return CameraHealth(camera_id=self.camera_id, status=CameraStatus.OFFLINE, fps=0.0)

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                pipeline = self._build()
                pipeline.start()
            except Exception as exc:
                log.error("camera %s: cannot start pipeline: %s", self.camera_id, exc)
                log.debug("pipeline start failure", exc_info=True)
                self._stop.wait(backoff)
                backoff = min(60.0, backoff * 2)
                continue
            backoff = 1.0
            with self._lock:
                self._pipeline = pipeline
            try:
                self._step_loop(pipeline)
            finally:
                self._safe_stop(pipeline)

    def _step_loop(self, pipeline: CameraPipeline) -> None:
        errors = 0
        fps = self.camera.target_fps
        while not self._stop.is_set():
            try:
                tf = pipeline.step()
            except Exception:
                errors += 1
                if errors == 1 or errors % 100 == 0:
                    log.exception("camera %s: step() failed (%d)", self.camera_id, errors)
                self._stop.wait(min(5.0, 0.1 * errors))
                continue
            errors = 0
            if tf is None:
                self._stop.wait(0.01)
                continue
            with self._lock:
                self._latest = tf
            self._frames.put(tf)
            self.frames_out += 1
            delay = self._governor.frame_delay(fps)
            if delay > 0:
                self._stop.wait(delay)

    def _safe_stop(self, pipeline: CameraPipeline) -> None:
        try:
            pipeline.stop()
        except Exception:
            log.debug("camera %s: pipeline.stop() failed", self.camera_id, exc_info=True)


class EdgeRuntime:
    """Facade over the whole edge engine (architecture 6.3). See module docstring."""

    def __init__(
        self,
        settings: EdgeSettings,
        *,
        clock: Clock | None = None,
        secrets: SecretsStore | None = None,
        config_store: ConfigStore | None = None,
        outbox: Outbox | None = None,
        governor: ResourceGovernor | None = None,
        pipeline_factory: CameraPipelineFactory | None = None,
        engine_builder: EngineBuilder | None = None,
        source_specs: Mapping[str, SourceSpec] | None = None,
        enable_sync: bool = True,
        cloud_transport: httpx.BaseTransport | None = None,
        sync_options: Mapping[str, Any] | None = None,
        heartbeat_interval_s: float = HEARTBEAT_INTERVAL_S,
        tick_interval_s: float = 1.0,
        governor_interval_s: float = 1.0,
        frame_queue_size: int = 256,
        version: str = EDGE_VERSION,
    ) -> None:
        self.settings = settings
        self.clock: Clock = clock or SystemClock()
        self.secrets = secrets or SecretsStore(settings.data_dir)
        self.config_store = config_store or ConfigStore(settings.data_dir)
        self.outbox = outbox or Outbox.in_dir(settings.data_dir)
        self.governor = governor or ResourceGovernor(settings.cpu_limit_pct)
        self.version = version
        self._pipeline_factory = pipeline_factory
        self._engine_builder = engine_builder
        self._source_specs = dict(source_specs) if source_specs is not None else None
        self._cloud_transport = cloud_transport
        self._heartbeat_interval = heartbeat_interval_s
        self._tick_interval = tick_interval_s
        self._governor_interval = governor_interval_s

        self.sync: CloudSync | None = None
        if enable_sync:
            self.sync = CloudSync(
                self.outbox,
                self.secrets,
                self.config_store,
                cloud_url=settings.cloud_url,
                on_ack=self._on_cloud_ack,
                on_config=self._on_cloud_config,
                transport=cloud_transport,
                **dict(sync_options or {}),
            )
        self.broadcaster = LocalBroadcastSink()
        self.bus = EventBus(
            [
                OutboxSink(
                    self.outbox,
                    enabled=lambda: self.cloud_enabled,
                    on_append=self.sync.notify if self.sync is not None else None,
                ),
                self.broadcaster,
                LogSink(),
            ]
        )

        self._frames: DropOldestQueue[TrackFrame] = DropOldestQueue(frame_queue_size)
        self._control: queue.SimpleQueue[_Control] = queue.SimpleQueue()
        self._stop = threading.Event()
        self._started = False
        self._stopped = False
        self._analytics_thread: threading.Thread | None = None
        self._engine: AnalyticsEngine | None = None
        self._live_lock = threading.Lock()
        self._live: LiveState = empty_live_state()
        self._cameras_lock = threading.Lock()
        self._workers: dict[str, CameraWorker] = {}

    # identity ----------------------------------------------------------------------------
    @property
    def cloud_enabled(self) -> bool:
        """Events are persisted for the cloud only while sync is enabled and paired."""
        return self.sync is not None and self.secrets.paired

    @property
    def config(self) -> SiteConfig | None:
        return self.config_store.current

    @property
    def site_id(self) -> str:
        if self.secrets.paired and self.secrets.site_id:
            return self.secrets.site_id
        config = self.config
        return config.site_id if config is not None else UNCONFIGURED_SITE_ID

    @property
    def device_id(self) -> str:
        return self.secrets.device_id or LOCAL_DEVICE_ID

    @property
    def running(self) -> bool:
        return self._started and not self._stopped

    @property
    def dropped_frames(self) -> int:
        return self._frames.dropped

    # lifecycle ---------------------------------------------------------------------------
    def start(self) -> None:
        """Start analytics, cameras and cloud sync. Returns immediately."""
        if self._started:
            return
        self._started = True
        self.governor.lower_priority()
        ResourceGovernor.configure_threads()
        self._analytics_thread = threading.Thread(
            target=self._analytics_loop, name="rv-analytics", daemon=True
        )
        self._analytics_thread.start()
        config = self.config
        if config is not None:
            self._control.put(_ConfigRequest(config))
        self.reconcile_cameras()
        if self.sync is not None:
            self.sync.start()
        log.info(
            "edge runtime started (site %s, device %s, %d cameras)",
            self.site_id,
            self.device_id,
            len(self._workers),
        )

    def stop(self, timeout: float = 5.0) -> None:
        """Stop every thread, then close the outbox. Idempotent."""
        if self._stopped:
            return
        self._stopped = True
        self._stop.set()
        with self._cameras_lock:
            workers = list(self._workers.values())
            self._workers = {}
        for worker in workers:
            worker.request_stop()
        self._frames.wake()
        for worker in workers:
            worker.join(timeout)
        if self._analytics_thread is not None:
            self._analytics_thread.join(timeout)
        if self.sync is not None:
            self.sync.stop(timeout)
        self.outbox.close()
        log.info("edge runtime stopped")

    # cameras -----------------------------------------------------------------------------
    def _specs(self) -> dict[str, SourceSpec]:
        if self._source_specs is not None:
            return dict(self._source_specs)
        return self.secrets.camera_specs()

    def _factory(self) -> CameraPipelineFactory:
        if self._pipeline_factory is None:
            self._pipeline_factory = default_pipeline_factory()
        return self._pipeline_factory

    def _build_pipeline(
        self, camera: CameraConfig, spec: SourceSpec, masks: list[Any]
    ) -> CameraPipeline:
        return self._factory()(
            camera,
            spec,
            clock=self.clock,
            privacy_masks=masks,
            detector_backend=self.settings.detector_backend,
            model_path=self.settings.model_path,
            uniform_hsv=self.secrets.uniform_hsv,
        )

    def reconcile_cameras(self) -> None:
        """Start, restart or stop camera threads to match the config, the camera specs and the
        uniform calibration. Call after any of them changes."""
        if not self.running:
            return
        config = self.config
        specs = self._specs()
        uniform = self.secrets.uniform_hsv
        desired: dict[str, tuple[CameraConfig, SourceSpec, list[Any], tuple[Any, ...]]] = {}
        if config is not None:
            for camera in config.cameras:
                spec = specs.get(camera.camera_id)
                if not camera.enabled or spec is None:
                    continue
                masks = config.privacy_masks_for(camera.camera_id)
                desired[camera.camera_id] = (camera, spec, masks, (camera, spec, masks, uniform))
        with self._cameras_lock:
            if self._stopped:
                return
            workers = dict(self._workers)
            for camera_id, worker in list(workers.items()):
                plan = desired.get(camera_id)
                if plan is None or plan[3] != worker.signature:
                    worker.stop()
                    del workers[camera_id]
            for camera_id, (camera, spec, masks, signature) in desired.items():
                if camera_id in workers:
                    continue
                worker = CameraWorker(
                    camera,
                    spec,
                    signature,
                    functools.partial(self._build_pipeline, camera, spec, masks),
                    self._frames,
                    self.governor,
                )
                worker.start()
                workers[camera_id] = worker
            self._workers = workers

    def camera_health(self) -> list[CameraHealth]:
        """Health of every enabled camera in the config (offline when it has no pipeline)."""
        workers = self._workers
        config = self.config
        result: list[CameraHealth] = []
        seen: set[str] = set()
        for camera in config.cameras if config is not None else []:
            if not camera.enabled:
                continue
            seen.add(camera.camera_id)
            worker = workers.get(camera.camera_id)
            if worker is not None:
                result.append(worker.health())
            else:
                result.append(
                    CameraHealth(camera_id=camera.camera_id, status=CameraStatus.OFFLINE, fps=0.0)
                )
        result.extend(w.health() for cid, w in workers.items() if cid not in seen)
        return result

    def capture(self, camera_id: str, *, timeout_s: float = 8.0) -> Capture:
        """Grab the current frame of ``camera_id`` plus its person boxes (RAM only).

        Uses the running pipeline when there is one; otherwise builds a temporary pipeline
        from the stored camera spec (setup wizard: camera added but not yet in the config).
        Raises ``KeyError`` for an unknown camera.
        """
        worker = self._workers.get(camera_id)
        if worker is not None and worker.pipeline is not None:
            return self._capture_from(worker.pipeline, worker.latest_track_frame, worker.spec)
        spec = self._specs().get(camera_id)
        if spec is None:
            raise KeyError(camera_id)
        config = self.config
        camera = next(
            (c for c in (config.cameras if config else []) if c.camera_id == camera_id), None
        )
        if camera is None:
            camera = CameraConfig(
                camera_id=camera_id, name=camera_id, source=CameraSource(spec.kind)
            )
        masks = config.privacy_masks_for(camera_id) if config is not None else []
        pipeline = self._build_pipeline(camera, spec, masks)
        pipeline.start()
        try:
            deadline = time.monotonic() + timeout_s
            tf: TrackFrame | None = None
            while time.monotonic() < deadline:
                tf = pipeline.step()
                if tf is not None:
                    break
                time.sleep(0.02)
            return self._capture_from(pipeline, tf, spec)
        finally:
            pipeline.stop()

    @staticmethod
    def _capture_from(pipeline: CameraPipeline, tf: TrackFrame | None, spec: SourceSpec) -> Capture:
        if isinstance(pipeline, SnapshotCapable):
            got = pipeline.snapshot()
            if got is not None:
                frame, boxes = got
                return Capture(frame, list(boxes), spec.kind)
        boxes = [t.box for t in tf.tracks] if tf is not None else []
        return Capture(None, boxes, spec.kind)

    def snapshot_jpeg(self, camera_id: str) -> bytes:
        """JPEG of the current frame with every person blurred and privacy masks blacked out.
        Encoded in memory; never stored."""
        cap = self.capture(camera_id)
        config = self.config
        masks = config.privacy_masks_for(camera_id) if config is not None else []
        label = "simulated camera" if cap.kind == "simulated" else "preview unavailable"
        image = compose_snapshot(cap.frame, cap.boxes, masks, placeholder_label=label)
        return encode_jpeg(image)

    def calibrate_uniform(self, camera_id: str, box: Box) -> tuple[float, float, float]:
        """Measure the staff-uniform colour inside ``box`` of the current frame, store it and
        restart the camera pipelines with it."""
        cap = self.capture(camera_id)
        image = cap.frame.image if cap.frame is not None else None
        if image is None or not hasattr(image, "shape"):
            raise CalibrationError("uniform calibration needs a real camera image")
        try:
            hints = importlib.import_module("rv_edge.vision.hints")
            measure = hints.measure_uniform_hsv
        except (ImportError, AttributeError) as exc:
            raise CalibrationError("uniform calibration is not available in this build") from exc
        h, s, v = (float(x) for x in measure(image, box))
        hsv = (h, s, v)
        self.secrets.set_uniform_hsv(hsv)
        self.reconcile_cameras()
        return hsv

    # config ------------------------------------------------------------------------------
    def _check_site(self, config: SiteConfig) -> None:
        site_id = self.secrets.site_id
        if self.secrets.paired and site_id and config.site_id != site_id:
            raise ConfigRejected(
                f"config is for site {config.site_id!r} but this edge is paired with {site_id!r}"
            )

    def apply_local_config(self, config: SiteConfig) -> SiteConfig:
        """Save an edge-ui edit, apply it to analytics and cameras, and queue a cloud push."""
        self._check_site(config)
        self.config_store.save_local(config)
        self._apply(config)
        if self.sync is not None:
            self.sync.notify()
        return config

    def _on_cloud_config(self, config: SiteConfig, etag: str | None) -> None:
        try:
            self._check_site(config)
        except ConfigRejected as exc:
            log.error("ignoring cloud config: %s", exc)
            return
        if self.config_store.save_from_cloud(config, etag):
            log.info("applying site config version %d from the cloud", config.config_version)
            self._apply(config)

    def _apply(self, config: SiteConfig) -> None:
        if self.running:
            self._control.put(_ConfigRequest(config))
            self._frames.wake()
            self.reconcile_cameras()

    # pairing -----------------------------------------------------------------------------
    def pair(self, code: str, cloud_url: str) -> PairResponse:
        """Pair with the cloud and wake the sync (which then fetches the site config)."""
        response = pair_device(cloud_url, code, self.secrets, transport=self._cloud_transport)
        if self.sync is not None:
            self.sync.request_config_check()
        return response

    # alerts ------------------------------------------------------------------------------
    def ack_alert(
        self,
        alert_id: str,
        *,
        via: AckVia,
        ack_at: float | None = None,
        wait: bool = True,
        timeout_s: float = 5.0,
    ) -> AlertView | None:
        """Queue an acknowledgement for the analytics thread.

        With ``wait``, block until it was applied and return the alert's current view (None if
        the alert is not open). Raises ``RuntimeError`` when the runtime is not running and
        ``TimeoutError`` if the analytics thread does not answer in time.
        """
        if not self.running:
            raise RuntimeError("edge runtime is not running")
        done: Future[list[EdgeEvent]] | None = Future() if wait else None
        when = self.clock.now() if ack_at is None else ack_at
        self._control.put(_AckRequest(alert_id, when, via, done))
        self._frames.wake()
        if done is None:
            return None
        done.result(timeout=timeout_s)
        return self.find_alert(alert_id)

    def find_alert(self, alert_id: str) -> AlertView | None:
        return next((a for a in self.live_state().open_alerts if a.alert_id == alert_id), None)

    def _on_cloud_ack(self, alert_id: str, ack_at: float) -> None:
        if self.running:
            self.ack_alert(alert_id, via=AckVia.CLOUD, ack_at=ack_at, wait=False)

    # live state --------------------------------------------------------------------------
    def live_state(self) -> LiveState:
        with self._live_lock:
            return self._live

    def device_status(self) -> DeviceStatus:
        sample = self.governor.last_sample
        return DeviceStatus(
            device_id=self.device_id,
            version=self.version,
            last_seen_at=_finite(self.clock.now()),
            online=True,
            cameras=self.camera_health(),
            cpu_pct=round(_finite(sample.cpu_pct), 1),
            mem_mb=round(_finite(sample.mem_mb), 1),
            outbox_depth=self.outbox_depth(),
        )

    def live_snapshot(self) -> LiveSnapshot:
        """``LiveSnapshot`` for ``GET /local/state``: analytics state plus this device."""
        live = self.live_state()
        return LiveSnapshot(
            site_id=self.site_id,
            ts=_finite(self.clock.now()),
            tables=live.tables,
            occupancy=live.occupancy,
            queues=live.queues,
            open_alerts=live.open_alerts,
            devices=[self.device_status()],
        )

    def outbox_depth(self) -> int:
        try:
            return self.outbox.depth()
        except Exception:  # closed during shutdown
            return 0

    def make_heartbeat(self) -> EdgeHeartbeat:
        sample = self.governor.last_sample
        return make_event(
            EdgeHeartbeat,
            self.site_id,
            _finite(self.clock.now()),
            device_id=self.device_id,
            version=self.version[:64] or "unknown",
            cameras=self.camera_health(),
            cpu_pct=round(_finite(sample.cpu_pct), 1),
            mem_mb=round(_finite(sample.mem_mb), 1),
            outbox_depth=self.outbox_depth(),
        )

    # analytics thread --------------------------------------------------------------------
    def _analytics_loop(self) -> None:
        self.governor.update()
        last_tick = self.clock.now()
        next_heartbeat = time.monotonic()
        next_governor = time.monotonic() + self._governor_interval
        while not self._stop.is_set():
            self._drain_control()
            tf = self._frames.get(timeout=0.05)
            if tf is not None and self._engine is not None:
                events = self._engine_call(self._engine.on_track_frame, tf)
                if events:
                    self.bus.publish_all(events)
                    self._refresh_live()
            now = self.clock.now()
            if now < last_tick:
                last_tick = now
            if now - last_tick >= self._tick_interval:
                last_tick = now
                if self._engine is not None:
                    self.bus.publish_all(self._engine_call(self._engine.on_tick, now))
                    self._refresh_live()
            mono = time.monotonic()
            if mono >= next_governor:
                next_governor = mono + self._governor_interval
                self.governor.update()
            if mono >= next_heartbeat:
                next_heartbeat = mono + self._heartbeat_interval
                try:
                    self.bus.publish(self.make_heartbeat())
                except Exception:
                    log.exception("heartbeat failed")
        self._fail_pending_control()

    def _engine_call(self, fn: Callable[[T], list[EdgeEvent]], arg: T) -> list[EdgeEvent]:
        try:
            return list(fn(arg))
        except Exception:
            log.exception("analytics engine %s failed", getattr(fn, "__name__", "call"))
            return []

    def _drain_control(self) -> None:
        while True:
            try:
                request = self._control.get_nowait()
            except queue.Empty:
                return
            if isinstance(request, _ConfigRequest):
                self._configure(request.config)
                if request.done is not None:
                    request.done.set_result(None)
            else:
                self._apply_ack(request)

    def _configure(self, config: SiteConfig) -> None:
        try:
            if self._engine is None:
                builder = self._engine_builder or default_engine_builder()
                self._engine_builder = builder
                self._engine = builder(config, clock=self.clock)
            else:
                self._engine.configure(config)
        except Exception:
            log.exception("could not apply site config to analytics")
        self._refresh_live()

    def _apply_ack(self, request: _AckRequest) -> None:
        events: list[EdgeEvent] = []
        if self._engine is not None:
            try:
                events = list(self._engine.apply_ack(request.alert_id, request.ack_at, request.via))
            except Exception as exc:
                log.exception("applying ack for alert %s failed", request.alert_id)
                if request.done is not None:
                    request.done.set_exception(exc)
                return
        self.bus.publish_all(events)
        self._refresh_live()
        if request.done is not None:
            request.done.set_result(events)

    def _refresh_live(self) -> None:
        if self._engine is None:
            return
        try:
            live = self._engine.live()
        except Exception:
            log.exception("analytics engine live() failed")
            return
        with self._live_lock:
            self._live = live

    def _fail_pending_control(self) -> None:
        while True:
            try:
                request = self._control.get_nowait()
            except queue.Empty:
                return
            if request.done is not None and not request.done.done():
                request.done.set_exception(RuntimeError("edge runtime stopped"))
