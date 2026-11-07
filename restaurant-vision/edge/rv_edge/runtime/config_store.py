"""Persists the current ``SiteConfig``, its cloud ETag and whether a local edit still has to
be pushed to the cloud (``<data_dir>/site_config.json``)."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import NamedTuple

from rv_contracts import SiteConfig

from .fsutil import ensure_private_dir, read_json, write_private_json

CONFIG_FILE = "site_config.json"


class PendingPush(NamedTuple):
    config: SiteConfig
    revision: int
    """Local revision when the push was taken; see :meth:`ConfigStore.mark_pushed`."""


class ConfigStore:
    """Thread-safe store of the edge's current site config.

    Local edits (``save_local``) set a durable ``pending_push`` flag that the cloud sync clears
    after a successful ``PUT /edge/config``. While an edit is pending, configs fetched from the
    cloud are not applied, so a local edit is never lost to a stale cloud copy.
    """

    def __init__(self, data_dir: Path) -> None:
        self._path = ensure_private_dir(Path(data_dir)) / CONFIG_FILE
        self._lock = threading.Lock()
        self._revision = 0
        raw = read_json(self._path) or {}
        config = raw.get("config")
        self._config: SiteConfig | None = (
            SiteConfig.model_validate(config) if config is not None else None
        )
        self._etag: str | None = raw.get("etag")
        self._pending: bool = bool(raw.get("pending_push", False))

    @property
    def current(self) -> SiteConfig | None:
        with self._lock:
            return self._config

    @property
    def etag(self) -> str | None:
        with self._lock:
            return self._etag

    @property
    def config_version(self) -> int:
        with self._lock:
            return self._config.config_version if self._config else 0

    @property
    def has_pending_push(self) -> bool:
        with self._lock:
            return self._pending

    def save_local(self, config: SiteConfig) -> None:
        """Save an edit made on the edge (edge-ui); it will be pushed to the cloud."""
        with self._lock:
            self._revision += 1
            self._write(config, self._etag, pending=True)

    def replace(self, config: SiteConfig, *, etag: str | None = None) -> None:
        """Save a config without scheduling a push (e.g. a local-only simulation)."""
        with self._lock:
            self._revision += 1
            self._write(config, etag, pending=False)

    def save_from_cloud(self, config: SiteConfig, etag: str | None) -> bool:
        """Save a config fetched from the cloud. Refused (False) while a local edit is pending."""
        with self._lock:
            if self._pending:
                return False
            self._revision += 1
            self._write(config, etag, pending=False)
            return True

    def pending_push(self) -> PendingPush | None:
        with self._lock:
            if not self._pending or self._config is None:
                return None
            return PendingPush(self._config, self._revision)

    def mark_pushed(self, revision: int, config: SiteConfig | None, etag: str | None) -> bool:
        """Clear the pending flag after a push of ``revision``. ``config``/``etag`` are the cloud's
        answer (it bumps ``config_version``). No-op (False) if the config was edited meanwhile."""
        with self._lock:
            if revision != self._revision or self._config is None:
                return False
            self._write(config or self._config, etag, pending=False)
            return True

    def _write(self, config: SiteConfig, etag: str | None, *, pending: bool) -> None:
        write_private_json(
            self._path,
            {"config": config.model_dump(mode="json"), "etag": etag, "pending_push": pending},
        )
        self._config, self._etag, self._pending = config, etag, pending
