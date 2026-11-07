"""Mapping of ORM rows to ``rv_contracts`` response models (no queries here)."""

import zoneinfo
from collections.abc import Iterable, Mapping, Sequence

from rv_contracts import (
    DEVICE_OFFLINE_AFTER_S,
    AckVia,
    AlertKind,
    AlertSeverity,
    AlertStatus,
    AlertView,
    CameraHealth,
    Currency,
    DeviceStatus,
    FloorPlanItem,
    Locale,
    MembershipInfo,
    Modules,
    OrgUser,
    Plan,
    ResolveReason,
    Role,
    SiteConfig,
    SiteSettings,
    Table,
    UserInfo,
)

from ..db.models import Alert, Device, DeviceHealth, Membership, Site, User
from ..errors import Forbidden, InvalidInput

FLOOR_PLAN_COLUMNS = 4
"""Auto-placed tables: this many per row, two grid cells apart."""


def load_config(site: Site) -> SiteConfig:
    """The stored ``SiteConfig`` of ``site`` (``config_version`` from the site row)."""
    data = dict(site.config_json)
    data["config_version"] = site.config_version
    return SiteConfig.model_validate(data)


def store_config(site: Site, config: SiteConfig) -> None:
    site.config_json = config.model_dump(mode="json")
    site.config_version = config.config_version


def table_labels(config: SiteConfig) -> dict[str, str]:
    return {t.table_id: t.label for t in config.tables}


def validate_timezone(name: str) -> str:
    """Raise :class:`InvalidInput` unless ``name`` is a known IANA zone."""
    try:
        zoneinfo.ZoneInfo(name)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError) as exc:
        raise InvalidInput(f"Unknown time zone {name!r}") from exc
    return name


def check_plan_modules(plan: str, modules: Modules) -> None:
    """Starter plans cannot enable Pro modules (table states, waiter alerts)."""
    if plan == Plan.STARTER.value and (modules.tables or modules.alerts):
        raise Forbidden("The Starter plan does not include table states or waiter alerts")


def default_modules(plan: str) -> Modules:
    if plan == Plan.STARTER.value:
        return Modules(occupancy=True, queue=True, tables=False, alerts=False)
    return Modules()


def floor_plan(site: Site) -> list[FloorPlanItem]:
    return [FloorPlanItem.model_validate(item) for item in site.floor_plan_json]


def reconcile_floor_plan(
    items: Sequence[FloorPlanItem], tables: Sequence[Table]
) -> list[FloorPlanItem]:
    """Drop items of removed tables and auto-place tables that have no position yet (row-major,
    :data:`FLOOR_PLAN_COLUMNS` per row, skipping occupied cells)."""
    table_ids = [t.table_id for t in tables]
    kept = [item for item in items if item.table_id in set(table_ids)]
    placed = {item.table_id for item in kept}
    occupied = {(item.x, item.y) for item in kept}
    slot = 0
    for table_id in table_ids:
        if table_id in placed:
            continue
        while True:
            x, y = (slot % FLOOR_PLAN_COLUMNS) * 2, (slot // FLOOR_PLAN_COLUMNS) * 2
            slot += 1
            if (x, y) not in occupied and y <= 99:
                break
        occupied.add((x, y))
        kept.append(FloorPlanItem(table_id=table_id, x=x, y=y))
    return kept


def site_settings(site: Site) -> SiteSettings:
    config = load_config(site)
    return SiteSettings(
        site_id=site.id,
        org_id=site.org_id,
        name=site.name,
        timezone=site.timezone,
        locale=Locale(site.locale),
        currency=Currency(site.currency),
        avg_check_per_guest=site.avg_check_per_guest,
        thresholds=config.thresholds,
        modules=config.modules,
        floor_plan=floor_plan(site),
    )


def memberships(rows: Iterable[Membership]) -> list[MembershipInfo]:
    return [MembershipInfo(role=Role(m.role), site_id=m.site_id) for m in rows]


def user_info(user: User) -> UserInfo:
    return UserInfo(user_id=user.id, email=user.email, name=user.name, locale=Locale(user.locale))


def org_user(user: User) -> OrgUser:
    return OrgUser(
        user_id=user.id,
        email=user.email,
        name=user.name,
        locale=Locale(user.locale),
        memberships=memberships(user.memberships),
    )


def alert_status(alert: Alert) -> AlertStatus:
    if alert.resolved_at is not None:
        return AlertStatus.RESOLVED
    if alert.acked_at is not None:
        return AlertStatus.ACKNOWLEDGED
    return AlertStatus.OPEN


def alert_view(alert: Alert, labels: Mapping[str, str]) -> AlertView:
    return AlertView(
        alert_id=alert.alert_id,
        site_id=alert.site_id,
        kind=AlertKind(alert.kind),
        severity=AlertSeverity(alert.severity),
        status=alert_status(alert),
        table_id=alert.table_id,
        table_label=labels.get(alert.table_id) if alert.table_id else None,
        zone_id=alert.zone_id,
        raised_at=alert.raised_at,
        acked_at=alert.acked_at,
        ack_via=AckVia(alert.ack_via) if alert.ack_via else None,
        resolved_at=alert.resolved_at,
        resolve_reason=ResolveReason(alert.resolve_reason) if alert.resolve_reason else None,
    )


def is_online(device: Device, now: float) -> bool:
    return device.last_seen_at is not None and now - device.last_seen_at <= DEVICE_OFFLINE_AFTER_S


def device_status(device: Device, health: DeviceHealth | None, now: float) -> DeviceStatus:
    return DeviceStatus(
        device_id=device.id,
        version=health.version if health is not None else device.version,
        last_seen_at=device.last_seen_at,
        online=is_online(device, now),
        cameras=[CameraHealth.model_validate(c) for c in health.cameras_json] if health else [],
        cpu_pct=health.cpu_pct if health is not None else None,
        mem_mb=health.mem_mb if health is not None else None,
        outbox_depth=health.outbox_depth if health is not None else None,
    )
