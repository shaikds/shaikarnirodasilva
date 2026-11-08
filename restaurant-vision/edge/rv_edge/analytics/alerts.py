"""Alert lifecycle on the edge (architecture 6.2 ``AlertManager``): the source of truth.

Raise -> (acknowledge) -> resolve, all while offline if need be:

* ``raise_alert`` de-duplicates: while an alert of the same kind for the same target (table or
  queue zone) is open, raising again returns the open one and emits nothing. Rules decide *when*
  a condition deserves a new alert (once per condition episode); the manager guarantees that
  there is never more than one open alert per kind and target.
* ``apply_ack`` is idempotent: the first ack of an open alert emits ``alert.acknowledged``
  (``ts = ack_at``); repeated acks, acks of resolved or unknown alerts emit nothing. Acks carry
  only the time and the channel (``cloud`` or ``local``), never who pressed the button.
* An ack does not resolve: the alert stays open (status ``acknowledged``) until the matching
  staff visit or state change resolves it.
* With the ``alerts`` module disabled nothing is raised (``raise_alert`` returns None).
* ``condition_since`` is when the underlying condition began (e.g. guests seated for
  ``waiter_needed``), backdated by the caller; it travels in ``alert.raised`` and the views as
  ``condition_since_ts`` so staff apps can show "waiting 3:20" since seating.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from rv_contracts import (
    AckVia,
    AlertAcknowledged,
    AlertKind,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    AlertStatus,
    AlertView,
    EdgeEvent,
    ResolveReason,
    make_event,
    new_uuid7,
)

SEVERITY: Mapping[AlertKind, AlertSeverity] = {
    AlertKind.WAITER_NEEDED: AlertSeverity.URGENT,
    AlertKind.CHECKIN_NEEDED: AlertSeverity.WARN,
    AlertKind.BUSSING_NEEDED: AlertSeverity.INFO,
    AlertKind.LONG_QUEUE: AlertSeverity.WARN,
}
"""Severity of each alert kind."""


@dataclass(slots=True)
class AlertRecord:
    """One open alert."""

    alert_id: str
    kind: AlertKind
    severity: AlertSeverity
    table_id: str | None
    zone_id: str | None
    raised_at: float
    acked_at: float | None = None
    ack_via: AckVia | None = None
    condition_since: float | None = None
    """When the condition began (``<= raised_at``); None if unknown."""

    @property
    def status(self) -> AlertStatus:
        return AlertStatus.OPEN if self.acked_at is None else AlertStatus.ACKNOWLEDGED


class AlertManager:
    """Owns every open alert of the site (see module docstring)."""

    def __init__(self, site_id: str, *, enabled: bool = True) -> None:
        self.site_id = site_id
        self.enabled = enabled
        self._open: dict[str, AlertRecord] = {}

    def configure(self, site_id: str, *, enabled: bool) -> None:
        """Update the site id and whether alerts may be raised. Does not resolve anything:
        callers resolve alerts that became moot (see ``resolve_all``)."""
        self.site_id = site_id
        self.enabled = enabled

    def raise_alert(
        self,
        kind: AlertKind,
        ts: float,
        *,
        table_id: str | None = None,
        zone_id: str | None = None,
        condition_since: float | None = None,
    ) -> tuple[AlertRecord | None, list[EdgeEvent]]:
        """Raise an alert at ``ts``. Returns ``(record, events)``: the new or already open
        record (None when alerts are disabled) and the ``alert.raised`` event if new.
        ``condition_since`` is clamped to ``ts``."""
        if not self.enabled:
            return None, []
        for record in self._open.values():
            if record.kind is kind and record.table_id == table_id and record.zone_id == zone_id:
                return record, []
        record = AlertRecord(
            alert_id=new_uuid7(),
            kind=kind,
            severity=SEVERITY[kind],
            table_id=table_id,
            zone_id=zone_id,
            raised_at=ts,
            condition_since=None if condition_since is None else min(condition_since, ts),
        )
        self._open[record.alert_id] = record
        event = make_event(
            AlertRaised,
            self.site_id,
            ts,
            alert_id=record.alert_id,
            kind=kind,
            table_id=table_id,
            zone_id=zone_id,
            severity=record.severity,
            condition_since_ts=record.condition_since,
        )
        return record, [event]

    def resolve(self, alert_id: str, ts: float, reason: ResolveReason) -> list[EdgeEvent]:
        """Resolve an open alert; no-op (no event) if it is unknown or already resolved."""
        record = self._open.pop(alert_id, None)
        if record is None:
            return []
        return [
            make_event(
                AlertResolved,
                self.site_id,
                ts,
                alert_id=alert_id,
                resolved_at=ts,
                reason=reason,
            )
        ]

    def resolve_where(
        self,
        ts: float,
        reason: ResolveReason,
        *,
        table_id: str | None = None,
        zone_id: str | None = None,
    ) -> list[EdgeEvent]:
        """Resolve every open alert of ``table_id`` (or of queue zone ``zone_id``)."""
        ids = [
            r.alert_id
            for r in self._open.values()
            if (table_id is not None and r.table_id == table_id)
            or (zone_id is not None and r.table_id is None and r.zone_id == zone_id)
        ]
        events: list[EdgeEvent] = []
        for alert_id in ids:
            events += self.resolve(alert_id, ts, reason)
        return events

    def resolve_all(self, ts: float, reason: ResolveReason) -> list[EdgeEvent]:
        """Resolve every open alert (e.g. the alerts module was switched off)."""
        events: list[EdgeEvent] = []
        for alert_id in list(self._open):
            events += self.resolve(alert_id, ts, reason)
        return events

    def apply_ack(self, alert_id: str, ack_at: float, via: AckVia) -> list[EdgeEvent]:
        """Acknowledge an open alert once (idempotent, see module docstring)."""
        record = self._open.get(alert_id)
        if record is None or record.acked_at is not None:
            return []
        record.acked_at = ack_at
        record.ack_via = via
        return [
            make_event(
                AlertAcknowledged, self.site_id, ack_at, alert_id=alert_id, ack_at=ack_at, via=via
            )
        ]

    def get(self, alert_id: str) -> AlertRecord | None:
        """An open alert by id."""
        return self._open.get(alert_id)

    def is_open(self, alert_id: str) -> bool:
        return alert_id in self._open

    def open_alerts(self) -> list[AlertRecord]:
        """Open alerts, oldest first."""
        return sorted(self._open.values(), key=lambda r: (r.raised_at, r.alert_id))

    def open_ids_for_table(self, table_id: str) -> list[str]:
        """Ids of the open alerts of ``table_id``, oldest first."""
        return [r.alert_id for r in self.open_alerts() if r.table_id == table_id]

    def views(self, table_labels: Mapping[str, str]) -> list[AlertView]:
        """Open alerts as ``AlertView`` (oldest first), with table labels filled in."""
        return [
            AlertView(
                alert_id=r.alert_id,
                site_id=self.site_id,
                kind=r.kind,
                severity=r.severity,
                status=r.status,
                table_id=r.table_id,
                table_label=table_labels.get(r.table_id) if r.table_id is not None else None,
                zone_id=r.zone_id,
                raised_at=r.raised_at,
                acked_at=r.acked_at,
                ack_via=r.ack_via,
                resolved_at=None,
                resolve_reason=None,
                condition_since_ts=r.condition_since,
            )
            for r in self.open_alerts()
        ]

    def snapshot(self) -> dict[str, Any]:
        """JSON-safe summary of the open alerts."""
        return {
            "enabled": self.enabled,
            "open": [
                {
                    "alert_id": r.alert_id,
                    "kind": r.kind.value,
                    "table_id": r.table_id,
                    "zone_id": r.zone_id,
                    "raised_at": r.raised_at,
                    "condition_since": r.condition_since,
                    "status": r.status.value,
                }
                for r in self.open_alerts()
            ],
        }
