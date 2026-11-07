"""Engine facade: configure() hot reload, module gating, live(), robustness, performance."""

from __future__ import annotations

import json
import random
import time

from analytics_dsl import (
    T0,
    FixedClock,
    Scenario,
    crisp_config,
    person,
    replace,
    walker,
    with_modules,
    with_thresholds,
    with_zones,
)
from rv_contracts import (
    AckVia,
    AlertKind,
    AlertStatus,
    AnalyticsModule,
    AppearanceHints,
    CameraConfig,
    Line,
    LineDirection,
    SiteConfig,
    Table,
    TableState,
    Track,
    TrackFrame,
    Zone,
    ZoneKind,
)
from rv_contracts.fixtures import rect, sample_site_config

from rv_edge.analytics import DefaultAnalyticsEngine, build_analytics_engine
from rv_edge.interfaces import AnalyticsEngine

E = "cam-entrance"


def without_table(config: SiteConfig, table_id: str) -> SiteConfig:
    data = config.model_dump()
    data["tables"] = [t for t in data["tables"] if t["table_id"] != table_id]
    data["zones"] = [z for z in data["zones"] if z.get("table_id") != table_id]
    return SiteConfig.model_validate(data)


def test_entry_point_and_module_protocols() -> None:
    engine: AnalyticsEngine = build_analytics_engine(sample_site_config(), clock=FixedClock())
    assert isinstance(engine, DefaultAnalyticsEngine)
    assert [m.name for m in engine.modules] == ["scene", "tables", "queue", "occupancy"]
    assert all(isinstance(m, AnalyticsModule) for m in engine.modules)
    snapshot = engine.debug_snapshot()
    assert set(snapshot) == {"scene", "tables", "queue", "occupancy", "alerts"}
    json.dumps(snapshot)  # JSON-safe
    assert engine.config.site_id == "site-demo" and engine.scene.zones is not None


def test_configure_keeps_surviving_tables_and_drops_removed_ones() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(at="t3", from_t=10), person(at="t8", from_t=10))
    sc.run(215)
    t3 = sc.eng.tables.machine("t3")
    assert t3 is not None and t3.session is not None
    session_id = t3.session.session_id
    t8_alert = sc.alert_id("waiter_needed", "t8")
    sc.configure(with_thresholds(without_table(crisp_config(), "t8"), seat_confirm_s=5.0))
    sc.add(person(at="t1", from_t=220))
    # the dropped table's alert is resolved first, stamped with the last time seen (215)
    assert sc.summary(sc.run(230)) == [
        (215.0, "resolved", "waiter_needed", "state_change"),
        (225.0, "state", "t1", "empty", "seated", 1),  # the new 5 s seat confirmation
    ]
    assert sc.eng.alerts.get(t8_alert) is None
    assert t3.state is TableState.SEATED and t3.session is not None
    assert t3.session.session_id == session_id and t3.state_since == T0 + 30.0
    assert [t.table_id for t in sc.eng.live().tables] == ["t1", "t2", "t3", "t4", "t5", "t6",
                                                          "t7"]


def test_configure_moving_the_primary_zone_to_another_camera() -> None:
    cfg = crisp_config()
    sc = Scenario(cfg).add(person(at="z-t5", from_t=0), person(at="z-t5-entrance", from_t=0))
    sc.run(100)
    data = cfg.model_dump()
    for zone in data["zones"]:
        if zone["zone_id"] in ("z-t5", "z-t5-entrance"):
            zone["primary"] = zone["zone_id"] == "z-t5-entrance"
    sc.configure(SiteConfig.model_validate(data))
    sc.run(400)
    assert sc.summary() == [(20.0, "state", "t5", "empty", "seated", 1),
                            (200.0, "raised", "waiter_needed", "t5")]
    assert sc.eng.tables.guest_counts()["t5"] == 1  # now counted on the entrance camera


def test_configure_switching_modules_off_resolves_their_alerts() -> None:
    cfg = with_thresholds(crisp_config(), long_queue_people=1)
    sc = Scenario(cfg).add(person(at="t3", from_t=10), person((0.3, 0.7), camera=E, from_t=10))
    sc.run(215)
    assert {k for k, _ in sc.alert_kinds.values()} == {"waiter_needed", "long_queue"}
    sc.configure(with_modules(cfg, alerts=False))
    out = sc.run(400)
    assert sorted(s[1:] for s in sc.summary(out)) == [
        ("resolved", "long_queue", "state_change"),
        ("resolved", "waiter_needed", "state_change"),
    ]
    assert sc.eng.live().open_alerts == []
    sc.configure(with_modules(cfg, tables=False, queue=False))
    sc.run(500)
    live = sc.eng.live()
    assert live.tables == [] and live.queues == [] and live.open_alerts == []
    occ = live.occupancy
    assert occ is not None and (occ.guests, occ.tables_occupied) == (1, 1)
    assert [s for s in sc.summary(sc.run(600)) if s[1] != "resolved"] == []


def test_configure_tables_and_queue_off_resolve_open_alerts() -> None:
    cfg = with_thresholds(crisp_config(), long_queue_people=1)
    sc = Scenario(cfg).add(person(at="t3", from_t=10), person((0.3, 0.7), camera=E, from_t=10))
    sc.run(215)
    sc.configure(with_modules(cfg, tables=False))
    assert sc.summary(sc.run(216)) == [(215.0, "resolved", "waiter_needed", "state_change")]
    sc.configure(with_zones(cfg, remove=["z-queue"]))  # tables back on, queue zone gone
    assert sc.summary(sc.run(217)) == [
        (216.0, "resolved", "long_queue", "state_change"),
        # machines restart from empty; the guest has been present for long: seated at once
        (216.25, "state", "t3", "empty", "seated", 1),
    ]


def test_modules_off_from_the_start() -> None:
    people = [person(at="t3", from_t=10, to_t=100),
              walker([(10, (0.3, 0.7)), (100, (0.3, 0.7)), (102, (0.8, 0.7))], camera=E,
                     to_t=104)]
    sc = Scenario(with_modules(crisp_config(), alerts=False, queue=False)).add(*people)
    sc.run(800)
    assert sc.summary() == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (148.0, "state", "t3", "seated", "needs_bussing", 0),
        (148.0, "closed", "t3", 30.0, 148.0, 1, None, 0),
    ]
    assert sc.eng.live().queues == []
    off = Scenario(with_modules(crisp_config(), alerts=False, queue=False, tables=False,
                                occupancy=False)).add(*people)
    assert off.run(300) == []
    assert off.eng.live().occupancy is None and off.eng.live().tables == []


def test_live_state_contents() -> None:
    cfg = with_thresholds(crisp_config(), long_queue_people=1)
    sc = Scenario(cfg).add(person(at="t3", from_t=10), person(at="t3", from_t=10,
                                                              offset=(0.02, 0.0)))
    sc.add(person((0.3, 0.7), camera=E, from_t=40))
    sc.run(215)
    waiter = sc.alert_id("waiter_needed", "t3")
    sc.ack(waiter, at=214.0, via=AckVia.CLOUD)
    live = sc.eng.live()
    t3 = next(t for t in live.tables if t.table_id == "t3")
    assert (t3.label, t3.seats, t3.state, t3.guest_count, t3.since_ts, t3.open_alert_ids) == (
        "3", 4, TableState.SEATED, 2, T0 + 30.0, [waiter])
    t1 = live.tables[0]
    assert (t1.table_id, t1.label, t1.seats, t1.state, t1.since_ts) == (
        "t1", "1", 2, TableState.EMPTY, None)
    assert [(a.kind, a.table_id, a.table_label, a.zone_id, a.status) for a in live.open_alerts] == [
        (AlertKind.LONG_QUEUE, None, None, "z-queue", AlertStatus.OPEN),
        (AlertKind.WAITER_NEEDED, "t3", "3", "z-t3", AlertStatus.ACKNOWLEDGED),
    ]
    assert {a.site_id for a in live.open_alerts} == {"site-demo"}
    [queue] = live.queues
    assert (queue.zone_id, queue.ts, queue.people, queue.longest_wait_s) == (
        "z-queue", T0 + 210.0, 1, 170.0)
    assert live.occupancy is not None and live.occupancy.guests == 2


def test_ignores_unknown_disabled_and_out_of_order_frames() -> None:
    cfg = sample_site_config().model_dump()
    cfg["cameras"][1]["enabled"] = False
    engine = DefaultAnalyticsEngine(replace(sample_site_config(), **cfg), clock=FixedClock())
    engine.configure(engine.config)  # before any frame: uses the clock fallback, no events
    track = Track("a", (0.1, 0.2, 0.14, 0.33), 0.9, T0, AppearanceHints(0.1))
    assert engine.on_track_frame(TrackFrame("cam-x", T0, 0, (track,))) == []
    assert engine.on_track_frame(TrackFrame(E, T0, 0, (track,))) == []
    assert engine.on_track_frame(TrackFrame("cam-dining", T0 + 5, 0, (track,))) == []
    assert engine.on_track_frame(TrackFrame("cam-dining", T0 + 4, 1, ())) == []
    assert engine.tables.guest_counts()["t1"] == 1  # the stale empty frame was dropped
    assert engine.apply_ack("nope", T0, AckVia.LOCAL) == []


def perf_config() -> SiteConfig:
    """One camera, 20 zones: 16 tables, a queue, an area, a staff area and a line."""
    zones: list[Zone] = []
    tables: list[Table] = []
    for i in range(16):
        x, y = 0.02 + (i % 4) * 0.24, 0.05 + (i // 4) * 0.18
        tables.append(Table(table_id=f"p{i}", label=str(i), seats=4))
        zones.append(Zone(zone_id=f"z-p{i}", camera_id="cam-perf", kind=ZoneKind.TABLE,
                          polygon=rect(x, y, x + 0.2, y + 0.15), table_id=f"p{i}",
                          primary=True))
    zones += [
        Zone(zone_id="z-pq", camera_id="cam-perf", kind=ZoneKind.QUEUE,
             polygon=rect(0.0, 0.78, 0.45, 1.0)),
        Zone(zone_id="z-pa", camera_id="cam-perf", kind=ZoneKind.AREA,
             polygon=rect(0.55, 0.78, 0.85, 1.0)),
        Zone(zone_id="z-ps", camera_id="cam-perf", kind=ZoneKind.STAFF_AREA,
             polygon=rect(0.88, 0.78, 1.0, 1.0)),
        Zone(zone_id="z-pl", camera_id="cam-perf", kind=ZoneKind.ENTRANCE_LINE,
             line=Line(a=(0.5, 1.0), b=(0.5, 0.75), in_direction=LineDirection.LEFT_TO_RIGHT)),
    ]
    return SiteConfig(site_id="site-perf", timezone="UTC",
                      cameras=[CameraConfig(camera_id="cam-perf", name="Perf")],
                      tables=tables, zones=zones)


def test_performance_30_tracks_20_zones() -> None:
    engine = DefaultAnalyticsEngine(perf_config(), clock=FixedClock())
    rng = random.Random(7)
    pos = [[rng.random(), rng.random()] for _ in range(30)]
    uniforms = [0.9 if i < 5 else 0.1 for i in range(30)]

    def make(i: int) -> TrackFrame:
        tracks: list[Track] = []
        for k, p in enumerate(pos):
            p[0] = min(0.97, max(0.03, p[0] + rng.uniform(-0.01, 0.01)))
            p[1] = min(1.0, max(0.16, p[1] + rng.uniform(-0.01, 0.01)))
            box = (p[0] - 0.02, p[1] - 0.15, p[0] + 0.02, p[1])
            tracks.append(Track(f"t{k}", box, 0.9, T0, AppearanceHints(uniforms[k])))
        return TrackFrame("cam-perf", T0 + i * 0.2, i, tuple(tracks))

    frames = [make(i) for i in range(600)]
    for tf in frames[:100]:
        engine.on_track_frame(tf)
    start = time.perf_counter()
    for tf in frames[100:]:
        engine.on_track_frame(tf)
        if tf.index % 5 == 0:
            engine.on_tick(tf.ts)
    avg_ms = (time.perf_counter() - start) * 1000 / 500
    assert avg_ms < 5.0, f"{avg_ms:.2f} ms per frame"



def test_table_on_a_disabled_camera_is_not_tracked() -> None:
    data = crisp_config().model_dump()
    for zone in data["zones"]:
        if zone["zone_id"] in ("z-t5", "z-t5-entrance"):
            zone["primary"] = zone["zone_id"] == "z-t5-entrance"
    data["cameras"][1]["enabled"] = False
    sc = Scenario(SiteConfig.model_validate(data)).add(person(at="z-t5", from_t=0))
    sc.run(60)
    assert sc.summary() == []
    assert "t5" not in sc.eng.tables.table_ids()
    assert [t.table_id for t in sc.eng.live().tables] == ["t1", "t2", "t3", "t4", "t6", "t7",
                                                          "t8"]
    occ = sc.eng.live().occupancy
    assert occ is not None and occ.tables_total == 7
