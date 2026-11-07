from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

import httpx
import pytest
from rv_contracts import SiteConfig
from rv_contracts.fixtures import sample_events, sample_site_config

from rv_edge.runtime.config_store import ConfigStore
from rv_edge.runtime.outbox import Outbox
from rv_edge.runtime.secrets_store import SecretsStore
from rv_edge.runtime.sync import CURSOR_KEY, CloudSync

from .conftest import SITE_ID, pair_secrets
from .fakes import TOKEN, FakeCloud, ManualClock


class Harness:
    def __init__(self, tmp_path: Path, *, paired: bool = True) -> None:
        self.cloud = FakeCloud()
        self.clock = ManualClock(0.0)
        self.outbox = Outbox(tmp_path / "outbox.sqlite3")
        self.secrets = SecretsStore(tmp_path)
        if paired:
            pair_secrets(self.secrets)
        self.store = ConfigStore(tmp_path)
        self.acks: list[tuple[str, float]] = []
        self.configs: list[tuple[SiteConfig, str | None]] = []
        self.transport: httpx.BaseTransport = httpx.MockTransport(self.cloud.handler)
        self.sync = self.make_sync()

    def make_sync(self) -> CloudSync:
        def on_config(config: SiteConfig, etag: str | None) -> None:
            self.configs.append((config, etag))
            self.store.save_from_cloud(config, etag)

        return CloudSync(
            self.outbox,
            self.secrets,
            self.store,
            on_ack=lambda alert_id, ack_at: self.acks.append((alert_id, ack_at)),
            on_config=on_config,
            transport=self.transport,
            rng=random.Random(0),
            monotonic=self.clock.now,
        )

    def close(self) -> None:
        self.sync.close()
        self.outbox.close()


@pytest.fixture
def h(tmp_path: Path) -> Any:
    harness = Harness(tmp_path)
    yield harness
    harness.close()


def test_sends_batches_and_marks_them_sent(h: Harness) -> None:
    events = sample_events()
    for event in events:
        h.outbox.append(event)
    h.sync.run_once()
    assert h.outbox.depth() == 0
    assert set(h.cloud.stored) == {e.event_id for e in events}
    assert h.sync.online
    post = h.cloud.requests_to("POST", "/api/v1/edge/events")[0]
    assert post.headers["Authorization"] == f"Bearer {TOKEN}"


def test_5xx_backs_off_with_jitter_then_recovers(h: Harness) -> None:
    h.outbox.append(sample_events()[0])
    h.cloud.event_statuses = [503, 503]

    first = h.sync.run_once()
    assert not h.sync.online
    assert 0.5 <= first <= 1.0
    assert h.outbox.depth() == 1

    posts = len(h.cloud.requests_to("POST", "/api/v1/edge/events"))
    assert h.sync.run_once() == pytest.approx(first)  # still backing off: no request
    assert len(h.cloud.requests_to("POST", "/api/v1/edge/events")) == posts

    h.clock.advance(first)
    second = h.sync.run_once()
    assert 1.0 <= second <= 2.0
    assert h.sync.consecutive_failures == 2

    h.clock.advance(second)
    h.sync.run_once()
    assert h.sync.online
    assert h.sync.consecutive_failures == 0
    assert h.outbox.depth() == 0


def test_duplicates_count_as_delivered(h: Harness) -> None:
    events = sample_events()[:3]
    h.cloud.stored = {e.event_id: {} for e in events[:2]}
    for event in events:
        h.outbox.append(event)
    h.sync.run_once()
    assert h.outbox.depth() == 0
    assert h.sync.online


def test_network_error_sets_offline(tmp_path: Path) -> None:
    harness = Harness(tmp_path)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    harness.transport = httpx.MockTransport(down)
    harness.sync = harness.make_sync()
    harness.outbox.append(sample_events()[0])
    delay = harness.sync.run_once()
    assert delay > 0
    assert not harness.sync.online
    assert "ConnectError" in (harness.sync.last_error or "")
    assert harness.outbox.depth() == 1
    harness.close()


def test_unpaired_edge_stays_offline_without_requests(tmp_path: Path) -> None:
    harness = Harness(tmp_path, paired=False)
    harness.outbox.append(sample_events()[0])
    harness.sync.run_once()
    assert not harness.sync.online
    assert harness.cloud.requests == []
    harness.close()


def test_revoked_token_backs_off(h: Harness) -> None:
    h.cloud.status_override = 401
    delay = h.sync.run_once()
    assert delay >= 30.0
    assert "re-pair" in (h.sync.last_error or "")


def test_commands_are_dispatched_and_cursor_persisted(h: Harness) -> None:
    config = sample_site_config()
    h.cloud.config = SiteConfig.model_validate({**config.model_dump(), "config_version": 5})
    h.store.replace(config, etag='"0"')
    h.sync.run_once()  # initial config check fetches version 5
    assert h.configs[-1][0].config_version == 5
    h.cloud.config = SiteConfig.model_validate({**config.model_dump(), "config_version": 6})
    base = {"site_id": SITE_ID, "created_at": 1_793_988_100.0}
    h.cloud.pages = [
        {
            "cursor": "c1",
            "commands": [
                {
                    **base,
                    "kind": "alert_ack",
                    "command_id": "cmd-1",
                    "alert_id": "a-1",
                    "ack_at": 1_793_988_101.0,
                },
                {**base, "kind": "some_future_kind", "command_id": "cmd-2"},
                {
                    **base,
                    "kind": "alert_ack",
                    "command_id": "cmd-3",
                    "alert_id": "a-x",
                    "ack_at": 1.0,
                    "site_id": "other-site",
                },
                {**base, "kind": "config_changed", "command_id": "cmd-4", "config_version": 6},
            ],
        }
    ]
    h.clock.advance(2.0)
    h.sync.run_once()
    assert h.acks == [("a-1", 1_793_988_101.0)]  # unknown kind and foreign site skipped
    assert h.configs[-1][0].config_version == 6
    assert h.outbox.get_meta(CURSOR_KEY) == "c1"

    h.sync.close()
    h.sync = h.make_sync()  # a restarted edge resumes from the stored cursor
    h.sync.run_once()
    last_poll = h.cloud.requests_to("GET", "/api/v1/edge/commands")[-1]
    assert last_poll.url.params["after"] == "c1"


def test_config_fetch_uses_etag(h: Harness) -> None:
    h.cloud.config = SiteConfig.model_validate(
        {**sample_site_config().model_dump(), "config_version": 3}
    )
    h.sync.run_once()
    assert len(h.configs) == 1
    assert h.store.etag == '"3"'

    h.sync.request_config_check()
    h.clock.advance(2.0)
    h.sync.run_once()
    gets = h.cloud.requests_to("GET", "/api/v1/edge/config")
    assert gets[-1].headers["If-None-Match"] == '"3"'
    assert len(h.configs) == 1  # 304: nothing re-applied


def test_local_config_edit_is_pushed(h: Harness) -> None:
    h.store.save_local(sample_site_config())
    h.sync.run_once()
    assert len(h.cloud.config_puts) == 1
    assert "rtsp://" not in json.dumps(h.cloud.config_puts[0])
    assert not h.store.has_pending_push
    assert h.store.config_version == 1
    assert h.configs == []  # the push answer is stored, not re-fetched


def test_malformed_event_is_isolated_and_dead_lettered(h: Harness) -> None:
    events = sample_events()
    for event in events:
        h.outbox.append(event)
    bad = events[4].event_id
    h.cloud.reject_event_ids = {bad}
    for _ in range(20):
        h.sync.run_once()
        if h.outbox.depth() == 0:
            break
    assert h.outbox.depth() == 0
    assert set(h.cloud.stored) == {e.event_id for e in events} - {bad}


def test_events_of_another_site_are_dead_lettered(h: Harness) -> None:
    ours = sample_events()[:2]
    theirs = sample_events(site_id="old-site")[:2]
    for event in (theirs[0], ours[0], theirs[1], ours[1]):
        h.outbox.append(event)
    h.sync.run_once()
    assert h.outbox.depth() == 0
    assert set(h.cloud.stored) == {e.event_id for e in ours}
    assert h.sync.online
