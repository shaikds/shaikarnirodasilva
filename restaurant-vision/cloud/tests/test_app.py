"""App wiring: health, error handling, CORS, static web apps, logging and settings."""

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from support import Api, make_settings

import rv_cloud.main as main_module
from rv_cloud import __version__
from rv_cloud.config import Settings
from rv_cloud.integrations import NullPosAdapter, PosCheck
from rv_cloud.logsetup import JsonFormatter, RedactTokensFilter, configure_logging
from rv_cloud.main import create_app


def test_healthz(api: Api) -> None:
    for path in ("/healthz", "/api/v1/healthz"):
        r = api.client.get(path)
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "version": __version__}
        assert len(r.headers["x-request-id"]) == 16


def test_unhandled_errors_do_not_leak(api: Api) -> None:
    @api.app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internals")

    client = TestClient(api.app, raise_server_exceptions=False)
    r = client.get("/boom")
    assert r.status_code == 500
    assert r.json()["detail"] == "Internal server error"
    assert "secret" not in r.text and "Traceback" not in r.text


def test_cors_preflight(api: Api) -> None:
    r = api.client.options(
        "/api/v1/auth/login",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    r = api.client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers


def _spa(directory: Path, name: str) -> Path:
    (directory / "assets").mkdir(parents=True)
    (directory / "index.html").write_text(f"<html>{name}</html>")
    (directory / "assets" / "app.js").write_text(f"console.log('{name}')")
    return directory


def test_static_web_apps_with_spa_fallback(tmp_path: Path) -> None:
    settings = make_settings(
        dashboard_dir=_spa(tmp_path / "dashboard", "dashboard"),
        waiter_dir=_spa(tmp_path / "waiter", "waiter"),
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/").text == "<html>dashboard</html>"
        assert client.get("/sites/abc/live").text == "<html>dashboard</html>"
        assert "dashboard" in client.get("/assets/app.js").text
        assert client.get("/waiter/").text == "<html>waiter</html>"
        assert client.get("/waiter/alerts/123").text == "<html>waiter</html>"
        assert "waiter" in client.get("/waiter/assets/app.js").text
        assert client.get("/api/v1/does-not-exist").status_code == 404
        assert client.get("/healthz").json()["status"] == "ok"


def test_static_dir_without_index_is_skipped(tmp_path: Path) -> None:
    app = create_app(make_settings(dashboard_dir=tmp_path))
    with TestClient(app) as client:
        assert client.get("/").status_code == 404


def test_lifespan_auto_migrates(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'auto.sqlite3'}"
    app = create_app(make_settings(database_url=url, auto_migrate=True))
    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200
        tables = set(inspect(app.state.rv.engine).get_table_names())
    assert {"organizations", "events", "alerts", "commands", "alembic_version"} <= tables


def test_lazy_module_app(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("RV_DATABASE_URL", f"sqlite:///{tmp_path / 'lazy.sqlite3'}")
    monkeypatch.setattr(main_module, "_app", None)
    app = main_module.app
    assert app is main_module.app and app.title == "Restaurant Vision Cloud"
    with pytest.raises(AttributeError):
        _ = main_module.nope


def test_settings_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RV_CORS_ORIGINS", "https://a.example, https://b.example")
    assert Settings(_env_file=None).cors_origins == ["https://a.example", "https://b.example"]  # type: ignore[call-arg]
    monkeypatch.setenv("RV_CORS_ORIGINS", '["https://c.example"]')
    assert Settings(_env_file=None).cors_origins == ["https://c.example"]  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="RV_JWT_SECRET"):
        Settings(_env_file=None, environment="production")  # type: ignore[call-arg]
    prod = Settings(_env_file=None, environment="production", jwt_secret="x" * 40)  # type: ignore[call-arg]
    assert prod.push_enabled is False


def test_json_logging_and_token_redaction() -> None:
    record = logging.LogRecord(
        "rv", logging.INFO, __file__, 1, "GET /ws?token=%s", ("abc.def",), None
    )
    record.request_id = "r1"
    assert RedactTokensFilter().filter(record)
    data = json.loads(JsonFormatter().format(record))
    assert data["msg"] == "GET /ws?token=***"
    assert data["request_id"] == "r1" and data["level"] == "INFO"
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        err = logging.LogRecord(
            "rv", logging.ERROR, __file__, 1, "x?token=abc", None, sys.exc_info()
        )
    RedactTokensFilter().filter(err)
    data = json.loads(JsonFormatter().format(err))
    assert data["msg"] == "x?token=***" and "ValueError" in data["exc"]
    configure_logging("INFO", json_format=False)
    configure_logging("INFO")  # idempotent


def test_null_pos_adapter() -> None:
    pos = NullPosAdapter()
    check = PosCheck(check_id="c1", pos_table_id="12", opened_at=0.0)
    assert pos.on_check_opened("s", check) is None
    assert pos.on_check_closed("s", check) is None
    assert pos.table_id_for("s", "12") is None and pos.pos_table_id_for("s", "t1") is None
