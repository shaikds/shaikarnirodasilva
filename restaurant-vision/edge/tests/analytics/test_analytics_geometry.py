"""ZoneIndex, scene line crossings, smoothing primitives and the interval timer."""

from __future__ import annotations

import math

import pytest
from analytics_dsl import T0, replace
from rv_contracts import (
    Anchor,
    AppearanceHints,
    Crossing,
    Track,
    TrackFrame,
    ZoneKind,
)
from rv_contracts.fixtures import sample_site_config
from rv_edge.analytics import SceneModule, ZoneIndex
from rv_edge.analytics.smoothing import HeldSet, RollingMedian, SmoothedCount
from rv_edge.analytics.timers import IntervalTimer
from rv_edge.analytics.zones import NO_HITS, border_distance, distance_to_segment


def test_zone_index_hits_by_kind_and_anchor_rules() -> None:
    index = ZoneIndex(sample_site_config())
    dining = index.camera("cam-dining")
    entrance = index.camera("cam-entrance")
    assert dining is not None and entrance is not None
    assert dining.hosts_tables and entrance.hosts_tables  # z-t5-entrance (non-primary)
    assert dining.hits((0.12, 0.33)).tables == ("z-t1",)
    assert dining.hits((0.93, 0.1)).staff_area
    assert dining.hits((0.5, 0.47)) is NO_HITS
    assert entrance.hits((0.3, 0.7)).queues == ("z-queue",)
    assert entrance.hits((0.8, 0.7)).tables == ("z-t5-entrance",)
    assert index.polygon("z-privacy-restrooms") is None  # privacy zones are not indexed
    assert index.polygon("z-t1") is not None and index.line("z-entrance-line") is not None
    assert set(index.cameras) == {"cam-dining", "cam-entrance"}
    # foot anchor = bottom centre; a box standing above t1 has its feet in t1
    assert dining.anchor_of((0.1, 0.1, 0.14, 0.3)) == pytest.approx((0.12, 0.3))
    cfg = sample_site_config().model_dump()
    cfg["cameras"][0]["anchor"] = Anchor.CENTER.value
    cfg["cameras"][1]["enabled"] = False
    index2 = ZoneIndex(replace(sample_site_config(), **cfg))
    assert index2.camera("cam-entrance") is None
    cam = index2.camera("cam-dining")
    assert cam is not None
    assert cam.anchor_of((0.1, 0.1, 0.14, 0.3)) == pytest.approx((0.12, 0.2))


def test_polygon_and_line_helpers() -> None:
    index = ZoneIndex(sample_site_config())
    t1 = index.polygon("z-t1")
    line = index.line("z-entrance-line")
    assert t1 is not None and line is not None and t1.kind is ZoneKind.TABLE
    assert t1.centroid() == pytest.approx((0.12, 0.33))
    assert t1.boundary_distance((0.12, 0.33)) == pytest.approx(0.08)
    assert t1.contains((0.04, 0.24)) and not t1.contains((0.5, 0.5))
    assert line.side((0.7, 0.5)) == 1 and line.side((0.6, 0.5)) == -1
    assert line.crossing((0.6, 0.5), (0.7, 0.5)) is Crossing.IN
    assert line.crossing((0.7, 0.5), (0.6, 0.5)) is Crossing.OUT
    assert line.distance((0.66, 0.1)) == pytest.approx(0.15)
    assert distance_to_segment((1.0, 1.0), (0.0, 0.0), (0.0, 0.0)) == pytest.approx(math.sqrt(2))
    assert border_distance((0.1, 0.5)) == pytest.approx(0.1)
    with pytest.raises(ValueError):
        from rv_contracts import Zone
        from rv_edge.analytics.zones import PolygonZone

        PolygonZone.from_zone(Zone.model_construct(zone_id="x", kind=ZoneKind.QUEUE,
                                                   polygon=None))


def frame(ts: float, *anchors: tuple[str, float, float]) -> TrackFrame:
    tracks = tuple(
        Track(tid, (x - 0.02, y - 0.15, x + 0.02, y), 0.9, T0, AppearanceHints(0.1))
        for tid, x, y in anchors
    )
    return TrackFrame("cam-entrance", T0 + ts, int(ts * 4), tracks)


def test_scene_counts_a_crossing_once_when_pausing_on_the_line() -> None:
    scene = SceneModule(sample_site_config())
    path = [(0.6, 0.6), (0.66, 0.6), (0.66, 0.6), (0.7, 0.6), (0.62, 0.6)]
    crossings = []
    for i, (x, y) in enumerate(path):
        obs = scene.observe(frame(i * 0.25, ("a", x, y)))
        assert obs is not None
        crossings += [c for _, c in obs.tracks[0].crossings]
    assert crossings == [Crossing.IN, Crossing.OUT]
    tf = frame(2.0, ("a", 0.3, 0.7))
    assert scene.observe(tf) is scene.observe(tf)  # cached per frame object
    assert scene.on_track_frame(tf) == []
    assert scene.observe(TrackFrame("cam-x", T0, 0, ())) is None
    assert scene.snapshot() == {"tracks": 1, "roles": {"guest": 1, "staff": 0, "unknown": 0}}
    scene.on_tick(T0 + 62.25)
    assert scene.snapshot()["tracks"] == 0 and len(scene.roles) == 0
    scene.observe(frame(70.0, ("b", 0.3, 0.7)))
    cfg = sample_site_config().model_dump()
    cfg["cameras"][1]["enabled"] = False
    scene.configure(replace(sample_site_config(), **cfg))
    assert scene.snapshot()["tracks"] == 0 and len(scene.roles) == 0


def test_rolling_median_is_the_lower_median_over_the_window() -> None:
    m = RollingMedian(1.0)
    assert m.value == 0 and len(m) == 0
    assert [m.add(t, v) for t, v in [(0.0, 3), (0.25, 1), (0.5, 2), (0.75, 5)]] == [3, 1, 2, 2]
    assert m.add(1.0, 5) == 2  # 0.0 left the window (t - 1.0, t]: [1, 2, 5, 5]
    assert len(m) == 4
    m.window_s = 0.3
    assert m.add(1.25, 0) == 0 and len(m) == 2
    m.clear()
    assert m.value == 0
    with pytest.raises(ValueError):
        RollingMedian(0.0)


def test_held_set_and_smoothed_count() -> None:
    held = HeldSet(3.0)
    held.see_frame(0.0, [("c", "a"), ("c", "b")])
    held.see_frame(1.0, [("c", "a")])
    assert held.count(3.0) == 2 and held.count(4.0) == 1  # b expired, a held
    assert held.count(4.25) == 0
    held.see_frame(5.0, [("c", "b")])
    held.see_frame(6.0, [("c", "x")])  # new id while "b" is missing: replaces it
    assert held.count(6.0) == 1
    held.see_frame(12.0, [("c", "y")])  # nothing missing within the hold: just adds
    assert held.count(12.0) == 1
    held.discard(("c", "y"))
    assert held.count(12.0) == 0
    s = SmoothedCount(window_s=0.1)
    assert s.update(0.0, [("c", "a"), ("c", "b")]) == 2
    assert s.update(0.25, [], drop=[("c", "b")]) == 1  # "b" turned out to be staff
    assert (s.raw, s.value, s.window_s) == (1, 1, 0.1)
    s.window_s = 1.0
    s.clear()
    assert (s.raw, s.value) == (0, 0)


def test_interval_timer_fires_first_tick_then_anchored() -> None:
    timer = IntervalTimer(10.0)
    fired = [t for t in [0.0, 1.0, 9.5, 10.0, 15.0, 20.4, 30.0, 75.0, 80.0, 85.0]
             if timer.due(t)]
    assert fired == [0.0, 10.0, 20.4, 30.0, 75.0, 85.0]
    timer.reset()
    assert timer.due(86.0)
