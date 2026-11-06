"""Site configuration (architecture 5.1): cameras, tables, zones, thresholds and modules.

The cloud stores one :class:`SiteConfig` per site (``Site.config_json``) and serves it to the
edge (``GET /edge/config`` with ETag = ``config_version``); the edge-ui edits it on the LAN
(``PUT /local/config`` -> ``PUT /edge/config``).

Privacy: RTSP URLs, camera credentials and any imagery are deliberately **not** part of these
models. They live only in the edge's local secrets file and never reach the cloud. Because all
models reject unknown fields, such data cannot be smuggled into a config either.

Choices made where architecture 5.1 is open:

* Each table has **at most one** ``primary`` zone (validated). A table with none is a coverage
  gap reported by :meth:`SiteConfig.coverage`, which keeps half-finished setups valid while the
  setup wizard is in progress. The camera of the primary zone is the only one that counts the
  table, so overlapping cameras never double count. Non-primary table zones are allowed
  (e.g. a second camera that also sees the table) and are informational only.
* Privacy masks can be given both as ``CameraConfig.privacy_masks`` and as zones of kind
  ``privacy``; the effective set for a camera is their union
  (:meth:`SiteConfig.privacy_masks_for`). The edge-ui should prefer ``privacy`` zones (they have
  ids, which makes editing easier).
* ``primary`` is only allowed on ``table`` zones; ``table_id`` only (and always) on ``table``
  zones. ``entrance_line`` zones carry a ``line`` and no polygon; every other kind carries a
  ``polygon`` and no line.
* ``timezone`` is checked for IANA shape only (``Area/Location`` or ``UTC``); the cloud checks
  that it exists.
"""

from enum import StrEnum
from typing import Annotated, Self

from pydantic import Field, StringConstraints, model_validator

from ._base import SCHEMA_VERSION, ContractModel, Id, Label, SchemaVersion
from .geometry import Anchor, Line, Polygon


class CameraSource(StrEnum):
    """Where frames come from. Connection details (URLs, credentials) stay on the edge."""

    RTSP = "rtsp"
    FILE = "file"
    SIMULATED = "simulated"


class ZoneKind(StrEnum):
    """What a zone means to the analytics (architecture 6.2)."""

    TABLE = "table"
    """Polygon around a table and its chairs; guest presence drives the table state machine."""
    QUEUE = "queue"
    """Polygon where guests wait to be seated."""
    ENTRANCE_LINE = "entrance_line"
    """Line between the queue and the dining room; inward crossing = seated."""
    STAFF_AREA = "staff_area"
    """Polygon only staff use (kitchen door, bar back); tracks first seen here are staff."""
    AREA = "area"
    """Generic guest area counted for occupancy (bar, standing area)."""
    PRIVACY = "privacy"
    """Polygon blacked out before detection (restrooms, staff room)."""


class Locale(StrEnum):
    """UI and report language. Hebrew is right-to-left."""

    HE = "he"
    EN = "en"


Timezone = Annotated[
    str,
    StringConstraints(
        max_length=64, pattern=r"^(?:UTC|[A-Za-z][A-Za-z0-9_+\-]*(?:/[A-Za-z0-9_+\-]+)+)$"
    ),
]
"""IANA time zone name, e.g. ``Asia/Jerusalem``, ``Australia/Sydney`` or ``UTC``."""

PositiveSeconds = Annotated[float, Field(gt=0)]


class CameraConfig(ContractModel):
    """One camera as the analytics sees it. No URL or credentials (see module docstring)."""

    camera_id: Id
    name: Label
    """Display name, e.g. "Dining room"."""
    source: CameraSource = CameraSource.RTSP
    anchor: Anchor = Anchor.FOOT
    """Point of each person box tested against zones."""
    target_fps: float = Field(default=5.0, gt=0, le=30)
    """Frames per second analysed; the source drops frames down to this rate."""
    privacy_masks: list[Polygon] = Field(default_factory=list)
    """Polygons blacked out before detection (merged with ``privacy`` zones)."""
    enabled: bool = True


class Table(ContractModel):
    """A physical table. ``table_id`` is stable; ``label`` is what staff call it."""

    table_id: Id
    label: Label
    """Shown to staff, e.g. "12" or "Window 3"."""
    seats: int = Field(ge=1, le=50)
    section: Label | None = None
    """Optional floor section, e.g. "Patio"."""


class Zone(ContractModel):
    """A polygon or line on one camera image (normalized coordinates)."""

    zone_id: Id
    camera_id: Id
    kind: ZoneKind
    polygon: Polygon | None = None
    """Required for every kind except ``entrance_line``; must be None for ``entrance_line``."""
    line: Line | None = None
    """Required for ``entrance_line``; must be None otherwise."""
    table_id: Id | None = None
    """Required for ``table`` zones; must be None otherwise."""
    primary: bool = False
    """``table`` zones only: this camera is the one that counts the table."""

    @model_validator(mode="after")
    def _check_kind(self) -> Self:
        errors: list[str] = []
        if self.kind is ZoneKind.ENTRANCE_LINE:
            if self.line is None:
                errors.append("entrance_line zones need a line")
            if self.polygon is not None:
                errors.append("entrance_line zones must not have a polygon")
        else:
            if self.polygon is None:
                errors.append(f"{self.kind.value} zones need a polygon")
            if self.line is not None:
                errors.append(f"{self.kind.value} zones must not have a line")
        if self.kind is ZoneKind.TABLE:
            if self.table_id is None:
                errors.append("table zones need a table_id")
        else:
            if self.table_id is not None:
                errors.append(f"{self.kind.value} zones must not have a table_id")
            if self.primary:
                errors.append("only table zones can be primary")
        if errors:
            raise ValueError(f"zone {self.zone_id!r}: " + "; ".join(errors))
        return self


class Thresholds(ContractModel):
    """Per-site analytics timing (architecture 5.1/6.2). Seconds unless the name says otherwise."""

    seat_confirm_s: PositiveSeconds = 20.0
    """Guests continuously present this long: ``empty -> seated`` (opens a session)."""
    leave_confirm_s: PositiveSeconds = 45.0
    """No guests this long: ``seated|attended -> needs_bussing`` (closes the session)."""
    staff_visit_min_s: PositiveSeconds = 5.0
    """Staff track in a table zone this long counts as a visit."""
    first_visit_timeout_s: PositiveSeconds = 180.0
    """``seated`` without a visit this long raises ``waiter_needed``."""
    checkin_timeout_s: PositiveSeconds = 900.0
    """``attended`` without a visit this long raises ``checkin_needed``."""
    bussing_visit_min_s: PositiveSeconds = 10.0
    """Staff visit this long during ``needs_bussing``: table is bussed (``-> empty``)."""
    bussing_timeout_s: PositiveSeconds = 300.0
    """``needs_bussing`` this long raises ``bussing_needed``."""
    walkaway_min_wait_s: PositiveSeconds = 60.0
    """Queue tracks leaving outward after waiting at least this long count as walk-aways."""
    long_queue_people: int = Field(default=8, ge=1)
    """People in a queue zone at or above which ``long_queue`` is raised."""
    long_queue_wait_s: PositiveSeconds = 600.0
    """Longest queue wait at or above which ``long_queue`` is raised."""
    count_window_s: PositiveSeconds = 30.0
    """Rolling-median window for smoothing guest counts."""
    snapshot_interval_s: PositiveSeconds = 10.0
    """Interval of ``queue.snapshot`` / ``occupancy.snapshot`` events."""
    track_id_ttl_h: float = Field(default=24.0, gt=0, le=24)
    """Hours before track id mappings rotate. At most 24 (privacy: rotated at least daily)."""


class Modules(ContractModel):
    """Analytics modules enabled for the site (plans gate them; see architecture 4)."""

    occupancy: bool = True
    queue: bool = True
    tables: bool = True
    alerts: bool = True


class SiteConfig(ContractModel):
    """Everything the edge needs to run analytics for one site."""

    schema_version: SchemaVersion = SCHEMA_VERSION
    site_id: Id
    timezone: Timezone
    locale: Locale = Locale.HE
    cameras: list[CameraConfig] = Field(default_factory=list)
    tables: list[Table] = Field(default_factory=list)
    zones: list[Zone] = Field(default_factory=list)
    thresholds: Thresholds = Field(default_factory=Thresholds)
    modules: Modules = Field(default_factory=Modules)
    config_version: int = Field(default=0, ge=0)
    """Incremented by the cloud on every save; used as ETag. 0 = never saved."""

    @model_validator(mode="after")
    def _check_references(self) -> Self:
        errors: list[str] = []
        _check_unique("camera_id", [c.camera_id for c in self.cameras], errors)
        _check_unique("table_id", [t.table_id for t in self.tables], errors)
        _check_unique("zone_id", [z.zone_id for z in self.zones], errors)
        camera_ids = {c.camera_id for c in self.cameras}
        table_ids = {t.table_id for t in self.tables}
        primaries: dict[str, list[str]] = {}
        for zone in self.zones:
            if zone.camera_id not in camera_ids:
                errors.append(f"zone {zone.zone_id!r}: unknown camera_id {zone.camera_id!r}")
            if zone.table_id is not None:
                if zone.table_id not in table_ids:
                    errors.append(f"zone {zone.zone_id!r}: unknown table_id {zone.table_id!r}")
                if zone.primary:
                    primaries.setdefault(zone.table_id, []).append(zone.zone_id)
        for table_id, zone_ids in primaries.items():
            if len(zone_ids) > 1:
                errors.append(
                    f"table {table_id!r} has {len(zone_ids)} primary zones {zone_ids}; "
                    "at most one is allowed"
                )
        if errors:
            raise ValueError("invalid site config: " + "; ".join(errors))
        return self

    def coverage(self) -> list[str]:
        """Table ids (in table order) that no camera counts: no primary zone, or the primary
        zone's camera is disabled. The setup wizard lists these and suggests a camera."""
        enabled = {c.camera_id for c in self.cameras if c.enabled}
        covered = {
            z.table_id
            for z in self.zones
            if z.kind is ZoneKind.TABLE and z.primary and z.camera_id in enabled
        }
        return [t.table_id for t in self.tables if t.table_id not in covered]

    def primary_zone(self, table_id: str) -> Zone | None:
        """The primary zone of ``table_id``, or None."""
        return next((z for z in self.zones if z.table_id == table_id and z.primary), None)

    def zones_for(self, camera_id: str, kind: ZoneKind | None = None) -> list[Zone]:
        """Zones drawn on ``camera_id``, optionally filtered by kind, in config order."""
        return [
            z for z in self.zones if z.camera_id == camera_id and (kind is None or z.kind is kind)
        ]

    def privacy_masks_for(self, camera_id: str) -> list[Polygon]:
        """All polygons to black out on ``camera_id``: camera masks plus ``privacy`` zones."""
        masks: list[Polygon] = []
        for camera in self.cameras:
            if camera.camera_id == camera_id:
                masks.extend(camera.privacy_masks)
        masks.extend(
            z.polygon for z in self.zones_for(camera_id, ZoneKind.PRIVACY) if z.polygon is not None
        )
        return masks


def _check_unique(name: str, values: list[str], errors: list[str]) -> None:
    seen: set[str] = set()
    duplicates: list[str] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    if duplicates:
        errors.append(f"duplicate {name}: {duplicates}")
