"""Realistic sample data for tests, the simulator and UI mocks.

``sample_site_config()`` describes a small restaurant with two cameras:

* ``cam-dining`` (dining room, high on the wall facing the room): 8 tables, each with its
  **primary** zone: ``t1``-``t2`` (2 seats, section "Window"), ``t3``-``t6`` (4 seats,
  "Main"), ``t7``-``t8`` (6 seats, "Family"). The far row (``y 0.24-0.42``) holds
  ``t1``-``t4``, the near row (``y 0.52-0.84``) holds ``t5``-``t8``; table zones do not overlap.
  ``z-staff-kitchen`` is a staff area at the kitchen door (top right) and
  ``z-privacy-restrooms`` a privacy mask over the restroom corridor (top left).
* ``cam-entrance`` (entrance, looking into the room): queue zone ``z-queue`` on the left,
  entrance line ``z-entrance-line`` at ``x = 0.66`` drawn bottom to top with
  ``in_direction=left_to_right``, so moving right (towards the dining room, ``x > 0.66``) is
  inward. ``z-t5-entrance`` is a **non-primary** view of table ``t5`` (near the entrance), to
  exercise overlapping cameras.

Zone ids: ``z-t1`` ... ``z-t8``, ``z-t5-entrance``, ``z-queue``, ``z-entrance-line``,
``z-staff-kitchen``, ``z-privacy-restrooms``.

``sample_events()`` returns one valid event of every type, consistent with that config.
"""

from .api import Currency
from .config import CameraConfig, CameraSource, Locale, SiteConfig, Table, Zone, ZoneKind
from .events import (
    AckVia,
    AlertAcknowledged,
    AlertKind,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    CameraHealth,
    CameraStatus,
    EdgeEvent,
    EdgeHeartbeat,
    OccupancySnapshot,
    QueueSeated,
    QueueSnapshot,
    QueueWalkaway,
    ResolveReason,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    make_event,
)
from .geometry import Line, LineDirection, Point
from .ids import new_uuid7

SAMPLE_SITE_ID = "site-demo"
SAMPLE_TIMEZONE = "Asia/Jerusalem"
SAMPLE_CURRENCY = Currency.ILS
SAMPLE_TS = 1_793_988_000.0
"""2026-11-06 18:00 UTC, a Friday-evening service."""

CAM_DINING = "cam-dining"
CAM_ENTRANCE = "cam-entrance"
QUEUE_ZONE_ID = "z-queue"
ENTRANCE_LINE_ZONE_ID = "z-entrance-line"
STAFF_ZONE_ID = "z-staff-kitchen"
PRIVACY_ZONE_ID = "z-privacy-restrooms"

# table_id, label, seats, section, dining-camera rectangle (x1, y1, x2, y2)
_TABLES: tuple[tuple[str, str, int, str, tuple[float, float, float, float]], ...] = (
    ("t1", "1", 2, "Window", (0.04, 0.24, 0.20, 0.42)),
    ("t2", "2", 2, "Window", (0.24, 0.24, 0.40, 0.42)),
    ("t3", "3", 4, "Main", (0.44, 0.24, 0.62, 0.42)),
    ("t4", "4", 4, "Main", (0.66, 0.24, 0.84, 0.42)),
    ("t5", "5", 4, "Main", (0.04, 0.52, 0.24, 0.84)),
    ("t6", "6", 4, "Main", (0.28, 0.52, 0.48, 0.84)),
    ("t7", "7", 6, "Family", (0.52, 0.52, 0.74, 0.84)),
    ("t8", "8", 6, "Family", (0.78, 0.52, 0.98, 0.84)),
)


def rect(x1: float, y1: float, x2: float, y2: float) -> list[Point]:
    """Axis-aligned rectangle polygon, clockwise on screen from the top-left corner."""
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def sample_site_config(
    site_id: str = SAMPLE_SITE_ID, source: CameraSource = CameraSource.SIMULATED
) -> SiteConfig:
    """A complete, valid two-camera, eight-table site config (see module docstring)."""
    cameras = [
        CameraConfig(camera_id=CAM_DINING, name="Dining room", source=source),
        CameraConfig(camera_id=CAM_ENTRANCE, name="Entrance", source=source),
    ]
    tables = [
        Table(table_id=table_id, label=label, seats=seats, section=section)
        for table_id, label, seats, section, _ in _TABLES
    ]
    zones = [
        Zone(
            zone_id=f"z-{table_id}",
            camera_id=CAM_DINING,
            kind=ZoneKind.TABLE,
            polygon=rect(*box),
            table_id=table_id,
            primary=True,
        )
        for table_id, _, _, _, box in _TABLES
    ]
    zones += [
        Zone(
            zone_id=STAFF_ZONE_ID,
            camera_id=CAM_DINING,
            kind=ZoneKind.STAFF_AREA,
            polygon=rect(0.86, 0.0, 1.0, 0.22),
        ),
        Zone(
            zone_id=PRIVACY_ZONE_ID,
            camera_id=CAM_DINING,
            kind=ZoneKind.PRIVACY,
            polygon=rect(0.0, 0.0, 0.12, 0.18),
        ),
        Zone(
            zone_id=QUEUE_ZONE_ID,
            camera_id=CAM_ENTRANCE,
            kind=ZoneKind.QUEUE,
            polygon=[(0.08, 0.40), (0.58, 0.40), (0.60, 0.98), (0.04, 0.98)],
        ),
        Zone(
            zone_id=ENTRANCE_LINE_ZONE_ID,
            camera_id=CAM_ENTRANCE,
            kind=ZoneKind.ENTRANCE_LINE,
            line=Line(a=(0.66, 0.98), b=(0.66, 0.25), in_direction=LineDirection.LEFT_TO_RIGHT),
        ),
        Zone(
            zone_id="z-t5-entrance",
            camera_id=CAM_ENTRANCE,
            kind=ZoneKind.TABLE,
            polygon=rect(0.74, 0.62, 0.97, 0.95),
            table_id="t5",
            primary=False,
        ),
    ]
    return SiteConfig(
        site_id=site_id,
        timezone=SAMPLE_TIMEZONE,
        locale=Locale.HE,
        cameras=cameras,
        tables=tables,
        zones=zones,
        config_version=1,
    )


def sample_events(site_id: str = SAMPLE_SITE_ID, ts: float = SAMPLE_TS) -> list[EdgeEvent]:
    """One valid event of every type around ``ts``, consistent with ``sample_site_config``."""
    session_id = new_uuid7()
    alert_id = new_uuid7()
    return [
        make_event(
            TableStateChanged, site_id, ts - 3600.0,
            table_id="t3", from_state=TableState.EMPTY, to_state=TableState.SEATED,
            guest_count=3, session_id=session_id,
        ),
        make_event(
            AlertRaised, site_id, ts - 3420.0,
            alert_id=alert_id, kind=AlertKind.WAITER_NEEDED, table_id="t3", zone_id="z-t3",
            severity=AlertSeverity.WARN,
        ),
        make_event(
            AlertAcknowledged, site_id, ts - 3400.0,
            alert_id=alert_id, ack_at=ts - 3400.0, via=AckVia.CLOUD,
        ),
        make_event(
            AlertResolved, site_id, ts - 3350.0,
            alert_id=alert_id, resolved_at=ts - 3350.0, reason=ResolveReason.STAFF_VISIT,
        ),
        make_event(
            TableSessionClosed, site_id, ts,
            table_id="t3", session_id=session_id, seated_at=ts - 3600.0, left_at=ts,
            max_guests=3, first_visit_delay_s=250.0, visits=4, bussing_delay_s=None,
        ),
        make_event(
            QueueSnapshot, site_id, ts,
            zone_id=QUEUE_ZONE_ID, people=5, parties_est=2, longest_wait_s=420.0, avg_wait_s=180.0,
        ),
        make_event(QueueSeated, site_id, ts, zone_id=QUEUE_ZONE_ID, waited_s=300.0),
        make_event(
            QueueWalkaway, site_id, ts, zone_id=QUEUE_ZONE_ID, waited_s=240.0, party_size_est=2
        ),
        make_event(
            OccupancySnapshot, site_id, ts,
            guests=18, tables_occupied=5, tables_total=8, staff_on_floor=3,
        ),
        make_event(
            EdgeHeartbeat, site_id, ts,
            device_id="dev-demo-1", version="0.1.0",
            cameras=[
                CameraHealth(camera_id=CAM_DINING, status=CameraStatus.OK, fps=5.0,
                             last_frame_age_s=0.2),
                CameraHealth(camera_id=CAM_ENTRANCE, status=CameraStatus.DEGRADED, fps=3.1,
                             last_frame_age_s=0.6),
            ],
            cpu_pct=38.5, mem_mb=612.0, outbox_depth=0,
        ),
    ]


__all__ = [
    "CAM_DINING",
    "CAM_ENTRANCE",
    "ENTRANCE_LINE_ZONE_ID",
    "PRIVACY_ZONE_ID",
    "QUEUE_ZONE_ID",
    "SAMPLE_CURRENCY",
    "SAMPLE_SITE_ID",
    "SAMPLE_TIMEZONE",
    "SAMPLE_TS",
    "STAFF_ZONE_ID",
    "rect",
    "sample_events",
    "sample_site_config",
]
