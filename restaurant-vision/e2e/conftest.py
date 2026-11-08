"""Harness for the backend end-to-end test: the real cloud app and the real edge runtime,
connected in-process and driven by one manual simulator clock (see README.md)."""

from __future__ import annotations

import json
import threading
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from rv_contracts import EdgeEvent

with warnings.catch_warnings():
    # starlette prefers httpx2 for its TestClient; httpx works the same here.
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient as TestClient

from rv_cloud.config import Settings
from rv_cloud.push import PushTarget, SendOutcome

ROOT = Path(__file__).resolve().parents[1]
SMOKE = ROOT / "simulator" / "scenarios" / "smoke.yaml"
CLOUD_URL = "http://testserver"
API = "/api/v1"
PASSWORD = "e2e-password-123"


def cloud_settings(tmp_path: Path) -> Settings:
    """A file SQLite database migrated by the app itself (exercises the Alembic chain)."""
    return Settings(
        _env_file=None,
        environment="test",
        database_url=f"sqlite:///{tmp_path / 'cloud.sqlite3'}",
        auto_migrate=True,
        access_token_ttl_s=6 * 3600,
        argon2_time_cost=1,
        argon2_memory_cost_kib=8,
        argon2_parallelism=1,
        retention_interval_s=0,
        log_json=False,
        log_level="WARNING",
    )


class CloudTransport(httpx.BaseTransport):
    """httpx transport that hands the edge's requests (pairing, sync) to the cloud app's
    ``TestClient``, on the calling thread.

    Fault injection: ``offline`` refuses every request (internet down);
    ``lose_next_events_response`` delivers the next ``POST /edge/events`` to the cloud and then
    raises a read timeout, so the edge retries a batch the cloud already stored. Every events
    request body and response is recorded."""

    def __init__(self, client: TestClient) -> None:
        self.client = client
        self.offline = False
        self.lose_next_events_response = False
        self.event_batches: list[dict[str, Any]] = []
        self.event_responses: list[dict[str, Any]] = []
        self.lost_responses = 0
        self.refused = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if self.offline:
            self.refused += 1
            raise httpx.ConnectError("cloud unreachable (simulated outage)", request=request)
        body = request.read()
        headers = {
            k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")
        }
        path = request.url.raw_path.decode("ascii")
        resp = self.client.request(request.method, path, headers=headers, content=body)
        is_events = request.method == "POST" and request.url.path == f"{API}/edge/events"
        if is_events:
            self.event_batches.append(json.loads(body))
            if resp.status_code == 200:
                self.event_responses.append(resp.json())
            if self.lose_next_events_response:
                self.lose_next_events_response = False
                self.lost_responses += 1
                raise httpx.ReadTimeout("response lost (simulated)", request=request)
        return httpx.Response(
            resp.status_code, headers=resp.headers, content=resp.content, request=request
        )


@dataclass
class RecordingNotifier:
    """Web Push channel that records what would be sent."""

    sent: list[tuple[PushTarget, dict[str, Any]]] = field(default_factory=list)

    def send(self, target: PushTarget, payload: dict[str, Any]) -> SendOutcome:
        self.sent.append((target, payload))
        return SendOutcome.SENT


class RecordingSink:
    """Edge ``EventSink`` that keeps every published event (the edge's view of the truth)."""

    def __init__(self) -> None:
        self.events: list[EdgeEvent] = []
        self._lock = threading.Lock()

    def publish(self, event: EdgeEvent) -> None:
        with self._lock:
            self.events.append(event)

    def of_type(self, event_type: str) -> list[Any]:
        with self._lock:
            return [e for e in self.events if e.type.value == event_type]


@dataclass(frozen=True)
class User:
    headers: dict[str, str]
    user_id: str
    org_id: str


class CloudApi:
    """Thin driver for the cloud REST API (what the dashboard and waiter app call)."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def _check(self, resp: httpx.Response, status: int) -> Any:
        assert resp.status_code == status, f"{resp.request.method} {resp.request.url}: {resp.text}"
        return resp.json() if resp.content else None

    def get(self, user: User, path: str, **params: Any) -> Any:
        return self._check(self.client.get(API + path, headers=user.headers, params=params), 200)

    def post(self, user: User, path: str, body: Any = None, status: int = 200) -> Any:
        resp = self.client.post(API + path, headers=user.headers, json=body)
        return self._check(resp, status)

    def login(self, email: str) -> User:
        tokens = self._check(
            self.client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}), 200
        )
        return self._user(tokens)

    def signup(self, email: str, org: str) -> User:
        body = {"org_name": org, "name": "Owner", "email": email, "password": PASSWORD}
        return self._user(self._check(self.client.post(f"{API}/auth/signup", json=body), 201))

    def _user(self, tokens: dict[str, Any]) -> User:
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        me = self._check(self.client.get(f"{API}/me", headers=headers), 200)
        return User(headers=headers, user_id=me["user"]["user_id"], org_id=me["org"]["org_id"])


@pytest.fixture
def notifier() -> RecordingNotifier:
    return RecordingNotifier()
