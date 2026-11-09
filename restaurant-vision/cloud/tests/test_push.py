"""Web Push: subscriptions, notifications on alert.raised, gone subscriptions, VAPID."""

import threading
import time
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
import pywebpush
from fastapi.testclient import TestClient
from py_vapid import Vapid
from rv_contracts import (
    AlertKind,
    AlertPush,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    ResolveReason,
    Role,
    new_uuid7,
)
from sqlalchemy import select
from support import Account, Api, FakeClock, FakeNotifier, event, make_settings

from rv_cloud.config import DEFAULT_PUSH_ALLOWED_HOSTS, Settings
from rv_cloud.db.base import Base
from rv_cloud.db.models import PushSubscription
from rv_cloud.main import create_app
from rv_cloud.push import (
    NullNotifier,
    PushTarget,
    SendOutcome,
    WebPushNotifier,
    endpoint_allowed,
)
from rv_cloud.tools.gen_vapid import generate_vapid_keys

KEYS = {"p256dh": "BEl62iUYgUivxIkv69yViEuiBIa", "auth": "tBHItJI5svbpez7KI4CCXg"}


def subscribe(api: Api, user: Account, site_id: str, endpoint: str) -> dict[str, Any]:
    r = api.client.post(
        "/api/v1/push/subscriptions",
        headers=user.headers,
        json={"site_id": site_id, "endpoint": endpoint, "keys": KEYS},
    )
    assert r.status_code == 201, r.text
    return dict(r.json())


def raised(
    site: str, ts: float, alert_id: str, table: str = "t6", since: float | None = None
) -> dict[str, object]:
    return event(
        AlertRaised,
        site,
        ts,
        alert_id=alert_id,
        kind=AlertKind.WAITER_NEEDED,
        table_id=table,
        severity=AlertSeverity.WARN,
        condition_since_ts=since,
    )


def test_alert_raised_notifies_site_subscriptions(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    out = subscribe(api, waiter, site, "https://push.example.com/w1")
    assert out["site_id"] == site and out["endpoint"] == "https://push.example.com/w1"
    subscribe(api, owner, site, "https://push.example.com/gone")
    api.notifier.gone_endpoints.add("https://push.example.com/gone")
    t = api.clock.now()
    alert_id = new_uuid7()
    api.post_events(device, raised(site, t, alert_id, since=t - 200))
    sent = api.notifier.sent
    assert {target.endpoint for target, _ in sent} == {
        "https://push.example.com/w1",
        "https://push.example.com/gone",
    }
    payload = sent[0][1]
    assert payload == {
        "alert_id": alert_id,
        "site_id": site,
        "kind": "waiter_needed",
        "severity": "warn",
        "table_label": "6",
        "raised_at": t,
        "condition_since_ts": t - 200,
    }
    assert AlertPush.model_validate(payload).alert_id == alert_id  # the contract shape
    target = next(tg for tg, _ in sent if tg.endpoint.endswith("w1"))
    assert (target.p256dh, target.auth) == (KEYS["p256dh"], KEYS["auth"])
    # The gone subscription was deleted; the next alert reaches only the live one.
    with api.app.state.rv.session_factory() as db:
        endpoints = db.scalars(select(PushSubscription.endpoint)).all()
    assert endpoints == ["https://push.example.com/w1"]
    sent.clear()
    api.post_events(device, raised(site, t + 5, new_uuid7()))
    assert [tg.endpoint for tg, _ in sent] == ["https://push.example.com/w1"]


def test_no_push_for_duplicates_or_alerts_already_resolved(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    subscribe(api, owner, site, "https://push.example.com/o1")
    t = api.clock.now()
    alert_id = new_uuid7()
    first = raised(site, t, alert_id)
    api.post_events(device, first)
    assert len(api.notifier.sent) == 1
    api.post_events(device, first)  # duplicate delivery
    other = new_uuid7()
    api.post_events(  # raised and resolved within one (buffered) batch
        device,
        raised(site, t + 1, other),
        event(
            AlertResolved,
            site,
            t + 2,
            alert_id=other,
            resolved_at=t + 2,
            reason=ResolveReason.STATE_CHANGE,
        ),
    )
    assert len(api.notifier.sent) == 1


def test_subscription_ownership(api: Api, owner: Account) -> None:
    site, _device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    sub = subscribe(api, waiter, site, "https://push.example.com/w1")
    # Re-subscribing the same endpoint updates in place.
    again = subscribe(api, waiter, site, "https://push.example.com/w1")
    assert again["subscription_id"] == sub["subscription_id"]
    path = f"/api/v1/push/subscriptions/{sub['subscription_id']}"
    assert api.client.delete(path, headers=owner.headers).status_code == 404
    assert api.client.delete(path, headers=waiter.headers).status_code == 204
    assert api.client.delete(path, headers=waiter.headers).status_code == 404
    other_site = api.create_site(owner, "Other")
    r = api.client.post(
        "/api/v1/push/subscriptions",
        headers=waiter.headers,
        json={"site_id": other_site, "endpoint": "https://push.example.com/x", "keys": KEYS},
    )
    assert r.status_code == 403
    r = api.client.post(
        "/api/v1/push/subscriptions",
        headers=waiter.headers,
        json={"site_id": site, "endpoint": "http://insecure.example.com/x", "keys": KEYS},
    )
    assert r.status_code == 422


def test_vapid_public_key_endpoint(api: Api) -> None:
    assert api.client.get("/api/v1/push/vapid-public-key").status_code == 503
    private, public = generate_vapid_keys()
    app = create_app(make_settings(vapid_private_key=private, vapid_public_key=public))
    assert isinstance(app.state.rv.notifier, WebPushNotifier)
    Base.metadata.create_all(app.state.rv.engine)
    with TestClient(app) as client:
        r = client.get("/api/v1/push/vapid-public-key")
    assert r.status_code == 200 and r.json() == {"public_key": public}


def test_generated_vapid_keys_work_with_pywebpush() -> None:
    private, public = generate_vapid_keys()
    vapid = Vapid.from_string(private)
    headers = vapid.sign({"sub": "mailto:ops@example.com", "aud": "https://push.example.com"})
    assert headers["Authorization"].startswith("vapid t=")
    assert public in headers["Authorization"]


@pytest.fixture
def fake_webpush(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[dict[str, Any]]]:
    calls: list[dict[str, Any]] = []
    behaviour: dict[str, Any] = {"status": None, "error": None}

    def webpush(**kwargs: Any) -> None:
        calls.append(kwargs)
        if behaviour["error"] is not None:
            raise behaviour["error"]
        if behaviour["status"] is not None:
            raise pywebpush.WebPushException(
                "push failed", response=SimpleNamespace(status_code=behaviour["status"])
            )

    monkeypatch.setattr(pywebpush, "webpush", webpush)
    calls.append({"_behaviour": behaviour})
    yield calls


def test_web_push_notifier_outcomes(fake_webpush: list[dict[str, Any]]) -> None:
    behaviour = fake_webpush.pop(0)["_behaviour"]
    notifier = WebPushNotifier("private-key", "mailto:ops@example.com")
    target = PushTarget("sub-1", "https://push.example.com/1", "p256", "auth")
    payload = {"alert_id": "a1", "kind": "waiter_needed"}
    assert notifier.send(target, payload) is SendOutcome.SENT
    call = fake_webpush[0]
    assert call["subscription_info"] == {
        "endpoint": "https://push.example.com/1",
        "keys": {"p256dh": "p256", "auth": "auth"},
    }
    assert call["data"] == '{"alert_id":"a1","kind":"waiter_needed"}'
    assert call["vapid_claims"] == {"sub": "mailto:ops@example.com"}
    for status, outcome in (
        (410, SendOutcome.GONE),
        (404, SendOutcome.GONE),
        (500, SendOutcome.FAILED),
    ):
        behaviour["status"] = status
        assert notifier.send(target, payload) is outcome
    behaviour["status"] = None
    behaviour["error"] = ConnectionError("network down")
    assert notifier.send(target, payload) is SendOutcome.FAILED
    assert NullNotifier().send(target, payload) is SendOutcome.FAILED


# ------------------------------------------------------------------ access and ownership


def push_count(api: Api) -> int:
    with api.app.state.rv.session_factory() as db:
        return len(db.scalars(select(PushSubscription.id)).all())


def test_no_push_after_the_user_loses_access_to_the_site(api: Api, owner: Account) -> None:
    site_a, device_a = api.site_with_config(owner, name="A")
    site_b = api.create_site(owner, name="B")
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site_a)
    subscribe(api, waiter, site_a, "https://push.example.com/phone-1")
    subscribe(api, owner, site_a, "https://push.example.com/owner")
    r = api.client.patch(
        f"/api/v1/orgs/{owner.org_id}/users/{waiter.user_id}",
        headers=owner.headers,
        json={"memberships": [{"role": "waiter", "site_id": site_b}]},
    )
    assert r.status_code == 200
    assert push_count(api) == 1  # the waiter's subscription for site A is gone
    api.post_events(device_a, raised(site_a, api.clock.now(), new_uuid7()))
    assert [t.endpoint for t, _ in api.notifier.sent] == ["https://push.example.com/owner"]


def test_send_time_check_skips_and_removes_subscriptions_without_access(
    api: Api, owner: Account
) -> None:
    """Even a subscription left over from before the cleanup is never pushed to."""
    site_a, device_a = api.site_with_config(owner, name="A")
    site_b = api.create_site(owner, name="B")
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site_b)
    with api.app.state.rv.session_factory() as db:  # a stale row: waiter has no access to A
        db.add(
            PushSubscription(
                id=new_uuid7(), site_id=site_a, user_id=waiter.user_id,
                endpoint="https://push.example.com/stale", endpoint_hash="x" * 64,
                keys_json=KEYS, created_at=api.clock.now(),
            )
        )
        db.commit()
    api.post_events(device_a, raised(site_a, api.clock.now(), new_uuid7()))
    assert api.notifier.sent == []
    assert push_count(api) == 0


def test_deleting_a_user_deletes_their_subscriptions(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    subscribe(api, waiter, site, "https://push.example.com/w1")
    path = f"/api/v1/orgs/{owner.org_id}/users/{waiter.user_id}"
    r = api.client.delete(path, headers=owner.headers)
    assert r.status_code == 204
    assert push_count(api) == 0
    api.post_events(device, raised(site, api.clock.now(), new_uuid7()))
    assert api.notifier.sent == []


# ------------------------------------------------------------------ SSRF and the request path


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://127.0.0.1:8443/internal/admin",
        "https://localhost/internal",
        "https://10.0.0.5/metadata",
        "https://[::1]/x",
        "https://169.254.169.254/latest/meta-data",
        "https://evil.example.org/collect",
        "https://fcm.googleapis.com.evil.example/x",
        "https://user@fcm.googleapis.com/fcm/send/x",
        "https://fcm.googleapis.com:8443/fcm/send/x",
        "https://push.services.mozilla.com/x",  # the bare domain of a "*." entry
        "http://fcm.googleapis.com/fcm/send/x",
    ],
)
def test_push_endpoint_must_be_an_allowlisted_push_service(endpoint: str) -> None:
    """Default allowlist (no test hosts): loopback, private, metadata, look-alike and plain
    http endpoints are refused with 422."""
    app = create_app(make_settings(push_allowed_hosts=list(DEFAULT_PUSH_ALLOWED_HOSTS)))
    Base.metadata.create_all(app.state.rv.engine)
    with TestClient(app) as client:
        api = Api(client=client, clock=FakeClock(), notifier=FakeNotifier(), app=app)
        owner = api.signup()
        site = api.create_site(owner)
        r = client.post(
            "/api/v1/push/subscriptions",
            headers=owner.headers,
            json={"site_id": site, "endpoint": endpoint, "keys": KEYS},
        )
    assert r.status_code == 422, r.text
    assert endpoint not in r.text


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/abc:def",
        "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
        "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
        "https://web.push.apple.com/QGuQyavXutnMH",
        "https://api.push.apple.com:443/3/device/x",
    ],
)
def test_real_push_services_are_accepted(endpoint: str) -> None:
    assert endpoint_allowed(endpoint, DEFAULT_PUSH_ALLOWED_HOSTS)


def test_allowlist_is_configurable_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RV_PUSH_ALLOWED_HOSTS", "push.internal.example, *.corp.example")
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.push_allowed_hosts == ["push.internal.example", "*.corp.example"]
    assert endpoint_allowed("https://a.corp.example/x", settings.push_allowed_hosts)
    assert not endpoint_allowed("https://fcm.googleapis.com/x", settings.push_allowed_hosts)


class BlockingNotifier:
    """A push service that hangs until released."""

    def __init__(self) -> None:
        self.release = threading.Event()
        self.sent: list[str] = []

    def send(self, target: PushTarget, payload: dict[str, Any]) -> SendOutcome:
        self.release.wait(10.0)
        self.sent.append(target.endpoint)
        return SendOutcome.SENT


def test_slow_push_services_do_not_delay_ingest() -> None:
    clock = FakeClock()
    notifier = BlockingNotifier()
    app = create_app(make_settings(), clock=clock, notifier=notifier)
    Base.metadata.create_all(app.state.rv.engine)
    with TestClient(app) as client:
        api = Api(client=client, clock=clock, notifier=FakeNotifier(), app=app)
        owner = api.signup()
        site, device = api.site_with_config(owner)
        for i in range(5):
            subscribe(api, owner, site, f"https://push.example.com/slow-{i}")
        body = {"events": [raised(site, clock.now(), new_uuid7())]}
        started = time.monotonic()
        r = client.post("/api/v1/edge/events", headers=device, json=body)
        elapsed = time.monotonic() - started
        assert r.status_code == 200 and r.json() == {"accepted": 1, "duplicates": 0}
        assert elapsed < 2.0  # every push is still hanging
        assert notifier.sent == [] and app.state.rv.push.pending == 1
        notifier.release.set()
        assert app.state.rv.push.drain(5.0)
        assert len(notifier.sent) == 5


def test_sends_per_batch_are_capped(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    for i in range(4):
        subscribe(api, owner, site, f"https://push.example.com/p{i}")
    api.app.state.rv.settings.push_max_sends_per_batch = 3
    t = api.clock.now()
    api.post_events(device, raised(site, t, new_uuid7()), raised(site, t, new_uuid7(), table="t2"))
    assert len(api.notifier.sent) == 3
