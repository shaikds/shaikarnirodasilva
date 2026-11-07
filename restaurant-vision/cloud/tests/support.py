"""Test helpers: fake clock and notifier, settings, and an API driver for common flows."""

from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from rv_contracts import EdgeEventBase, Role, make_event
from rv_contracts.fixtures import sample_site_config

from rv_cloud.config import Settings
from rv_cloud.push import PushTarget, SendOutcome

T0 = 1_793_988_000.0
"""2026-11-06 18:00 UTC (20:00 in Asia/Jerusalem)."""
PASSWORD = "password-123"


class FakeClock:
    def __init__(self, t: float = T0) -> None:
        self.t = t

    def now(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


@dataclass
class FakeNotifier:
    sent: list[tuple[PushTarget, dict[str, Any]]] = field(default_factory=list)
    gone_endpoints: set[str] = field(default_factory=set)

    def send(self, target: PushTarget, payload: dict[str, Any]) -> SendOutcome:
        self.sent.append((target, payload))
        if target.endpoint in self.gone_endpoints:
            return SendOutcome.GONE
        return SendOutcome.SENT


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "test",
        "database_url": "sqlite://",
        "auto_migrate": False,
        "argon2_time_cost": 1,
        "argon2_memory_cost_kib": 8,
        "argon2_parallelism": 1,
        "log_json": False,
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def event(cls: type[EdgeEventBase], site_id: str, ts: float, **payload: Any) -> dict[str, Any]:
    """A valid event as JSON-ready dict."""
    return make_event(cls, site_id, ts, **payload).model_dump(mode="json")


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@dataclass
class Account:
    user_id: str
    org_id: str
    headers: dict[str, str]
    tokens: dict[str, Any]


@dataclass
class Api:
    client: TestClient
    clock: FakeClock
    notifier: FakeNotifier
    app: FastAPI

    # ------------------------------------------------------------------ accounts

    def signup(self, email: str = "owner@a.test", org: str = "Org A") -> Account:
        r = self.client.post(
            "/api/v1/auth/signup",
            json={"org_name": org, "name": "Owner", "email": email, "password": PASSWORD},
        )
        assert r.status_code == 201, r.text
        return self._account(r.json())

    def login(self, email: str, password: str = PASSWORD) -> Account:
        r = self.client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return self._account(r.json())

    def _account(self, tokens: dict[str, Any]) -> Account:
        headers = bearer(tokens["access_token"])
        me = self.client.get("/api/v1/me", headers=headers)
        assert me.status_code == 200, me.text
        body = me.json()
        return Account(
            user_id=body["user"]["user_id"],
            org_id=body["org"]["org_id"],
            headers=headers,
            tokens=tokens,
        )

    def add_user(
        self, owner: Account, email: str, role: Role, site_id: str | None = None
    ) -> Account:
        r = self.client.post(
            f"/api/v1/orgs/{owner.org_id}/users",
            headers=owner.headers,
            json={
                "email": email,
                "name": role.value.title(),
                "password": PASSWORD,
                "memberships": [{"role": role.value, "site_id": site_id}],
            },
        )
        assert r.status_code == 201, r.text
        return self.login(email)

    # ------------------------------------------------------------------ sites and devices

    def create_site(
        self,
        owner: Account,
        name: str = "Main",
        timezone: str = "Asia/Jerusalem",
        currency: str = "ILS",
        avg_check: float = 100.0,
    ) -> str:
        r = self.client.post(
            f"/api/v1/orgs/{owner.org_id}/sites",
            headers=owner.headers,
            json={
                "name": name,
                "timezone": timezone,
                "currency": currency,
                "avg_check_per_guest": avg_check,
            },
        )
        assert r.status_code == 201, r.text
        return str(r.json()["site_id"])

    def pair(self, owner: Account, site_id: str) -> dict[str, str]:
        r = self.client.post(f"/api/v1/sites/{site_id}/devices/pairing-code", headers=owner.headers)
        assert r.status_code == 201, r.text
        r = self.client.post("/api/v1/edge/pair", json={"code": r.json()["code"]})
        assert r.status_code == 201, r.text
        return bearer(r.json()["token"])

    def site_with_config(
        self, owner: Account, name: str = "Main", timezone: str = "Asia/Jerusalem"
    ) -> tuple[str, dict[str, str]]:
        """A site with the sample 8-table config uploaded by a paired device."""
        site_id = self.create_site(owner, name=name, timezone=timezone)
        device = self.pair(owner, site_id)
        config = sample_site_config(site_id=site_id).model_dump(mode="json")
        r = self.client.put("/api/v1/edge/config", headers=device, json=config)
        assert r.status_code == 200, r.text
        return site_id, device

    def post_events(self, device: dict[str, str], *events: dict[str, Any]) -> dict[str, Any]:
        r = self.client.post("/api/v1/edge/events", headers=device, json={"events": list(events)})
        assert r.status_code == 200, r.text
        return dict(r.json())
