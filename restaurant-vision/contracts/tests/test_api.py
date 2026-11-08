import datetime as dt
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from rv_contracts import (
    AlertAckCommand,
    AlertKind,
    AlertSeverity,
    AlertStatus,
    AlertView,
    CameraHealth,
    CameraStatus,
    CommandKind,
    CommandsPage,
    ConfigChangedCommand,
    Currency,
    DeviceStatus,
    EdgeCommandAdapter,
    Estimate,
    EventsAccepted,
    LiveSnapshot,
    Locale,
    Me,
    MembershipInfo,
    MetricsSummary,
    Modules,
    OccupancyLive,
    PairRequest,
    PushSubscriptionIn,
    QueueLive,
    RoiBlock,
    Role,
    ShiftReport,
    SiteSettings,
    SiteSettingsPatch,
    TableLive,
    TableState,
    TableStats,
    Thresholds,
    TimeseriesMetric,
    TimeseriesPoint,
    api,
)

TS = 1_793_988_000.0


def _alert(**overrides: Any) -> AlertView:
    data: dict[str, Any] = {
        "alert_id": "a1", "site_id": "s1", "kind": AlertKind.WAITER_NEEDED,
        "severity": AlertSeverity.WARN, "status": AlertStatus.OPEN, "table_id": "t3",
        "table_label": "3", "zone_id": "z-t3", "raised_at": TS, "acked_at": None,
        "ack_via": None, "resolved_at": None, "resolve_reason": None,
    }
    data.update(overrides)
    return AlertView.model_validate(data)


def _summary() -> MetricsSummary:
    return MetricsSummary(
        site_id="s1", from_ts=TS - 86400, to_ts=TS, currency=Currency.ILS, sessions=40,
        guests_served=110, avg_dwell_s=3100.0, turnover_per_table=5.0,
        waiter_response_p50_s=95.0, waiter_response_p90_s=240.0, bussing_delay_p50_s=180.0,
        queue_avg_wait_s=300.0, queue_max_wait_s=900.0, walkaways=3,
        lost_revenue=Estimate(value=3 * 2.5 * 85.0),
    )


def test_membership_scope_rules() -> None:
    assert MembershipInfo(role=Role.OWNER).site_id is None
    assert MembershipInfo(role=Role.WAITER, site_id="s1").site_id == "s1"
    with pytest.raises(ValidationError, match="owner memberships cover all sites"):
        MembershipInfo(role=Role.OWNER, site_id="s1")
    with pytest.raises(ValidationError, match="manager memberships need a site_id"):
        MembershipInfo(role=Role.MANAGER)


def test_me_round_trip() -> None:
    me = Me.model_validate({
        "user": {"user_id": "u1", "email": "dana@example.com", "name": "Dana", "locale": "he"},
        "org": {"org_id": "o1", "name": "Cafe", "plan": "pro"},
        "memberships": [{"role": "manager", "site_id": "s1"}],
        "sites": [{"site_id": "s1", "name": "Tel Aviv"}],
    })
    assert Me.model_validate_json(me.model_dump_json()) == me


def test_email_shape() -> None:
    with pytest.raises(ValidationError):
        api.LoginRequest(email="not-an-email", password="x")


def test_live_snapshot_round_trip() -> None:
    snapshot = LiveSnapshot(
        site_id="s1", ts=TS,
        tables=[TableLive(table_id="t3", label="3", seats=4, state=TableState.SEATED,
                          guest_count=3, since_ts=TS - 200, open_alert_ids=["a1"])],
        occupancy=OccupancyLive(ts=TS, guests=18, tables_occupied=5, tables_total=8,
                                staff_on_floor=3),
        queues=[QueueLive(zone_id="z-queue", ts=TS, people=4, parties_est=2,
                          longest_wait_s=300, avg_wait_s=120)],
        open_alerts=[_alert()],
        devices=[DeviceStatus(
            device_id="d1", version="0.1.0", last_seen_at=TS, online=True,
            cameras=[CameraHealth(camera_id="c1", status=CameraStatus.OK, fps=5.0,
                                  last_frame_age_s=0.1)],
            cpu_pct=30.0, mem_mb=500.0, outbox_depth=0,
        )],
    )
    assert LiveSnapshot.model_validate_json(snapshot.model_dump_json()) == snapshot


def test_alert_view_has_no_identity() -> None:
    names = set(AlertView.model_fields)
    assert not {n for n in names if any(w in n for w in ("user", "by", "staff", "waiter"))}
    acked = _alert(status=AlertStatus.ACKNOWLEDGED, acked_at=TS + 30, ack_via="local")
    assert acked.ack_via == "local"


def test_edge_commands() -> None:
    page = CommandsPage.model_validate({
        "cursor": "42",
        "commands": [
            {"kind": "alert_ack", "command_id": "41", "site_id": "s1", "created_at": TS,
             "alert_id": "a1", "ack_at": TS},
            {"kind": "config_changed", "command_id": "42", "site_id": "s1", "created_at": TS,
             "config_version": 7},
        ],
    })
    assert isinstance(page.commands[0], AlertAckCommand)
    assert isinstance(page.commands[1], ConfigChangedCommand)
    assert page.commands[1].kind is CommandKind.CONFIG_CHANGED
    assert CommandsPage.model_validate_json(page.model_dump_json()) == page
    with pytest.raises(ValidationError):
        EdgeCommandAdapter.validate_python({"kind": "reboot", "command_id": "1", "site_id": "s1",
                                            "created_at": TS})
    with pytest.raises(ValidationError):
        CommandsPage(cursor="", commands=[])


def test_pairing_code_shape() -> None:
    assert PairRequest(code="ABC123").code == "ABC123"
    for bad in ("abc123", "ABC12", "ABC1234", "ABC-12"):
        with pytest.raises(ValidationError):
            PairRequest(code=bad)


def test_events_accepted() -> None:
    assert EventsAccepted(accepted=3, duplicates=1).model_dump() == {"accepted": 3,
                                                                      "duplicates": 1}


def test_site_settings_and_patch() -> None:
    settings = SiteSettings(
        site_id="s1", org_id="o1", name="Tel Aviv", timezone="Asia/Jerusalem", locale=Locale.HE,
        currency=Currency.ILS, avg_check_per_guest=85.0, thresholds=Thresholds(),
        modules=Modules(),
    )
    assert settings.floor_plan == []
    patch = SiteSettingsPatch.model_validate({"avg_check_per_guest": 90})
    assert patch.model_dump(exclude_unset=True) == {"avg_check_per_guest": 90.0}
    with pytest.raises(ValidationError):
        SiteSettingsPatch.model_validate({"currency": "EUR"})
    with pytest.raises(ValidationError):
        SiteSettingsPatch.model_validate({"locale": "fr"})


def test_estimates_are_explicit() -> None:
    assert Estimate(value=None).model_dump() == {"value": None, "is_estimate": True}
    with pytest.raises(ValidationError):
        Estimate.model_validate({"value": 1.0, "is_estimate": False})
    roi = RoiBlock(
        currency=Currency.ILS, avg_check_per_guest=85.0, walkaways=3,
        lost_revenue=Estimate(value=637.5), response_time_baseline_p50_s=180.0,
        response_time_current_p50_s=95.0, response_time_improvement_s=Estimate(value=85.0),
        extra_covers=Estimate(value=6.0), extra_revenue=Estimate(value=510.0),
    )
    dumped = roi.model_dump(mode="json")
    assert dumped["is_estimate"] is True
    assert all(dumped[k]["is_estimate"] is True for k in
               ("lost_revenue", "response_time_improvement_s", "extra_covers", "extra_revenue"))


def test_shift_report_round_trip() -> None:
    summary = _summary()
    report = ShiftReport(
        site_id="s1", date=dt.date(2026, 11, 6), timezone="Asia/Jerusalem",
        from_ts=summary.from_ts, to_ts=summary.to_ts, summary=summary,
        tables=[TableStats(table_id="t3", label="3", seats=4, sessions=6, guests=17,
                           avg_dwell_s=3000.0, avg_party_size=2.8,
                           first_visit_delay_p50_s=110.0, bussing_delay_p50_s=None)],
        occupancy_by_hour=[TimeseriesPoint(ts=TS - 3600, value=12.5),
                           TimeseriesPoint(ts=TS, value=None)],
        roi=RoiBlock(
            currency=Currency.ILS, avg_check_per_guest=85.0, walkaways=3,
            lost_revenue=summary.lost_revenue, response_time_baseline_p50_s=None,
            response_time_current_p50_s=95.0, response_time_improvement_s=Estimate(value=None),
            extra_covers=Estimate(value=None), extra_revenue=Estimate(value=None),
        ),
    )
    data = report.model_dump(mode="json")
    assert data["date"] == "2026-11-06"
    assert ShiftReport.model_validate(data) == report


def test_push_subscription() -> None:
    sub = PushSubscriptionIn.model_validate({
        "site_id": "s1", "endpoint": "https://push.example.com/abc",
        "keys": {"p256dh": "BEl6...", "auth": "k8J..."},
    })
    assert sub.keys.auth == "k8J..."
    with pytest.raises(ValidationError):
        PushSubscriptionIn.model_validate({**sub.model_dump(), "endpoint": "http://insecure"})


IDENTITY_WORDS = ("staff_id", "employee", "waiter_id", "acked_by", "user_id", "face",
                  "embedding", "image")
PEOPLE_MODELS = {"UserInfo", "OrgUser", "Me"}  # account management legitimately has users


def test_no_identity_fields_outside_account_models() -> None:
    for name in dir(api):
        obj = getattr(api, name)
        if not (isinstance(obj, type) and issubclass(obj, BaseModel)) or name in PEOPLE_MODELS:
            continue
        for field in obj.model_fields:
            assert not any(word in field for word in IDENTITY_WORDS), f"{name}.{field}"


# --------------------------------------------------------------------------- 1.1 additions


def test_alert_view_condition_since_is_optional() -> None:
    assert _alert().condition_since_ts is None
    view = _alert(condition_since_ts=TS - 200)
    assert view.model_dump(mode="json")["condition_since_ts"] == TS - 200


def test_device_status_local_url() -> None:
    base = {
        "device_id": "d1", "version": "0.1.0", "last_seen_at": TS, "online": True,
        "cameras": [], "cpu_pct": 1.0, "mem_mb": 2.0, "outbox_depth": 0,
    }
    assert DeviceStatus.model_validate(base).local_url is None
    status = DeviceStatus.model_validate({**base, "local_url": "http://10.0.0.5:8787"})
    assert status.local_url == "http://10.0.0.5:8787"


def test_live_snapshot_message_round_trip() -> None:
    snapshot = LiveSnapshot(site_id="s1", ts=TS, tables=[], occupancy=None, queues=[],
                            open_alerts=[_alert()], devices=[])
    message = api.LiveSnapshotMessage(snapshot=snapshot)
    data = message.model_dump(mode="json")
    assert data["type"] == api.LIVE_SNAPSHOT_MESSAGE_TYPE == "live.snapshot"
    assert api.LiveSnapshotMessage.model_validate_json(message.model_dump_json()) == message
    with pytest.raises(ValidationError):
        api.LiveSnapshotMessage.model_validate({**data, "type": "table.state_changed"})


def test_ws_close_codes() -> None:
    assert [int(c) for c in api.WsCloseCode] == [4400, 4401, 4403]


def test_alert_push_is_anonymous() -> None:
    push = api.AlertPush(alert_id="a1", site_id="s1", kind=AlertKind.WAITER_NEEDED,
                         severity=AlertSeverity.URGENT, table_label="3", raised_at=TS,
                         condition_since_ts=TS - 200)
    assert set(push.model_dump()) == {
        "alert_id", "site_id", "kind", "severity", "table_label", "raised_at",
        "condition_since_ts",
    }
    with pytest.raises(ValidationError, match="Extra inputs"):
        api.AlertPush.model_validate({**push.model_dump(), "user_id": "u1"})


def test_new_timeseries_metrics() -> None:
    assert TimeseriesMetric("queue_wait") is TimeseriesMetric.QUEUE_WAIT
    assert TimeseriesMetric("response_time_p90") is TimeseriesMetric.RESPONSE_TIME_P90
