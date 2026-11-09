from __future__ import annotations

import asyncio
import json
import random
import threading
from collections.abc import Callable
from typing import Any

import httpx
from rv_contracts import (
    AckVia,
    AlertStatus,
    CameraStatus,
    EdgeHeartbeat,
    EventType,
    LiveSnapshot,
    SiteConfig,
)
from rv_contracts.fixtures import CAM_DINING, CAM_ENTRANCE

from rv_edge.runtime.runtime import (
    LOCAL_DEVICE_ID,
    DropOldestQueue,
    EdgeRuntime,
)

from .conftest import DEVICE_ID, SITE_ID
from .fakes import ALERT_ID, EngineHolder, FakeCloud, FakeFactory, ManualClock, RecordingSink
from .fakes import wait_until as _wait_until

Build = Callable[..., tuple[EdgeRuntime, FakeFactory, EngineHolder]]


def wait_until(cond: Callable[[], bool], timeout: float = 3.0) -> None:
    assert _wait_until(cond, timeout), "condition not met in time"


def _down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("cloud unreachable", request=request)


OFFLINE_CLOUD: dict[str, Any] = {
    "enable_sync": True,
    "cloud_transport": httpx.MockTransport(_down),
}
"""Paired, with a cloud that is down: events stay in the outbox."""


def started(make_runtime: Build, **kwargs: Any) -> tuple[EdgeRuntime, FakeFactory, EngineHolder]:
    runtime, factory, holder = make_runtime(**kwargs)
    runtime.start()
    wait_until(lambda: bool(holder.engines))
    return runtime, factory, holder


def test_frames_flow_from_cameras_to_the_analytics_thread(make_runtime: Build) -> None:
    runtime, factory, holder = started(make_runtime)
    engine = holder.engine
    wait_until(lambda: {tf.camera_id for tf in list(engine.frames)} == {CAM_DINING, CAM_ENTRANCE})
    assert engine.threads == {"rv-analytics"}
    by_camera = {p.camera_id: p for p in factory.built}
    assert by_camera[CAM_DINING].privacy_masks  # restroom privacy zone passed to the pipeline
    assert by_camera[CAM_DINING].started
    assert factory.kwargs[0]["detector_backend"] == "auto"


def test_events_reach_outbox_bus_and_local_broadcast(make_runtime: Build) -> None:
    runtime, _, _ = make_runtime(**OFFLINE_CLOUD)
    sink = RecordingSink()
    runtime.bus.subscribe(sink)

    async def first_alert() -> dict[str, Any]:
        sub = runtime.broadcaster.subscribe()
        runtime.start()
        while True:
            message: dict[str, Any] = json.loads(await asyncio.wait_for(sub.queue.get(), 3))
            if message["type"] == "alert.raised":
                return message

    message = asyncio.run(first_alert())
    assert message["alert_id"] == ALERT_ID
    wait_until(lambda: bool(sink.of_type("alert.raised")))
    rows = [item.event for item in runtime.outbox.fetch_batch()]
    assert any(e.type is EventType.ALERT_RAISED for e in rows)


def test_unpaired_edge_does_not_persist_events(make_runtime: Build) -> None:
    runtime, _, _ = make_runtime(paired=False, heartbeat_interval_s=0.05)
    sink = RecordingSink()
    runtime.bus.subscribe(sink)
    runtime.start()
    wait_until(lambda: bool(sink.of_type("alert.raised")) and bool(sink.of_type("edge.heartbeat")))
    assert runtime.outbox.depth() == 0
    heartbeat = sink.of_type("edge.heartbeat")[0]
    assert isinstance(heartbeat, EdgeHeartbeat)
    assert heartbeat.device_id == LOCAL_DEVICE_ID


def test_local_ack_is_applied_on_the_analytics_thread(make_runtime: Build) -> None:
    runtime, _, holder = started(make_runtime, **OFFLINE_CLOUD)
    engine = holder.engine
    wait_until(lambda: runtime.find_alert(ALERT_ID) is not None)
    view = runtime.ack_alert(ALERT_ID, via=AckVia.LOCAL)
    assert view is not None
    assert view.status is AlertStatus.ACKNOWLEDGED and view.ack_via is AckVia.LOCAL
    assert engine.acks[0][0] == ALERT_ID and engine.acks[0][2] is AckVia.LOCAL
    assert engine.threads == {"rv-analytics"}
    assert runtime.ack_alert("no-such-alert", via=AckVia.LOCAL) is None
    acked = [i.event for i in runtime.outbox.fetch_batch() if i.event.type.value.endswith("ged")]
    assert acked and acked[0].via is AckVia.LOCAL  # type: ignore[union-attr]


def test_cloud_ack_command_reaches_the_analytics_thread(make_runtime: Build) -> None:
    cloud = FakeCloud()
    cloud.pages = [{"cursor": "c0", "commands": []}]
    runtime, _, holder = make_runtime(
        enable_sync=True,
        cloud_transport=httpx.MockTransport(cloud.handler),
        sync_options={"poll_interval_s": 0.02},
    )
    runtime.start()
    wait_until(lambda: bool(holder.engines) and runtime.find_alert(ALERT_ID) is not None)
    cloud.pages.append(
        {
            "cursor": "c1",
            "commands": [
                {
                    "kind": "alert_ack",
                    "command_id": "cmd-1",
                    "site_id": SITE_ID,
                    "created_at": 1_793_988_100.0,
                    "alert_id": ALERT_ID,
                    "ack_at": 1_793_988_100.5,
                }
            ],
        }
    )
    engine = holder.engine
    wait_until(lambda: any(via is AckVia.CLOUD for _, _, via in list(engine.acks)))
    assert engine.acks[0] == (ALERT_ID, 1_793_988_100.5, AckVia.CLOUD)
    assert engine.threads == {"rv-analytics"}
    # The resulting alert.acknowledged (via=cloud) is delivered back to the cloud.
    wait_until(
        lambda: any(
            e.get("type") == "alert.acknowledged" and e.get("via") == "cloud"
            for e in list(cloud.stored.values())
        )
    )
    assert runtime.sync is not None and runtime.sync.online


def test_heartbeat_contents(make_runtime: Build) -> None:
    runtime, _, _ = make_runtime(heartbeat_interval_s=0.05, **OFFLINE_CLOUD)
    sink = RecordingSink()
    runtime.bus.subscribe(sink)
    runtime.start()
    wait_until(lambda: len(sink.of_type("edge.heartbeat")) >= 2)
    wait_until(
        lambda: any(
            isinstance(h, EdgeHeartbeat) and all(c.status is CameraStatus.OK for c in h.cameras)
            for h in sink.of_type("edge.heartbeat")
        )
    )
    hb = sink.of_type("edge.heartbeat")[-1]
    assert isinstance(hb, EdgeHeartbeat)
    assert hb.site_id == SITE_ID and hb.device_id == DEVICE_ID
    assert hb.version == runtime.version
    assert {c.camera_id for c in hb.cameras} == {CAM_DINING, CAM_ENTRANCE}
    assert hb.mem_mb > 0 and hb.cpu_pct >= 0
    assert hb.outbox_depth >= 1  # earlier events wait for the (down) cloud


def test_ticks_follow_the_clock(make_runtime: Build) -> None:
    clock = ManualClock()
    runtime, _, holder = started(make_runtime, clock=clock)
    engine = holder.engine
    assert engine.ticks == []
    clock.advance(1.5)
    wait_until(lambda: len(engine.ticks) == 1)
    assert engine.ticks[0] == clock.now()


def test_live_snapshot_shape(make_runtime: Build) -> None:
    runtime, _, _ = started(make_runtime)
    wait_until(lambda: runtime.find_alert(ALERT_ID) is not None)
    snapshot = runtime.live_snapshot()
    again = LiveSnapshot.model_validate_json(snapshot.model_dump_json())
    assert again.site_id == SITE_ID
    assert len(again.tables) == 8
    assert again.devices[0].device_id == DEVICE_ID and again.devices[0].online
    assert [a.alert_id for a in again.open_alerts] == [ALERT_ID]


def test_runtime_without_config_still_serves_state(make_runtime: Build) -> None:
    runtime, factory, holder = make_runtime(with_config=False, paired=False)
    runtime.start()
    snapshot = runtime.live_snapshot()
    assert snapshot.site_id == "unconfigured"
    assert snapshot.tables == [] and factory.built == [] and holder.engines == []


def test_local_config_change_reconfigures_engine_and_cameras(
    make_runtime: Build, config: SiteConfig
) -> None:
    runtime, factory, holder = started(make_runtime)
    wait_until(lambda: len(factory.built) == 2)
    data = config.model_dump()
    for camera in data["cameras"]:
        if camera["camera_id"] == CAM_ENTRANCE:
            camera["enabled"] = False
    edited = SiteConfig.model_validate(data)
    runtime.apply_local_config(edited)
    engine = holder.engine
    wait_until(lambda: engine.configs[-1] == edited)
    entrance = next(p for p in factory.built if p.camera_id == CAM_ENTRANCE)
    wait_until(lambda: entrance.stopped)
    assert runtime.config_store.has_pending_push
    assert [h.camera_id for h in runtime.camera_health()] == [CAM_DINING]


def test_cloud_merged_config_after_an_offline_edit_reaches_the_engine(
    make_runtime: Build, config: SiteConfig
) -> None:
    """Config drift: while the cloud is unreachable, a manager changes a threshold in the
    dashboard and the installer edits a table label on the edge. After reconnecting, the edge
    pushes its edit and stores the cloud's merged answer; the analytics engine must then run
    with the cloud's thresholds and the local label (not the stale thresholds)."""
    clock = ManualClock()
    cloud = FakeCloud()
    cloud.config = config
    link = {"up": True}

    def handler(request: httpx.Request) -> httpx.Response:
        if not link["up"]:
            raise httpx.ConnectError("cloud unreachable", request=request)
        return cloud.handler(request)

    runtime, _, holder = make_runtime(
        clock=clock,
        enable_sync=True,
        cloud_transport=httpx.MockTransport(handler),
        sync_options={"monotonic": clock.now, "rng": random.Random(0), "backoff_max_s": 4.0},
    )
    runtime.start(threaded=False)
    sync = runtime.sync
    assert sync is not None
    runtime.step()
    sync.run_once()
    engine = holder.engine
    assert engine.config.thresholds.first_visit_timeout_s == 180.0

    link["up"] = False
    stored = cloud.config.model_dump()
    stored["thresholds"]["first_visit_timeout_s"] = 60.0  # dashboard PATCH while offline
    stored["config_version"] += 1
    cloud.config = SiteConfig.model_validate(stored)
    local = config.model_dump()
    local["tables"][0]["label"] = "Window 1"  # PUT /local/config while offline
    runtime.apply_local_config(SiteConfig.model_validate(local))
    runtime.step()
    sync.run_once()
    assert not sync.online and runtime.config_store.has_pending_push
    assert engine.config.tables[0].label == "Window 1"

    link["up"] = True
    for _ in range(10):
        clock.advance(5.0)
        sync.run_once()
        runtime.step()
    assert sync.online and not runtime.config_store.has_pending_push
    current = runtime.config
    assert current is not None and current.config_version == cloud.config.config_version
    assert engine.config == current  # what analytics uses is what is stored
    assert engine.config.thresholds.first_visit_timeout_s == 60.0
    assert engine.config.tables[0].label == "Window 1"


def test_config_for_another_site_is_rejected(make_runtime: Build, config: SiteConfig) -> None:
    runtime, _, _ = started(make_runtime)
    other = SiteConfig.model_validate({**config.model_dump(), "site_id": "other-site"})
    try:
        runtime.apply_local_config(other)
    except ValueError as exc:
        assert "paired" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected ConfigRejected")


def test_clean_stop(make_runtime: Build) -> None:
    runtime, factory, holder = started(make_runtime)
    wait_until(lambda: len(factory.built) == 2 and bool(holder.engine.frames))
    runtime.stop()
    assert not runtime.running
    assert all(p.stopped for p in factory.built)
    alive = [t.name for t in threading.enumerate() if t.name.startswith("rv-") and t.is_alive()]
    assert alive == []
    runtime.stop()  # idempotent
    try:
        runtime.ack_alert(ALERT_ID, via=AckVia.LOCAL)
    except RuntimeError:
        pass
    else:  # pragma: no cover
        raise AssertionError("ack after stop must fail")


def test_drop_oldest_queue() -> None:
    q: DropOldestQueue[int] = DropOldestQueue(3)
    for i in range(5):
        q.put(i)
    assert q.dropped == 2
    assert [q.get(0), q.get(0), q.get(0), q.get(0)] == [2, 3, 4, None]


def test_manual_mode_is_deterministic_and_threadless(make_runtime: Build) -> None:
    clock = ManualClock()
    runtime, factory, holder = make_runtime(clock=clock, heartbeat_interval_s=30.0)
    sink = RecordingSink()
    runtime.bus.subscribe(sink)
    runtime.start(threaded=False)
    names = {t.name for t in threading.enumerate()}
    assert not any(n == "rv-analytics" or n.startswith("rv-cam-") for n in names)
    assert runtime.step() == 2  # one frame per camera, on this thread
    engine = holder.engine
    assert {tf.camera_id for tf in engine.frames} == {CAM_DINING, CAM_ENTRANCE}
    assert engine.threads == {threading.current_thread().name}
    assert len(sink.of_type("edge.heartbeat")) == 1  # first heartbeat at start
    clock.advance(1.0)
    runtime.step()
    assert engine.ticks == [clock.now()]
    clock.advance(28.5)
    runtime.step()
    assert len(sink.of_type("edge.heartbeat")) == 1  # heartbeats follow the runtime clock
    clock.advance(1.0)
    runtime.step()
    assert len(sink.of_type("edge.heartbeat")) == 2
    # acks queued from other threads are applied by the next step
    runtime.ack_alert(ALERT_ID, via=AckVia.LOCAL, wait=False)
    runtime.step()
    assert engine.acks and engine.acks[0][0] == ALERT_ID
    runtime.stop()
    assert all(p.stopped for p in factory.built)


def test_manual_step_needs_manual_mode(make_runtime: Build) -> None:
    runtime, _, _ = started(make_runtime)
    try:
        runtime.step()
    except RuntimeError as exc:
        assert "threaded=False" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("expected RuntimeError")


def test_track_id_ttl_follows_the_thresholds(make_runtime: Build, config: SiteConfig) -> None:
    runtime, factory, _ = started(make_runtime)
    wait_until(lambda: len(factory.built) == 2)
    assert {p.spec.options["track_id_ttl_h"] for p in factory.built} == {24.0}
    data = config.model_dump()
    data["thresholds"]["track_id_ttl_h"] = 6
    runtime.apply_local_config(SiteConfig.model_validate(data))
    wait_until(lambda: len(factory.built) == 4)  # both pipelines rebuilt
    assert [p.spec.options["track_id_ttl_h"] for p in factory.built[2:]] == [6.0, 6.0]
    assert all(p.stopped for p in factory.built[:2])


def test_heartbeat_and_device_status_carry_the_local_url(
    make_runtime: Build, settings: Any
) -> None:
    settings.local_url = "http://10.1.2.3:8787/"
    runtime, _, _ = make_runtime(heartbeat_interval_s=0.05)
    assert runtime.make_heartbeat().local_url == "http://10.1.2.3:8787"
    assert runtime.device_status().local_url == "http://10.1.2.3:8787"
