"""Migrations, demo seed and VAPID key generation."""

from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select
from support import make_settings

from rv_cloud.db import create_db_engine, upgrade_head
from rv_cloud.db.base import Base
from rv_cloud.db.migrate import alembic_config
from rv_cloud.db.models import Organization, Site, User
from rv_cloud.main import create_app
from rv_cloud.tools import gen_vapid, seed_demo


def test_migrations_match_models_and_downgrade(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'migrate.sqlite3'}"
    engine = create_db_engine(url)
    upgrade_head(engine)
    upgrade_head(engine)  # idempotent
    with engine.connect() as conn:
        context = MigrationContext.configure(conn, opts={"compare_type": True})
        assert compare_metadata(context, Base.metadata) == []
    command.downgrade(alembic_config(url), "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    command.upgrade(alembic_config(url), "head")
    assert "events" in inspect(engine).get_table_names()
    engine.dispose()


def test_seed_demo_is_idempotent(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    url = f"sqlite:///{tmp_path / 'seed.sqlite3'}"
    seed_demo.main(["--database-url", url])
    first = capsys.readouterr().out
    seed_demo.main(["--database-url", url])
    second = capsys.readouterr().out
    assert "demo@example.com / demo-password-123" in first
    assert first.count("pairing code:") == 2 and second.count("pairing code:") == 2
    engine = create_db_engine(url)
    with engine.connect() as conn:
        assert conn.scalar(select(func.count()).select_from(Organization)) == 1
        assert conn.scalar(select(func.count()).select_from(User)) == 3
        sites = conn.execute(select(Site.name, Site.timezone, Site.currency, Site.locale,
                                    Site.config_json)).all()
    engine.dispose()
    assert sorted((s[0], s[1], s[2], s[3]) for s in sites) == [
        ("Sydney", "Australia/Sydney", "AUD", "en"),
        ("Tel Aviv", "Asia/Jerusalem", "ILS", "he"),
    ]
    for site in sites:
        assert site[4]["timezone"] == site[1] and len(site[4]["tables"]) == 8

    # The seeded accounts work against the app, with the expected roles.
    app = create_app(make_settings(database_url=url))
    with TestClient(app) as client:
        def login(email: str) -> dict[str, str]:
            r = client.post("/api/v1/auth/login",
                            json={"email": email, "password": seed_demo.PASSWORD})
            assert r.status_code == 200
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        owner = client.get("/api/v1/me", headers=login("demo@example.com")).json()
        assert owner["org"]["name"] == "Demo Restaurant Group" and len(owner["sites"]) == 2
        tel_aviv = next(s["site_id"] for s in owner["sites"] if s["name"] == "Tel Aviv")
        waiter = client.get("/api/v1/me", headers=login("waiter@example.com")).json()
        assert waiter["memberships"] == [{"role": "waiter", "site_id": tel_aviv}]
        manager = login("manager@example.com")
        settings = client.get(f"/api/v1/sites/{tel_aviv}", headers=manager).json()
        assert len(settings["floor_plan"]) == 8
        code = first.split(f"{tel_aviv}  pairing code: ")[1].split()[0]
        assert client.post("/api/v1/edge/pair", json={"code": code}).status_code == 201


def test_gen_vapid_prints_env_lines(capsys: pytest.CaptureFixture[str]) -> None:
    gen_vapid.main()
    lines = capsys.readouterr().out.splitlines()
    assert lines[0].startswith("RV_VAPID_PRIVATE_KEY=") and len(lines[0].split("=", 1)[1]) == 43
    assert lines[1].startswith("RV_VAPID_PUBLIC_KEY=") and len(lines[1].split("=", 1)[1]) == 87
