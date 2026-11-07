"""``/sites/{site_id}``: settings, config, live view, alerts, devices, metrics and reports."""

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from rv_contracts import (
    AlertView,
    Bucket,
    DeviceStatus,
    LiveSnapshot,
    MetricsSummary,
    PairingCodeInfo,
    Role,
    ShiftReport,
    SiteConfig,
    SiteSettings,
    SiteSettingsPatch,
    TableStats,
    Timeseries,
    TimeseriesMetric,
)

from ...errors import Forbidden
from ...services import AlertService, DeviceService, LiveService, MetricsService, SiteService
from ..deps import AnySiteDep, OwnerSiteDep, SessionDep, StaffSiteDep, StateDep

router = APIRouter(prefix="/sites/{site_id}", tags=["sites"])

FromQuery = Annotated[float | None, Query(alias="from", ge=0, description="Epoch seconds")]
ToQuery = Annotated[float | None, Query(alias="to", ge=0, description="Epoch seconds")]


def _metrics(state: StateDep, session: SessionDep) -> MetricsService:
    return MetricsService(session, state.clock, state.settings.business_day_start_hour)


# --------------------------------------------------------------------------- settings / config


@router.get("", response_model=SiteSettings)
def get_site(access: StaffSiteDep, state: StateDep, session: SessionDep) -> SiteSettings:
    return SiteService(session, state.clock).settings(access.scope)


@router.patch("", response_model=SiteSettings)
def patch_site(
    body: SiteSettingsPatch, access: StaffSiteDep, state: StateDep, session: SessionDep
) -> SiteSettings:
    """Owners: every field. Managers: ``thresholds`` and ``floor_plan``. Changes to time zone,
    locale, thresholds or modules bump ``config_version`` and notify the edge."""
    return SiteService(session, state.clock).patch(access.scope, access.role, body)


@router.get("/config", response_model=SiteConfig)
def get_config(
    access: StaffSiteDep, state: StateDep, session: SessionDep, response: Response
) -> SiteConfig:
    config = SiteService(session, state.clock).config(access.scope)
    response.headers["ETag"] = f'"{config.config_version}"'
    return config


# --------------------------------------------------------------------------- live / alerts


@router.get("/live", response_model=LiveSnapshot)
def live(access: StaffSiteDep, state: StateDep, session: SessionDep) -> LiveSnapshot:
    return LiveService(session, state.clock).snapshot(access.scope)


@router.get("/alerts", response_model=list[AlertView])
def list_alerts(
    access: AnySiteDep,
    state: StateDep,
    session: SessionDep,
    alert_status: Annotated[Literal["open", "all"], Query(alias="status")] = "open",
    from_ts: FromQuery = None,
    to_ts: ToQuery = None,
) -> list[AlertView]:
    """``open``: unresolved (open or acknowledged), oldest first. Waiters: ``open`` only."""
    if alert_status == "all" and access.role is Role.WAITER:
        raise Forbidden("Waiters can list open alerts only")
    return AlertService(session, state.clock).list(
        access.scope, open_only=alert_status == "open", from_ts=from_ts, to_ts=to_ts
    )


# --------------------------------------------------------------------------- devices


@router.post(
    "/devices/pairing-code", response_model=PairingCodeInfo, status_code=status.HTTP_201_CREATED
)
def pairing_code(access: OwnerSiteDep, state: StateDep, session: SessionDep) -> PairingCodeInfo:
    """A single-use code for ``rv-edge pair`` (valid ``RV_PAIRING_CODE_TTL_S``, default 10 min)."""
    return DeviceService(session, state.clock).create_pairing_code(
        access.scope, state.settings.pairing_code_ttl_s
    )


@router.get("/devices", response_model=list[DeviceStatus])
def list_devices(access: StaffSiteDep, state: StateDep, session: SessionDep) -> list[DeviceStatus]:
    return DeviceService(session, state.clock).statuses(access.scope)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: str, access: OwnerSiteDep, state: StateDep, session: SessionDep
) -> Response:
    """Unpair a device (addition beyond 7.3): its token stops working immediately."""
    DeviceService(session, state.clock).delete(access.scope, device_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- metrics / reports


@router.get("/metrics/summary", response_model=MetricsSummary)
def metrics_summary(
    access: StaffSiteDep,
    state: StateDep,
    session: SessionDep,
    from_ts: FromQuery = None,
    to_ts: ToQuery = None,
) -> MetricsSummary:
    """KPIs over ``[from, to)`` (default: last 24 h)."""
    return _metrics(state, session).summary(access.scope, from_ts, to_ts)


@router.get("/metrics/timeseries", response_model=Timeseries)
def metrics_timeseries(
    access: StaffSiteDep,
    state: StateDep,
    session: SessionDep,
    metric: TimeseriesMetric,
    bucket: Bucket = Bucket.MIN_15,
    from_ts: FromQuery = None,
    to_ts: ToQuery = None,
) -> Timeseries:
    """Buckets aligned to the site's local time (``1d`` = local midnight)."""
    return _metrics(state, session).timeseries(access.scope, metric, bucket, from_ts, to_ts)


@router.get("/tables/stats", response_model=list[TableStats])
def tables_stats(
    access: StaffSiteDep,
    state: StateDep,
    session: SessionDep,
    from_ts: FromQuery = None,
    to_ts: ToQuery = None,
) -> list[TableStats]:
    return _metrics(state, session).table_stats(access.scope, from_ts, to_ts)


@router.get("/reports/shift", response_model=ShiftReport)
def shift_report(
    access: StaffSiteDep,
    state: StateDep,
    session: SessionDep,
    date: Annotated[dt.date, Query(description="Site-local business date, YYYY-MM-DD")],
) -> ShiftReport:
    """Business day ``date``: ``RV_BUSINESS_DAY_START_HOUR`` (default 05:00) local time to the
    same hour the next day, plus the ROI block."""
    return _metrics(state, session).shift_report(access.scope, date)
