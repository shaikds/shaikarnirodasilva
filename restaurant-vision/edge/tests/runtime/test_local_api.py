from __future__ import annotations

import builtins
import io
import json
import os
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import cv2
import httpx
import numpy as np
import pytest
from rv_contracts import (
    AckVia,
    AlertView,
    CoverageReport,
    HealthStatus,
    LiveSnapshot,
    PairResponse,
    SiteConfig,
)
from rv_contracts.fixtures import CAM_DINING, CAM_ENTRANCE
from starlette.testclient import TestClient

from rv_edge.interfaces import SourceSpec
from rv_edge.runtime.local_api import STATE_MESSAGE_TYPE, create_local_app
from rv_edge.runtime.runtime import EdgeRuntime
from rv_edge.runtime.settings import EdgeSettings
from rv_edge.runtime.setup_pin import PinGuard, hash_pin

from .conftest import SITE_ID, sim_specs
from .fakes import ALERT_ID, EngineHolder, FakeFactory, checkerboard, wait_until

PIN = "2468"
AUTH = {"X-Setup-Pin": PIN}
Build = Callable[..., tuple[EdgeRuntime, FakeFactory, EngineHolder]]

SETUP_ENDPOINTS = [
    ("GET", "/local/cameras", None),
    ("POST", "/local/cameras", {"camera_id": "c9", "url": "rtsp://h/s"}),
    ("PUT", "/local/cameras/c9", {}),
    ("DELETE", "/local/cameras/c9", None),
    ("POST", "/local/cameras/discover", None),
    ("GET", f"/local/cameras/{CAM_DINING}/snapshot.jpg", None),
    ("GET", "/local/config", None),
    ("PUT", "/local/config", {}),
    ("GET", "/local/coverage", None),
    ("POST", "/local/uniform/calibrate", {"camera_id": CAM_DINING, "box": [0, 0, 1, 1]}),
    ("POST", "/local/pair", {"code": "ABC123", "cloud_url": "https://c"}),
    ("GET", "/local/setup/pin-check", None),
]


class Api:
    def __init__(self, runtime: EdgeRuntime, factory: FakeFactory, holder: EngineHolder) -> None:
        self.runtime = runtime
        self.factory = factory
        self.holder = holder
        self.client: TestClient


@pytest.fixture
def make_api(make_runtime: Build, settings: EdgeSettings) -> Iterator[Callable[..., Api]]:
    clients: list[TestClient] = []

    def build(
        *, pin: bool = True, guard: PinGuard | None = None, ui_dir: Path | None = None, **kw: Any
    ) -> Api:
        runtime, factory, holder = make_runtime(**kw)
        if pin:
            runtime.secrets.set_setup_pin_hash(hash_pin(PIN, iterations=1000))
        runtime.start()
        app_settings = (
            settings if ui_dir is None else settings.model_copy(update={"edge_ui_dir": ui_dir})
        )
        api = Api(runtime, factory, holder)
        api.client = TestClient(
            create_local_app(runtime, app_settings, state_interval_s=0.2, pin_guard=guard)
        )
        clients.append(api.client)
        return api

    yield build
    for client in clients:
        client.close()


@pytest.fixture
def api(make_api: Callable[..., Api]) -> Api:
    return make_api()


def wait_alert(api: Api) -> None:
    assert wait_until(lambda: api.runtime.find_alert(ALERT_ID) is not None)


# ------------------------------------------------------------------------------ open endpoints
def test_health_and_state(api: Api) -> None:
    assert HealthStatus.model_validate(api.client.get("/local/health").json()).status == "ok"
    wait_alert(api)
    resp = api.client.get("/local/state")
    assert resp.status_code == 200
    snapshot = LiveSnapshot.model_validate(resp.json())
    assert snapshot.site_id == SITE_ID
    assert snapshot.open_alerts[0].alert_id == ALERT_ID
    status = api.client.get("/local/setup/status").json()
    assert status["pin_set"] and status["paired"] and status["configured"]
    assert "token" not in json.dumps(status)


def test_ack_endpoint(api: Api) -> None:
    wait_alert(api)
    resp = api.client.post(f"/local/alerts/{ALERT_ID}/ack")
    assert resp.status_code == 200
    view = AlertView.model_validate(resp.json())
    assert view.ack_via is AckVia.LOCAL and view.acked_at is not None
    assert api.holder.engine.acks[0][2] is AckVia.LOCAL
    assert api.client.post("/local/alerts/unknown-alert/ack").status_code == 404
    assert api.client.post("/local/alerts/bad%20id/ack").status_code == 422


def test_websocket_streams_state_and_events(api: Api) -> None:
    wait_alert(api)
    with api.client.websocket_connect("/local/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == STATE_MESSAGE_TYPE
        LiveSnapshot.model_validate(first["snapshot"])
        assert api.client.post(f"/local/alerts/{ALERT_ID}/ack").status_code == 200
        seen: list[str] = []
        for _ in range(50):
            message = ws.receive_json()
            seen.append(message["type"])
            if message["type"] == "alert.acknowledged":
                assert message["via"] == "local" and message["alert_id"] == ALERT_ID
                break
        assert "alert.acknowledged" in seen
        while ws.receive_json()["type"] != STATE_MESSAGE_TYPE:  # periodic state keeps coming
            pass


# ------------------------------------------------------------------------------ setup PIN
@pytest.mark.parametrize(("method", "path", "body"), SETUP_ENDPOINTS)
def test_setup_endpoints_require_the_pin(
    api: Api, method: str, path: str, body: dict[str, Any] | None
) -> None:
    assert api.client.request(method, path, json=body).status_code == 401
    wrong = api.client.request(method, path, json=body, headers={"X-Setup-Pin": "0000"})
    assert wrong.status_code == 401


def test_pin_lockout(make_api: Callable[..., Api]) -> None:
    api = make_api(guard=PinGuard(max_failures=3, lockout_s=60))
    for _ in range(3):
        assert api.client.get("/local/cameras", headers={"X-Setup-Pin": "1111"}).status_code == 401
    locked = api.client.get("/local/cameras", headers=AUTH)
    assert locked.status_code == 429
    assert 1 <= int(locked.headers["Retry-After"]) <= 60


def test_pin_check(api: Api) -> None:
    ok = api.client.get("/local/setup/pin-check", headers=AUTH)
    assert ok.status_code == 204 and ok.content == b""
    wrong = api.client.get("/local/setup/pin-check", headers={"X-Setup-Pin": "9999"})
    assert wrong.status_code == 401


def test_setup_pin_can_be_set_once(make_api: Callable[..., Api]) -> None:
    api = make_api(pin=False)
    assert api.client.get("/local/cameras", headers=AUTH).status_code == 401
    assert api.client.post("/local/setup-pin", json={"pin": "12"}).status_code == 422
    assert api.client.post("/local/setup-pin", json={"pin": PIN}).status_code == 201
    assert api.client.post("/local/setup-pin", json={"pin": "9999"}).status_code == 409
    assert api.client.get("/local/cameras", headers=AUTH).status_code == 200


# ------------------------------------------------------------------------------ cameras
def test_camera_credentials_are_write_only(make_api: Callable[..., Api]) -> None:
    api = make_api(use_secrets=True)
    body = {
        "camera_id": "cam-door",
        "url": "rtsp://192.168.1.20:554/Streaming/Channels/102",
        "username": "admin",
        "password": "s3cret-pw",
    }
    created = api.client.post("/local/cameras", json=body, headers=AUTH)
    assert created.status_code == 201
    assert created.json()["has_credentials"] is True
    listed = api.client.get("/local/cameras", headers=AUTH)
    assert listed.status_code == 200
    for text in (created.text, listed.text):
        assert "s3cret-pw" not in text and "admin" not in text
    assert listed.json()[0]["url"] == "rtsp://***:***@192.168.1.20:554/Streaming/Channels/102"
    # Non-secret address parts for the wizard's edit form (parsed from the brand template).
    first = listed.json()[0]
    assert {k: first[k] for k in ("brand", "host", "port", "channel", "substream")} == {
        "brand": "hikvision", "host": "192.168.1.20", "port": 554, "channel": 1,
        "substream": True,
    }
    assert api.client.post("/local/cameras", json=body, headers=AUTH).status_code == 409

    # Change only the password: the stored URL is kept.
    updated = api.client.put(
        "/local/cameras/cam-door", json={"username": "admin", "password": "n3w-pw"}, headers=AUTH
    )
    assert updated.status_code == 200 and "n3w-pw" not in updated.text
    stored = api.runtime.secrets.camera_specs()["cam-door"].url
    assert stored == "rtsp://admin:n3w-pw@192.168.1.20:554/Streaming/Channels/102"

    # A validation error never echoes the submitted credentials.
    bad = api.client.post(
        "/local/cameras",
        json={**body, "camera_id": "bad id!", "password": "leak-me"},
        headers=AUTH,
    )
    assert bad.status_code == 422 and "leak-me" not in bad.text

    assert api.client.delete("/local/cameras/cam-door", headers=AUTH).status_code == 204
    assert api.client.delete("/local/cameras/cam-door", headers=AUTH).status_code == 404
    assert api.client.put("/local/cameras/cam-door", json={}, headers=AUTH).status_code == 404


def test_discovery_degrades_gracefully(api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
    import rv_edge.ingest.discovery as discovery

    def fake_discover(timeout: float = 3.0) -> list[Any]:
        return [
            discovery.DiscoveredCamera(
                address="192.168.1.64",
                xaddrs=("http://192.168.1.64/onvif/device_service",),
                manufacturer="Acme",
                model="X1",
                name="Door",
            )
        ]

    monkeypatch.setattr(discovery, "discover", fake_discover)
    found = api.client.post("/local/cameras/discover", headers=AUTH).json()
    assert found["available"] and found["devices"][0]["address"] == "192.168.1.64"

    monkeypatch.setitem(sys.modules, "rv_edge.ingest.discovery", None)
    missing = api.client.post("/local/cameras/discover", headers=AUTH)
    assert missing.status_code == 200 and missing.json()["available"] is False


# ------------------------------------------------------------------------------ snapshots
def _forbid_disk(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("snapshot must not touch the disk")

    monkeypatch.setattr(builtins, "open", boom)
    monkeypatch.setattr(io, "open", boom)
    monkeypatch.setattr(os, "open", boom)
    monkeypatch.setattr(cv2, "imwrite", boom)
    monkeypatch.setattr(cv2, "VideoWriter", boom)


def _get_snapshot(api: Api, camera_id: str, monkeypatch: pytest.MonkeyPatch) -> np.ndarray:
    with monkeypatch.context() as m:
        _forbid_disk(m)
        resp = api.client.get(f"/local/cameras/{camera_id}/snapshot.jpg", headers=AUTH)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "image/jpeg"
    assert "no-store" in resp.headers["cache-control"]
    image = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_GRAYSCALE)
    assert image is not None
    return image


def test_snapshot_blurs_people_in_memory(
    make_api: Callable[..., Api], monkeypatch: pytest.MonkeyPatch
) -> None:
    api = make_api(factory=FakeFactory(image=checkerboard()))
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    image = _get_snapshot(api, CAM_DINING, monkeypatch)
    assert image.shape == (240, 320)
    person = image[70:170, 90:150]  # inside PERSON_BOX (0.25, 0.25, 0.5, 0.75)
    background = image[200:240, 200:320]
    assert person.std() < 25 < background.std()
    assert image[2:40, 2:34].mean() < 10  # restroom privacy zone is black


def test_snapshot_placeholder_for_simulated_frames(
    api: Api, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    image = _get_snapshot(api, CAM_ENTRANCE, monkeypatch)
    assert abs(float(image[120, 120]) - 128) < 12  # person drawn as a filled grey box
    assert image[220, 300] > 200  # light background
    resp = api.client.get("/local/cameras/nope/snapshot.jpg", headers=AUTH)
    assert resp.status_code == 404


def test_snapshot_of_a_camera_not_yet_in_the_config(
    make_api: Callable[..., Api], config: SiteConfig, monkeypatch: pytest.MonkeyPatch
) -> None:
    specs = {**sim_specs(config), "cam-new": SourceSpec("cam-new", "simulated")}
    api = make_api(specs=specs)
    _get_snapshot(api, "cam-new", monkeypatch)
    temp = [p for p in api.factory.built if p.camera_id == "cam-new"]
    assert len(temp) == 1 and temp[0].stopped


# ------------------------------------------------------------------------------ config
def test_config_get_put_and_coverage(api: Api, config: SiteConfig) -> None:
    got = api.client.get("/local/config", headers=AUTH)
    assert SiteConfig.model_validate(got.json()) == config
    data = config.model_dump(mode="json")
    data["zones"] = [z for z in data["zones"] if z["zone_id"] != "z-t1"]
    resp = api.client.put("/local/config", json=data, headers=AUTH)
    assert resp.status_code == 200
    edited = SiteConfig.model_validate(data)
    assert api.runtime.config == edited
    assert api.runtime.config_store.has_pending_push  # queued for the cloud
    assert wait_until(lambda: api.holder.engine.configs[-1] == edited)

    report = CoverageReport.model_validate(api.client.get("/local/coverage", headers=AUTH).json())
    assert report.uncovered_table_ids == ["t1"] and report.site_id == SITE_ID

    invalid = {**data, "tables": [{"table_id": "t1"}]}
    assert api.client.put("/local/config", json=invalid, headers=AUTH).status_code == 422
    other = {**data, "site_id": "other-site"}
    assert api.client.put("/local/config", json=other, headers=AUTH).status_code == 409


def test_uniform_calibration(make_api: Callable[..., Api]) -> None:
    image = np.zeros((240, 320, 3), np.uint8)
    image[:, :] = (200, 40, 40)  # a blue uniform (BGR)
    api = make_api(factory=FakeFactory(image=image))
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    body = {"camera_id": CAM_DINING, "box": [0.25, 0.1, 0.75, 0.9]}
    resp = api.client.post("/local/uniform/calibrate", json=body, headers=AUTH)
    assert resp.status_code == 200, resp.text
    hue, sat, _ = resp.json()["uniform_hsv"]
    assert 200 < hue < 260 and sat > 0.5
    assert api.runtime.secrets.uniform_hsv is not None
    assert wait_until(lambda: any(p.uniform_hsv is not None for p in api.factory.built))

    bad_box = {"camera_id": CAM_DINING, "box": [0.5, 0.5, 0.4, 0.9]}
    assert (
        api.client.post("/local/uniform/calibrate", json=bad_box, headers=AUTH).status_code == 422
    )


def test_uniform_calibration_needs_pixels(api: Api) -> None:
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    body = {"camera_id": CAM_DINING, "box": [0.25, 0.1, 0.75, 0.9]}
    assert api.client.post("/local/uniform/calibrate", json=body, headers=AUTH).status_code == 409


# ------------------------------------------------------------------------------ pairing
def test_pair_endpoint(make_api: Callable[..., Api]) -> None:
    def cloud(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["code"] != "ABC123":
            return httpx.Response(404, json={"detail": "unknown code"})
        body = PairResponse(device_id="dev-9", site_id=SITE_ID, token="tok-xyz")
        return httpx.Response(200, content=body.model_dump_json())

    api = make_api(paired=False, cloud_transport=httpx.MockTransport(cloud))
    resp = api.client.post(
        "/local/pair", json={"code": "abc123", "cloud_url": "https://c.test/"}, headers=AUTH
    )
    assert resp.status_code == 200
    assert resp.json() == {"device_id": "dev-9", "site_id": SITE_ID}
    assert "tok-xyz" not in resp.text
    assert api.runtime.secrets.paired and api.runtime.secrets.cloud_url == "https://c.test"

    bad = api.client.post(
        "/local/pair", json={"code": "ZZZ999", "cloud_url": "https://c.test"}, headers=AUTH
    )
    assert bad.status_code == 400
    malformed = api.client.post(
        "/local/pair", json={"code": "x", "cloud_url": "https://c.test"}, headers=AUTH
    )
    assert malformed.status_code == 400


# ------------------------------------------------------------------------------ static UI
def test_serves_edge_ui_with_spa_fallback(make_api: Callable[..., Api], tmp_path: Path) -> None:
    ui = tmp_path / "dist"
    (ui / "assets").mkdir(parents=True)
    (ui / "index.html").write_text("<html>edge-ui</html>")
    (ui / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("outside")
    api = make_api(ui_dir=ui)
    assert "edge-ui" in api.client.get("/").text
    assert "edge-ui" in api.client.get("/local-alerts").text
    assert api.client.get("/assets/app.js").text == "console.log(1)"
    assert "outside" not in api.client.get("/..%2Fsecret.txt").text
    assert api.client.get("/local/nope").status_code == 404
    assert api.client.get("/local/health").status_code == 200


def test_no_ui_dir_means_api_only(api: Api) -> None:
    assert api.client.get("/").status_code == 404


def test_camera_address_from_options_and_custom_paths(make_api: Callable[..., Api]) -> None:
    api = make_api(use_secrets=True)
    explicit = {
        "camera_id": "cam-bar", "url": "rtsp://10.0.0.7:8554/custom/path",
        "options": {"brand": "Dahua", "channel": 3, "substream": False},
    }
    custom = {"camera_id": "cam-x", "url": "rtsp://cam.local/live"}
    for body in (explicit, custom):
        assert api.client.post("/local/cameras", json=body, headers=AUTH).status_code == 201
    listed = {c["camera_id"]: c for c in api.client.get("/local/cameras", headers=AUTH).json()}
    bar, x = listed["cam-bar"], listed["cam-x"]
    assert (bar["brand"], bar["host"], bar["port"], bar["channel"], bar["substream"]) == (
        "dahua", "10.0.0.7", 8554, 3, False
    )
    assert (x["brand"], x["host"], x["port"], x["channel"], x["substream"]) == (
        None, "cam.local", 554, None, None
    )


def test_simulated_cameras_are_listed(api: Api, config: SiteConfig) -> None:
    listed = api.client.get("/local/cameras", headers=AUTH).json()
    assert {c["camera_id"] for c in listed} == {c.camera_id for c in config.cameras}
    for camera in listed:
        assert camera["kind"] == "simulated" and camera["in_config"] is True
        assert camera["url"] == f"simulated://{camera['camera_id']}"
        assert camera["has_credentials"] is False and camera["host"] is None
    status = api.client.get("/local/setup/status").json()
    assert status["camera_count"] == len(config.cameras)
    assert status["uniform_calibrated"] is False
    api.runtime.secrets.set_uniform_hsv((220.0, 0.8, 0.6))
    assert api.client.get("/local/setup/status").json()["uniform_calibrated"] is True
