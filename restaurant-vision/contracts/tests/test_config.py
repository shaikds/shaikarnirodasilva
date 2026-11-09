from typing import Any

import pytest
from pydantic import ValidationError

from rv_contracts import (
    SCHEMA_VERSION,
    CameraConfig,
    Modules,
    SiteConfig,
    Thresholds,
    ZoneKind,
)
from rv_contracts.fixtures import (
    CAM_DINING,
    CAM_ENTRANCE,
    PRIVACY_ZONE_ID,
    sample_site_config,
)

SQUARE = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]]
LINE = {"a": [0.5, 0.9], "b": [0.5, 0.1], "in_direction": "left_to_right"}


def _config(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "site_id": "s1",
        "timezone": "Asia/Jerusalem",
        "cameras": [{"camera_id": "c1", "name": "Dining"}],
        "tables": [{"table_id": "t1", "label": "1", "seats": 4}],
        "zones": [
            {
                "zone_id": "z1",
                "camera_id": "c1",
                "kind": "table",
                "polygon": SQUARE,
                "table_id": "t1",
                "primary": True,
            }
        ],
    }
    base.update(overrides)
    return base


def _zone(**fields: Any) -> dict[str, Any]:
    return {"zone_id": "zx", "camera_id": "c1", **fields}


# --------------------------------------------------------------------------- good configs


def test_minimal_config_and_defaults() -> None:
    config = SiteConfig.model_validate(_config())
    assert config.schema_version == SCHEMA_VERSION == "1.2"
    assert config.locale == "he"
    assert config.config_version == 0
    assert config.modules == Modules(occupancy=True, queue=True, tables=True, alerts=True)
    camera = config.cameras[0]
    assert (camera.source, camera.anchor, camera.target_fps, camera.enabled) == (
        "rtsp", "foot", 5.0, True
    )
    assert config.coverage() == []


def test_empty_site_is_valid() -> None:
    config = SiteConfig(site_id="s1", timezone="UTC")
    assert (config.cameras, config.tables, config.zones) == ([], [], [])
    assert config.coverage() == []


def test_threshold_defaults_match_architecture() -> None:
    assert Thresholds().model_dump() == {
        "seat_confirm_s": 20,
        "leave_confirm_s": 45,
        "staff_visit_min_s": 5,
        "first_visit_timeout_s": 180,
        "checkin_timeout_s": 900,
        "bussing_visit_min_s": 10,
        "bussing_timeout_s": 300,
        "walkaway_min_wait_s": 60,
        "long_queue_people": 8,
        "long_queue_wait_s": 600,
        "count_window_s": 30,
        "snapshot_interval_s": 10,
        "track_id_ttl_h": 24,
    }


def test_all_zone_kinds_accepted() -> None:
    zones = _config()["zones"] + [
        _zone(zone_id="zq", kind="queue", polygon=SQUARE),
        _zone(zone_id="zl", kind="entrance_line", line=LINE),
        _zone(zone_id="zs", kind="staff_area", polygon=SQUARE),
        _zone(zone_id="za", kind="area", polygon=SQUARE),
        _zone(zone_id="zp", kind="privacy", polygon=SQUARE),
        _zone(zone_id="z2", kind="table", polygon=SQUARE, table_id="t1"),  # secondary view
    ]
    config = SiteConfig.model_validate(_config(zones=zones))
    assert {z.kind for z in config.zones} == set(ZoneKind)


def test_json_round_trip() -> None:
    config = sample_site_config()
    assert SiteConfig.model_validate_json(config.model_dump_json()) == config


# --------------------------------------------------------------------------- bad configs


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"cameras": [{"camera_id": "c1", "name": "A"}, {"camera_id": "c1", "name": "B"}]},
         "duplicate camera_id"),
        ({"tables": [{"table_id": "t1", "label": "1", "seats": 2}] * 2}, "duplicate table_id"),
        ({"zones": [_zone(zone_id="z1", kind="queue", polygon=SQUARE)] * 2}, "duplicate zone_id"),
        ({"zones": [_zone(camera_id="nope", kind="queue", polygon=SQUARE)]},
         "unknown camera_id 'nope'"),
        ({"zones": [_zone(kind="table", polygon=SQUARE, table_id="t9")]},
         "unknown table_id 't9'"),
        ({"zones": [
            _zone(zone_id="za", kind="table", polygon=SQUARE, table_id="t1", primary=True),
            _zone(zone_id="zb", kind="table", polygon=SQUARE, table_id="t1", primary=True),
        ]}, "2 primary zones"),
    ],
)
def test_reference_validation(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        SiteConfig.model_validate(_config(**overrides))


@pytest.mark.parametrize(
    ("zone", "message"),
    [
        (_zone(kind="table", table_id="t1"), "table zones need a polygon"),
        (_zone(kind="table", polygon=SQUARE), "table zones need a table_id"),
        (_zone(kind="table", polygon=SQUARE, table_id="t1", line=LINE), "must not have a line"),
        (_zone(kind="entrance_line"), "entrance_line zones need a line"),
        (_zone(kind="entrance_line", line=LINE, polygon=SQUARE), "must not have a polygon"),
        (_zone(kind="queue"), "queue zones need a polygon"),
        (_zone(kind="queue", polygon=SQUARE, line=LINE), "queue zones must not have a line"),
        (_zone(kind="queue", polygon=SQUARE, table_id="t1"), "must not have a table_id"),
        (_zone(kind="staff_area", polygon=SQUARE, primary=True), "only table zones can be primary"),
        (_zone(kind="privacy", line=LINE), "privacy zones need a polygon"),
    ],
)
def test_zone_kind_geometry_validation(zone: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        SiteConfig.model_validate(_config(zones=[zone]))


def test_all_errors_reported_together() -> None:
    zones = [
        _zone(zone_id="z1", camera_id="nope", kind="queue", polygon=SQUARE),
        _zone(zone_id="z2", kind="table", polygon=SQUARE, table_id="t9"),
    ]
    with pytest.raises(ValidationError) as info:
        SiteConfig.model_validate(_config(zones=zones))
    assert "unknown camera_id" in str(info.value)
    assert "unknown table_id" in str(info.value)


@pytest.mark.parametrize(
    "field",
    ["rtsp_url", "url", "username", "password", "credentials", "stream_url"],
)
def test_camera_secrets_are_rejected(field: str) -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CameraConfig.model_validate({"camera_id": "c1", "name": "Cam", field: "rtsp://u:p@h/s"})


def test_camera_config_has_no_connection_fields() -> None:
    forbidden = ("url", "rtsp", "user", "password", "credential", "host", "ip", "secret")
    for name in CameraConfig.model_fields:
        assert not any(word in name for word in forbidden), name


def test_unknown_fields_rejected_everywhere() -> None:
    with pytest.raises(ValidationError):
        SiteConfig.model_validate(_config(extra="x"))
    with pytest.raises(ValidationError):
        SiteConfig.model_validate(_config(thresholds={"seat_confirm": 20}))


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"thresholds": {"track_id_ttl_h": 25}}, "less than or equal to 24"),
        ({"thresholds": {"seat_confirm_s": 0}}, "greater than 0"),
        ({"thresholds": {"long_queue_people": 0}}, "greater than or equal to 1"),
        ({"schema_version": "2.0"}, "unsupported schema_version"),
        ({"schema_version": "one"}, "String should match pattern"),
        ({"timezone": "Jerusalem time"}, "String should match pattern"),
        ({"timezone": ""}, "String should match pattern"),
        ({"site_id": "has space"}, "String should match pattern"),
        ({"locale": "fr"}, "Input should be 'he' or 'en'"),
        ({"config_version": -1}, "greater than or equal to 0"),
        ({"tables": [{"table_id": "t1", "label": "1", "seats": 0}]}, "greater than or equal to 1"),
        ({"tables": [{"table_id": "t1", "label": "", "seats": 2}]}, "at least 1 character"),
        ({"cameras": [{"camera_id": "c1", "name": "A", "target_fps": 0}]}, "greater than 0"),
        ({"cameras": [{"camera_id": "c1", "name": "A", "source": "usb"}]}, "Input should be"),
    ],
)
def test_field_validation(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        SiteConfig.model_validate(_config(**overrides))


def test_minor_schema_version_accepted() -> None:
    assert SiteConfig.model_validate(_config(schema_version="1.7")).schema_version == "1.7"


@pytest.mark.parametrize("tz", ["UTC", "Asia/Jerusalem", "America/Argentina/Buenos_Aires",
                                "Etc/GMT-3", "Australia/Sydney"])
def test_timezone_shapes(tz: str) -> None:
    assert SiteConfig.model_validate(_config(timezone=tz)).timezone == tz


def test_models_are_frozen() -> None:
    config = SiteConfig.model_validate(_config())
    with pytest.raises(ValidationError):
        config.site_id = "other"


# --------------------------------------------------------------------------- helpers


def test_coverage_lists_tables_without_primary_zone() -> None:
    tables = [{"table_id": t, "label": t, "seats": 2} for t in ("t1", "t2", "t3")]
    zones = [
        _zone(zone_id="z1", kind="table", polygon=SQUARE, table_id="t1", primary=True),
        _zone(zone_id="z3", kind="table", polygon=SQUARE, table_id="t3"),  # not primary
    ]
    config = SiteConfig.model_validate(_config(tables=tables, zones=zones))
    assert config.coverage() == ["t2", "t3"]


def test_coverage_ignores_primary_zone_on_disabled_camera() -> None:
    cameras = [{"camera_id": "c1", "name": "Dining", "enabled": False}]
    config = SiteConfig.model_validate(_config(cameras=cameras))
    assert config.coverage() == ["t1"]


def test_lookup_helpers_on_sample() -> None:
    config = sample_site_config()
    zone = config.primary_zone("t5")
    assert zone is not None and zone.zone_id == "z-t5" and zone.camera_id == CAM_DINING
    assert config.primary_zone("missing") is None
    assert [z.zone_id for z in config.zones_for(CAM_ENTRANCE, ZoneKind.TABLE)] == ["z-t5-entrance"]
    assert len(config.zones_for(CAM_DINING)) == 10
    assert config.zones_for("missing") == []


def test_privacy_masks_merge_camera_masks_and_privacy_zones() -> None:
    config = sample_site_config()
    privacy_zone = next(z for z in config.zones if z.zone_id == PRIVACY_ZONE_ID)
    assert config.privacy_masks_for(CAM_DINING) == [privacy_zone.polygon]
    assert config.privacy_masks_for(CAM_ENTRANCE) == []

    mask = [[0.8, 0.8], [0.9, 0.8], [0.9, 0.9]]
    cameras = [{"camera_id": "c1", "name": "Dining", "privacy_masks": [mask]}]
    zones = _config()["zones"] + [_zone(zone_id="zp", kind="privacy", polygon=SQUARE)]
    merged = SiteConfig.model_validate(_config(cameras=cameras, zones=zones))
    assert merged.privacy_masks_for("c1") == [
        [(0.8, 0.8), (0.9, 0.8), (0.9, 0.9)],
        [(0.1, 0.1), (0.3, 0.1), (0.3, 0.3), (0.1, 0.3)],
    ]
