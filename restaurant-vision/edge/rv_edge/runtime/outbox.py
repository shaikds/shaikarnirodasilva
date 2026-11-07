"""Durable store-and-forward outbox for edge events (SQLite in WAL mode).

Every event is persisted before the cloud sync sends it. Rows stay until the cloud accepted
them (``mark_sent``); sent rows are pruned after 7 days. Appends are idempotent on
``event_id``. A small ``meta`` table keeps sync state such as the commands cursor.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError
from rv_contracts import MAX_EVENTS_PER_BATCH, EdgeEvent, parse_event

from .fsutil import ensure_private_dir

log = logging.getLogger(__name__)

OUTBOX_FILE = "outbox.sqlite3"
SENT_RETENTION_S = 7 * 24 * 3600.0

_SCHEMA = """
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    ts REAL NOT NULL,
    body TEXT NOT NULL,
    created_at REAL NOT NULL,
    sent_at REAL,
    failed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (sent_at, id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


@dataclass(frozen=True, slots=True)
class OutboxItem:
    id: int
    event: EdgeEvent


class Outbox:
    """Thread-safe SQLite outbox. One connection guarded by a lock (writes are tiny)."""

    def __init__(
        self,
        path: Path,
        *,
        wall_clock: Callable[[], float] | None = None,
    ) -> None:
        self._path = Path(path)
        ensure_private_dir(self._path.parent)
        self._now = wall_clock or time.time
        self._lock = threading.Lock()
        self._db = sqlite3.connect(
            str(self._path), check_same_thread=False, isolation_level=None, timeout=30.0
        )
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=FULL")
        self._db.executescript(_SCHEMA)

    @classmethod
    def in_dir(cls, data_dir: Path, *, wall_clock: Callable[[], float] | None = None) -> Outbox:
        """The outbox at ``<data_dir>/outbox.sqlite3``."""
        return cls(Path(data_dir) / OUTBOX_FILE, wall_clock=wall_clock)

    @property
    def path(self) -> Path:
        return self._path

    def append(self, event: EdgeEvent) -> bool:
        """Persist ``event``. False if an event with the same ``event_id`` already exists."""
        body = event.model_dump_json()
        with self._lock:
            cur = self._db.execute(
                "INSERT OR IGNORE INTO outbox (event_id, type, ts, body, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (event.event_id, str(event.type.value), event.ts, body, self._now()),
            )
            return cur.rowcount == 1

    def fetch_batch(self, n: int = MAX_EVENTS_PER_BATCH) -> list[OutboxItem]:
        """Oldest unsent events, at most ``min(n, 500)``. Rows that no longer parse (e.g. after
        a schema change) are marked failed and skipped."""
        n = max(1, min(n, MAX_EVENTS_PER_BATCH))
        with self._lock:
            rows = self._db.execute(
                "SELECT id, body FROM outbox WHERE sent_at IS NULL ORDER BY id LIMIT ?", (n,)
            ).fetchall()
        items: list[OutboxItem] = []
        broken: list[int] = []
        for row_id, body in rows:
            try:
                items.append(OutboxItem(int(row_id), parse_event(body)))
            except ValidationError:
                log.error("outbox row %s no longer parses; marking it failed", row_id)
                broken.append(int(row_id))
        if broken:
            self.mark_failed(broken)
        return items

    def mark_sent(self, ids: Iterable[int]) -> int:
        """Mark rows delivered. Returns the number of rows changed."""
        return self._mark(ids, failed=False)

    def mark_failed(self, ids: Iterable[int]) -> int:
        """Dead-letter rows the cloud permanently rejected (kept for diagnosis, never resent)."""
        return self._mark(ids, failed=True)

    def depth(self) -> int:
        """Events persisted but not yet delivered."""
        with self._lock:
            (count,) = self._db.execute(
                "SELECT COUNT(*) FROM outbox WHERE sent_at IS NULL"
            ).fetchone()
        return int(count)

    def prune(self, older_than_s: float = SENT_RETENTION_S) -> int:
        """Delete delivered (or dead-lettered) rows older than ``older_than_s``."""
        cutoff = self._now() - older_than_s
        with self._lock:
            cur = self._db.execute(
                "DELETE FROM outbox WHERE sent_at IS NOT NULL AND sent_at < ?", (cutoff,)
            )
            return cur.rowcount

    def get_meta(self, key: str) -> str | None:
        with self._lock:
            row = self._db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return None if row is None else str(row[0])

    def set_meta(self, key: str, value: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def close(self) -> None:
        with self._lock:
            self._db.close()

    def _mark(self, ids: Iterable[int], *, failed: bool) -> int:
        id_list = [int(i) for i in ids]
        if not id_list:
            return 0
        now = self._now()
        changed = 0
        with self._lock:
            self._db.execute("BEGIN")
            try:
                for start in range(0, len(id_list), 500):
                    chunk = id_list[start : start + 500]
                    marks = ",".join("?" * len(chunk))
                    cur = self._db.execute(
                        f"UPDATE outbox SET sent_at = ?, failed = ? "
                        f"WHERE sent_at IS NULL AND id IN ({marks})",
                        (now, int(failed), *chunk),
                    )
                    changed += cur.rowcount
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return changed
