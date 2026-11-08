"""Data retention: delete cloud data older than the configured horizons (all tenants).

Two horizons (``Settings``):

* ``RV_RETENTION_RAW_EVENTS_DAYS`` (default 90): raw edge events (``events``, by event ``ts``)
  and processed edge commands (``commands``, by ``created_at``). Expired pairing codes go too.
* ``RV_RETENTION_METRICS_DAYS`` (default 400): the derived read models behind metrics and
  reports: ``metric_snapshots`` and ``queue_events`` (by ``ts``), ``alerts`` (by
  ``raised_at``) and ``table_sessions`` (by ``left_at``, or ``seated_at`` if never closed).

The latest-state rows (table state, occupancy, queue, device health) are one row per entity and
are kept. Everything here is anonymous already; retention limits how long it is kept, as stated
in ``docs/compliance``. Deleting is idempotent, so running it from several workers (the app's
periodic task) or from cron (``python -m rv_cloud.tools.retention``) is safe.

Note: the ROI response-time baseline (first 7 days after install) is computed from alerts, so
it disappears once those alerts are older than the metrics horizon.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import ColumnElement, and_, delete, func, or_, select
from sqlalchemy.orm import Session

from ..db.models import (
    Alert,
    Command,
    Event,
    MetricSnapshot,
    PairingCode,
    QueueEvent,
    TableSession,
)

log = logging.getLogger(__name__)

DAY_S = 86400.0


@dataclass(frozen=True, slots=True)
class RetentionResult:
    raw_cutoff: float
    """Rows older than this (epoch seconds) were in scope for the raw-events horizon."""
    metrics_cutoff: float
    deleted: dict[str, int] = field(default_factory=dict)
    """Rows deleted (or, for a dry run, that would be deleted) per table."""
    dry_run: bool = False

    @property
    def total(self) -> int:
        return sum(self.deleted.values())


def _targets(
    now: float, raw_cutoff: float, metrics_cutoff: float
) -> list[tuple[str, Any, Callable[[], ColumnElement[bool]]]]:
    return [
        ("events", Event, lambda: Event.ts < raw_cutoff),
        ("commands", Command, lambda: Command.created_at < raw_cutoff),
        ("pairing_codes", PairingCode, lambda: PairingCode.expires_at < now),
        ("metric_snapshots", MetricSnapshot, lambda: MetricSnapshot.ts < metrics_cutoff),
        ("queue_events", QueueEvent, lambda: QueueEvent.ts < metrics_cutoff),
        ("alerts", Alert, lambda: Alert.raised_at < metrics_cutoff),
        (
            "table_sessions",
            TableSession,
            lambda: or_(
                TableSession.left_at < metrics_cutoff,
                and_(TableSession.left_at.is_(None), TableSession.seated_at < metrics_cutoff),
            ),
        ),
    ]


def apply_retention(
    session: Session,
    *,
    now: float,
    raw_events_days: float,
    metrics_days: float,
    dry_run: bool = False,
) -> RetentionResult:
    """Delete (or with ``dry_run`` only count) rows past their horizon. The caller commits."""
    if raw_events_days <= 0 or metrics_days <= 0:
        raise ValueError("retention periods must be positive")
    raw_cutoff = now - raw_events_days * DAY_S
    metrics_cutoff = now - metrics_days * DAY_S
    deleted: dict[str, int] = {}
    for name, model, condition in _targets(now, raw_cutoff, metrics_cutoff):
        if dry_run:
            count = session.scalar(select(func.count()).select_from(model).where(condition()))
            deleted[name] = int(count or 0)
        else:
            result = session.execute(
                delete(model).where(condition()).execution_options(synchronize_session=False)
            )
            deleted[name] = int(getattr(result, "rowcount", 0) or 0)
    return RetentionResult(
        raw_cutoff=raw_cutoff, metrics_cutoff=metrics_cutoff, deleted=deleted, dry_run=dry_run
    )


__all__ = ["RetentionResult", "apply_retention"]
