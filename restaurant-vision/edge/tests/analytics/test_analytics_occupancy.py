"""Occupancy: table guests + area guests, tables occupied, staff on floor, snapshots."""

from __future__ import annotations

from analytics_dsl import (
    Scenario,
    crisp_config,
    person,
    with_modules,
    with_zones,
)
from rv_contracts import SiteConfig, Zone, ZoneKind
from rv_contracts.fixtures import rect

D, E = "cam-dining", "cam-entrance"


def occupancy_config() -> SiteConfig:
    return with_zones(
        crisp_config(),
        add=[
            Zone(zone_id="z-bar", camera_id=D, kind=ZoneKind.AREA,
                 polygon=rect(0.2, 0.86, 0.8, 0.99)),
            # overlaps table t1 (x 0.04-0.20, y 0.24-0.42)
            Zone(zone_id="z-lounge", camera_id=D, kind=ZoneKind.AREA,
                 polygon=rect(0.0, 0.2, 0.22, 0.45)),
        ],
    )


def crowd(config: SiteConfig) -> Scenario:
    sc = Scenario(config)
    sc.add(person(at="t1", from_t=0), person(at="t1", from_t=0, offset=(0.02, 0.0)))
    for dx in (-0.03, 0.0, 0.03):
        sc.add(person(at="t3", from_t=0, offset=(dx, 0.0)))
    sc.add(person(at="z-bar", from_t=0, config=config))
    sc.add(person((0.21, 0.30), camera=D, from_t=0))  # lounge, outside t1
    sc.add(person((0.6, 0.93), role="staff", camera=D, from_t=0))  # bartender in the bar area
    sc.add(person((0.3, 0.3), role="staff", camera=E, from_t=0))  # host on the entrance cam
    return sc


def test_occupancy_snapshot_contents_and_interval() -> None:
    sc = crowd(occupancy_config())
    sc.run(40)
    occ = [s for s in sc.summary(snapshots=True) if s[1] == "occupancy"]
    # guests: t1 2 + t3 3 + bar 1 + lounge 1 (the t1 guests inside the lounge polygon are
    # counted by their table only); staff: dining camera 1 + entrance camera 1 (it hosts the
    # non-primary z-t5-entrance zone, so its staff count too: a documented upper bound)
    assert occ == [
        (0.0, "occupancy", 7, 0, 8, 2),
        (10.0, "occupancy", 7, 0, 8, 2),
        (20.0, "occupancy", 7, 2, 8, 2),
        (30.0, "occupancy", 7, 2, 8, 2),
        (40.0, "occupancy", 7, 2, 8, 2),
    ]
    live = sc.eng.live().occupancy
    assert live is not None and (live.guests, live.tables_occupied, live.staff_on_floor) == (
        7, 2, 2)
    assert sc.eng.occupancy.snapshot()["areas"] == {"z-bar": 1, "z-lounge": 1}


def test_tables_module_off_counts_occupied_tables_by_guests() -> None:
    sc = crowd(with_modules(occupancy_config(), tables=False))
    sc.run(10)
    occ = [s for s in sc.summary(snapshots=True) if s[1] == "occupancy"]
    assert occ[-1] == (10.0, "occupancy", 7, 2, 8, 2)
    assert [s for s in sc.summary() if s[1] == "state"] == []


def test_occupancy_module_off() -> None:
    sc = crowd(with_modules(occupancy_config(), occupancy=False))
    sc.run(30)
    assert [s for s in sc.summary(snapshots=True) if s[1] == "occupancy"] == []
    assert sc.eng.live().occupancy is None
    assert sc.eng.occupancy.snapshot()["latest"] is None
