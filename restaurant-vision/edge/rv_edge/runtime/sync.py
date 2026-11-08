"""Cloud sync: drains the outbox to the cloud and applies cloud commands (architecture 6.3).

One background thread runs :meth:`CloudSync.run_once` in a loop:

1. push a pending local config edit (``PUT /api/v1/edge/config``);
2. send the oldest outbox batch (<= 500) to ``POST /api/v1/edge/events`` and mark it sent
   (``duplicates`` count as delivered: the cloud is idempotent on ``event_id``);
3. every ``poll_interval_s`` poll ``GET /api/v1/edge/commands?after=<cursor>``, route
   ``alert_ack`` to the analytics thread and turn ``config_changed`` into a config check;
4. on a config check, ``GET /api/v1/edge/config`` with ``If-None-Match`` and apply it.

Network errors, timeouts, 408/429 and 5xx back off exponentially with jitter and clear the
``online`` flag; 401/403 means the device token was revoked (re-pair). A batch the cloud
rejects as malformed (400/413/422) is halved until the offending event is isolated, which is
then dead-lettered so one bad row cannot block the outbox forever.
"""

from __future__ import annotations

import logging
import random
import threading
import time
from collections.abc import Callable
from typing import Any

import httpx
from pydantic import ValidationError
from rv_contracts import (
    MAX_EVENTS_PER_BATCH,
    AlertAckCommand,
    ConfigChangedCommand,
    EdgeCommand,
    EdgeCommandAdapter,
    EventBatch,
    EventsAccepted,
    SiteConfig,
)

from . import EDGE_VERSION
from .config_store import ConfigStore
from .outbox import Outbox
from .secrets_store import SecretsStore

log = logging.getLogger(__name__)

EVENTS_PATH = "/api/v1/edge/events"
COMMANDS_PATH = "/api/v1/edge/commands"
CONFIG_PATH = "/api/v1/edge/config"
CURSOR_KEY = "commands_cursor"
_JSON = {"Content-Type": "application/json"}
_RETRYABLE_STATUS = frozenset({408, 425, 429})
_MALFORMED_STATUS = frozenset({400, 413, 422})

AckHandler = Callable[[str, float], None]
"""``(alert_id, ack_at)`` for a cloud acknowledgement."""
ConfigHandler = Callable[[SiteConfig, str | None], None]
"""``(config, etag)`` for a config fetched from the cloud."""


class _Retryable(Exception):
    """Transient failure: back off and retry."""


class _AuthRejected(Exception):
    """The cloud rejected the device token."""


class CloudSync:
    """See module docstring. ``run_once`` is public so tests can drive it without a thread."""

    def __init__(
        self,
        outbox: Outbox,
        secrets: SecretsStore,
        config_store: ConfigStore,
        *,
        cloud_url: str | None = None,
        on_ack: AckHandler | None = None,
        on_config: ConfigHandler | None = None,
        transport: httpx.BaseTransport | None = None,
        poll_interval_s: float = 2.0,
        timeout_s: float = 10.0,
        backoff_base_s: float = 1.0,
        backoff_max_s: float = 300.0,
        auth_backoff_min_s: float = 30.0,
        prune_interval_s: float = 3600.0,
        rng: random.Random | None = None,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._outbox = outbox
        self._secrets = secrets
        self._config_store = config_store
        self._fallback_url = cloud_url.rstrip("/") if cloud_url else None
        self._on_ack = on_ack
        self._on_config = on_config
        self._transport = transport
        self._poll_interval = poll_interval_s
        self._timeout = httpx.Timeout(timeout_s, connect=min(5.0, timeout_s))
        self._backoff_base = backoff_base_s
        self._backoff_max = backoff_max_s
        self._auth_backoff_min = auth_backoff_min_s
        self._prune_interval = prune_interval_s
        self._rng = rng or random.Random()
        self._mono = monotonic

        self._client: httpx.Client | None = None
        self._client_base: str | None = None
        self._lock = threading.Lock()
        self._online = False
        self._last_error: str | None = None
        self._last_success_at: float | None = None
        self._failures = 0
        self._retry_at = 0.0
        self._next_poll = 0.0
        self._next_prune = 0.0
        self._batch_limit = MAX_EVENTS_PER_BATCH
        self._config_check_due = True
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None

    # status ------------------------------------------------------------------------------
    @property
    def online(self) -> bool:
        """True when the last cloud exchange succeeded."""
        with self._lock:
            return self._online

    @property
    def last_error(self) -> str | None:
        with self._lock:
            return self._last_error

    @property
    def last_success_at(self) -> float | None:
        with self._lock:
            return self._last_success_at

    @property
    def consecutive_failures(self) -> int:
        with self._lock:
            return self._failures

    # control -----------------------------------------------------------------------------
    def start(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="rv-cloud-sync", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout)
            self._thread = None
        self.close()

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            self._client_base = None

    def notify(self) -> None:
        """Wake the sync thread (new events, a local config edit, a new pairing)."""
        self._wake.set()

    def request_config_check(self) -> None:
        self._config_check_due = True
        self._wake.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                delay = self.run_once()
            except Exception:  # never let the sync thread die
                log.exception("cloud sync iteration failed")
                delay = self._poll_interval
            self._wake.wait(timeout=max(0.0, delay))
            self._wake.clear()

    # one iteration -----------------------------------------------------------------------
    def run_once(self) -> float:
        """One sync iteration. Returns the number of seconds to wait before the next one."""
        target = self._target()
        if target is None:
            self._set_offline("not paired")
            return self._poll_interval
        now = self._mono()
        if now < self._retry_at:
            return self._retry_at - now
        base_url, token = target
        client = self._client_for(base_url)
        auth = {"Authorization": f"Bearer {token}"}
        try:
            self._maybe_prune(now)
            self._push_config(client, auth)
            more = self._send_events(client, auth)
            if now >= self._next_poll:
                self._next_poll = now + self._poll_interval
                self._poll_commands(client, auth)
            if self._config_check_due:
                self._fetch_config(client, auth)
        except _AuthRejected as exc:
            return self._failed(str(exc), minimum=self._auth_backoff_min)
        except (httpx.TransportError, _Retryable) as exc:
            return self._failed(f"{type(exc).__name__}: {exc}")
        self._succeeded()
        if more:
            return 0.0
        return max(0.0, self._next_poll - self._mono())

    # steps -------------------------------------------------------------------------------
    def _send_events(self, client: httpx.Client, auth: dict[str, str]) -> bool:
        """Send one batch. True if more events are waiting."""
        limit = self._batch_limit
        items = self._outbox.fetch_batch(limit)
        if not items:
            return False
        # The cloud rejects a whole batch with 422 when any event carries another site's id
        # (e.g. queued before a re-pair to a different site); dead-letter those events here so
        # they cannot block the outbox.
        site_id = self._secrets.site_id
        foreign = [item.id for item in items if item.event.site_id != site_id]
        if foreign:
            self._outbox.mark_failed(foreign)
            log.warning("dead-lettered %d queued events of another site", len(foreign))
            items = [item for item in items if item.event.site_id == site_id]
            if not items:
                return True
        batch = EventBatch(events=[item.event for item in items])
        resp = client.post(EVENTS_PATH, content=batch.model_dump_json(), headers={**auth, **_JSON})
        self._raise_for_transient(resp)
        ids = [item.id for item in items]
        if resp.status_code in _MALFORMED_STATUS:
            self._handle_rejected_batch(ids, resp)
            return True
        if not resp.is_success:
            raise _Retryable(f"events: HTTP {resp.status_code}")
        try:
            result = EventsAccepted.model_validate_json(resp.content)
        except ValidationError as exc:
            raise _Retryable("events: unexpected response body") from exc
        if result.accepted + result.duplicates != len(items):
            log.warning(
                "cloud acknowledged %d+%d events for a batch of %d",
                result.accepted,
                result.duplicates,
                len(items),
            )
        self._outbox.mark_sent(ids)
        self._batch_limit = min(MAX_EVENTS_PER_BATCH, limit * 2)
        if result.duplicates:
            log.debug("cloud already had %d of %d events", result.duplicates, len(items))
        return len(items) >= limit

    def _handle_rejected_batch(self, ids: list[int], resp: httpx.Response) -> None:
        if len(ids) > 1:
            self._batch_limit = max(1, len(ids) // 2)
            log.warning(
                "cloud rejected a batch of %d events (HTTP %d); retrying in smaller batches",
                len(ids),
                resp.status_code,
            )
            return
        self._outbox.mark_failed(ids)
        self._batch_limit = MAX_EVENTS_PER_BATCH
        log.error(
            "cloud permanently rejected outbox row %s (HTTP %d): %s; dead-lettered",
            ids[0],
            resp.status_code,
            resp.text[:500],
        )

    def _poll_commands(self, client: httpx.Client, auth: dict[str, str]) -> None:
        cursor = self._outbox.get_meta(CURSOR_KEY)
        params = {"after": cursor} if cursor else None
        resp = client.get(COMMANDS_PATH, params=params, headers=auth)
        self._raise_for_transient(resp)
        if resp.status_code != 200:
            raise _Retryable(f"commands: HTTP {resp.status_code}")
        try:
            page: Any = resp.json()
            raw_commands = page.get("commands", [])
            new_cursor = page.get("cursor")
        except (ValueError, AttributeError) as exc:
            raise _Retryable("commands: unexpected response body") from exc
        for raw in raw_commands if isinstance(raw_commands, list) else []:
            try:
                command = EdgeCommandAdapter.validate_python(raw)
            except ValidationError:
                log.warning("skipping a cloud command this edge does not understand: %.200r", raw)
                continue
            self._dispatch(command)
        if isinstance(new_cursor, str) and new_cursor and new_cursor != cursor:
            self._outbox.set_meta(CURSOR_KEY, new_cursor)

    def _dispatch(self, command: EdgeCommand) -> None:
        site_id = self._secrets.site_id
        if site_id is not None and command.site_id != site_id:
            log.warning("ignoring command %s for site %s", command.command_id, command.site_id)
            return
        try:
            if isinstance(command, AlertAckCommand) and self._on_ack is not None:
                self._on_ack(command.alert_id, command.ack_at)
            elif (
                isinstance(command, ConfigChangedCommand)
                and command.config_version != self._config_store.config_version
            ):
                self._config_check_due = True
        except Exception:
            log.exception("handling cloud command %s failed", command.command_id)

    def _fetch_config(self, client: httpx.Client, auth: dict[str, str]) -> None:
        if self._config_store.has_pending_push:
            return  # push the local edit first
        headers = dict(auth)
        etag = self._config_store.etag
        if etag and self._config_store.current is not None:
            headers["If-None-Match"] = etag
        resp = client.get(CONFIG_PATH, headers=headers)
        self._raise_for_transient(resp)
        if resp.status_code in (304, 404):  # unchanged / nothing saved in the cloud yet
            self._config_check_due = False
            return
        if resp.status_code != 200:
            raise _Retryable(f"config: HTTP {resp.status_code}")
        try:
            config = SiteConfig.model_validate_json(resp.content)
        except ValidationError:
            log.error("cloud sent a site config this edge cannot parse; keeping the current one")
            self._config_check_due = False
            return
        new_etag = resp.headers.get("ETag") or f'"{config.config_version}"'
        if self._on_config is not None:
            self._on_config(config, new_etag)
        else:
            self._config_store.save_from_cloud(config, new_etag)
        self._config_check_due = False

    def _push_config(self, client: httpx.Client, auth: dict[str, str]) -> None:
        pending = self._config_store.pending_push()
        if pending is None:
            return
        resp = client.put(
            CONFIG_PATH, content=pending.config.model_dump_json(), headers={**auth, **_JSON}
        )
        self._raise_for_transient(resp)
        if resp.is_success:
            returned: SiteConfig | None = None
            if resp.content:
                try:
                    returned = SiteConfig.model_validate_json(resp.content)
                except ValidationError:
                    returned = None
            etag = resp.headers.get("ETag") or (
                f'"{returned.config_version}"' if returned is not None else None
            )
            self._config_store.mark_pushed(pending.revision, returned, etag)
            log.info("pushed local site config to the cloud")
            return
        if resp.status_code >= 500 or resp.status_code == 404:
            raise _Retryable(f"config push: HTTP {resp.status_code}")
        log.error(
            "cloud rejected the local site config (HTTP %d): %s; reverting to the cloud copy",
            resp.status_code,
            resp.text[:500],
        )
        self._config_store.mark_pushed(pending.revision, None, None)
        self._config_check_due = True

    def _maybe_prune(self, now: float) -> None:
        if now >= self._next_prune:
            self._next_prune = now + self._prune_interval
            removed = self._outbox.prune()
            if removed:
                log.info("pruned %d delivered outbox rows", removed)

    # helpers -----------------------------------------------------------------------------
    def _target(self) -> tuple[str, str] | None:
        token = self._secrets.device_token()
        base = self._secrets.cloud_url or self._fallback_url
        if not token or not base or not self._secrets.paired:
            return None
        return base.rstrip("/"), token

    def _client_for(self, base_url: str) -> httpx.Client:
        if self._client is None or self._client_base != base_url:
            self.close()
            self._client = httpx.Client(
                base_url=base_url,
                transport=self._transport,
                timeout=self._timeout,
                headers={"User-Agent": f"rv-edge/{EDGE_VERSION}"},
            )
            self._client_base = base_url
        return self._client

    @staticmethod
    def _raise_for_transient(resp: httpx.Response) -> None:
        if resp.status_code in (401, 403):
            raise _AuthRejected(
                f"device token rejected (HTTP {resp.status_code}); re-pair this edge"
            )
        if resp.status_code in _RETRYABLE_STATUS or resp.status_code >= 500:
            raise _Retryable(f"HTTP {resp.status_code} from {resp.request.url.path}")

    def _failed(self, reason: str, minimum: float = 0.0) -> float:
        with self._lock:
            self._failures += 1
            failures = self._failures
            was_online = self._online
            self._online = False
            self._last_error = reason
        delay = min(self._backoff_max, self._backoff_base * 2.0 ** min(failures - 1, 30))
        delay = max(minimum, delay / 2 + self._rng.uniform(0, delay / 2))
        self._retry_at = self._mono() + delay
        if was_online or failures == 1:
            log.warning("cloud sync failed (%s); retrying in %.1fs", reason, delay)
        return delay

    def _succeeded(self) -> None:
        with self._lock:
            was_online = self._online
            self._online = True
            self._failures = 0
            self._last_error = None
            self._last_success_at = time.time()
        self._retry_at = 0.0
        if not was_online:
            log.info("cloud sync online")

    def _set_offline(self, reason: str) -> None:
        with self._lock:
            self._online = False
            self._last_error = reason
