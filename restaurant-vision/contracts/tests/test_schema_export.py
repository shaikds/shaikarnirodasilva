import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

import rv_contracts
from rv_contracts import SCHEMA_VERSION, build_json_schema, export_json_schema
from rv_contracts.schema_export import main, public_types, render_json_schema

WEB_SCHEMA = (
    Path(__file__).resolve().parents[2] / "web/packages/shared/src/contracts/schema.json"
)

EXPECTED = {
    # config
    "SiteConfig", "CameraConfig", "Table", "Zone", "ZoneKind", "Thresholds", "Modules",
    "CameraSource", "Locale", "Line", "LineDirection", "Anchor",
    # events
    "EdgeEvent", "EventBatch", "EventType", "TableStateChanged", "TableSessionClosed",
    "AlertRaised", "AlertAcknowledged", "AlertResolved", "QueueSnapshot", "QueueSeated",
    "QueueWalkaway", "OccupancySnapshot", "EdgeHeartbeat", "CameraHealth", "TableState",
    "AlertKind", "AlertSeverity", "ResolveReason", "AckVia", "CameraStatus",
    # api
    "LoginRequest", "SignupRequest", "RefreshRequest", "TokenPair", "Me", "UserInfo", "OrgInfo",
    "MembershipInfo", "SiteRef", "OrgUser", "UserCreate", "UserUpdate", "Role", "Plan",
    "Currency", "SiteSummary", "SiteCreate", "SiteSettings", "SiteSettingsPatch",
    "FloorPlanItem", "PairingCodeInfo", "PairRequest", "PairResponse", "DeviceStatus",
    "EventsAccepted", "EdgeCommand", "AlertAckCommand", "ConfigChangedCommand", "CommandKind",
    "CommandsPage", "AlertStatus", "AlertView", "TableLive", "OccupancyLive", "QueueLive",
    "LiveSnapshot", "CoverageReport", "Estimate", "MetricsSummary", "TimeseriesMetric", "Bucket",
    "TimeseriesPoint", "Timeseries", "TableStats", "RoiBlock", "ShiftReport", "BranchComparison",
    "VapidPublicKey", "PushKeys", "PushSubscriptionIn", "PushSubscriptionOut", "HealthStatus",
    # 1.1
    "LiveSnapshotMessage", "AlertPush", "WsCloseCode",
}


@pytest.fixture(scope="module")
def schema() -> dict[str, Any]:
    return build_json_schema()


def _walk(node: Any) -> list[Any]:
    found = [node]
    if isinstance(node, dict):
        for value in node.values():
            found += _walk(value)
    elif isinstance(node, list):
        for value in node:
            found += _walk(value)
    return found


def test_every_public_model_is_defined(schema: dict[str, Any]) -> None:
    defs = schema["$defs"]
    assert set(defs) >= EXPECTED, sorted(EXPECTED - set(defs))
    assert set(schema["properties"]) == set(public_types())
    assert set(schema["required"]) == set(schema["properties"])
    for name in ("ContractModel", "EdgeEventBase", "EdgeCommandBase"):
        assert name not in defs


def test_every_model_in_package_is_exported(schema: dict[str, Any]) -> None:
    from pydantic import BaseModel

    for name in rv_contracts.__all__:
        obj = getattr(rv_contracts, name)
        if isinstance(obj, type) and issubclass(obj, BaseModel) and name not in {
            "ContractModel", "EdgeEventBase", "EdgeCommandBase",
        }:
            assert name in schema["$defs"], name


def test_all_refs_resolve(schema: dict[str, Any]) -> None:
    defs = schema["$defs"]
    refs = [n["$ref"] for n in _walk(schema) if isinstance(n, dict) and "$ref" in n]
    assert refs
    for ref in refs:
        assert ref.startswith("#/$defs/")
        assert ref.removeprefix("#/$defs/") in defs, ref


def test_unions(schema: dict[str, Any]) -> None:
    edge_event = schema["$defs"]["EdgeEvent"]
    assert edge_event["title"] == "EdgeEvent"
    assert len(edge_event["oneOf"]) == 10
    assert edge_event["discriminator"]["propertyName"] == "type"
    assert len(schema["$defs"]["EdgeCommand"]["oneOf"]) == 2
    queue_seated = schema["$defs"]["QueueSeated"]
    assert queue_seated["properties"]["type"]["const"] == "queue.seated"


def test_serialized_form_and_ts_friendliness(schema: dict[str, Any]) -> None:
    defs = schema["$defs"]
    # Defaults are always present on the wire, so they are required ...
    assert "schema_version" in defs["QueueSeated"]["required"]
    assert set(defs["Thresholds"]["required"]) == set(defs["Thresholds"]["properties"])
    assert defs["SiteConfig"]["additionalProperties"] is False
    # ... except for partial updates.
    assert "required" not in defs["SiteSettingsPatch"]
    assert "required" not in defs["UserUpdate"]
    nodes = _walk(schema)
    assert not any(isinstance(n, dict) and "prefixItems" in n for n in nodes)
    assert not any(isinstance(n, dict) and "$ref" in n and len(n) > 1 for n in nodes)
    for model in defs.values():
        for prop in model.get("properties", {}).values():
            assert "title" not in prop
    point = defs["Line"]["properties"]["a"]
    assert point["items"] == {"type": "number", "minimum": 0.0, "maximum": 1.0}
    assert point["minItems"] == point["maxItems"] == 2


def test_root_metadata(schema: dict[str, Any]) -> None:
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["x-schema-version"] == SCHEMA_VERSION
    assert schema["title"] == "RvContracts"


def test_export_writes_valid_json(tmp_path: Path) -> None:
    target = export_json_schema(tmp_path / "nested" / "schema.json")
    data = json.loads(target.read_text(encoding="utf-8"))
    assert set(data["$defs"]) >= EXPECTED
    assert target.read_text(encoding="utf-8") == render_json_schema()  # deterministic


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    target = tmp_path / "schema.json"
    assert main(["--check", str(target)]) == 1
    assert main([str(target)]) == 0
    assert main(["--check", str(target)]) == 0
    target.write_text("{}", encoding="utf-8")
    assert main(["--check", str(target)]) == 1
    capsys.readouterr()


def test_module_entry_point(tmp_path: Path) -> None:
    target = tmp_path / "schema.json"
    result = subprocess.run(
        [sys.executable, "-W", "error", "-m", "rv_contracts.schema_export", str(target)],
        capture_output=True, text=True, check=True,
    )
    assert result.stderr == ""
    assert json.loads(target.read_text(encoding="utf-8"))["title"] == "RvContracts"


@pytest.mark.skipif(not WEB_SCHEMA.exists(), reason="web package not present")
def test_committed_web_schema_is_up_to_date() -> None:
    assert WEB_SCHEMA.read_text(encoding="utf-8") == render_json_schema(), (
        "run: python -m rv_contracts.schema_export "
        "web/packages/shared/src/contracts/schema.json"
    )
