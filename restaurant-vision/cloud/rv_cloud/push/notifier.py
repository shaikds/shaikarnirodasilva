"""Notification channels (Strategy). :class:`WebPushNotifier` is the MVP channel; WhatsApp,
SMS or pager adapters implement the same :class:`Notifier` protocol later."""

import json
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

log = logging.getLogger(__name__)


class SendOutcome(StrEnum):
    SENT = "sent"
    GONE = "gone"
    """The subscription no longer exists (HTTP 404/410); the caller deletes it."""
    FAILED = "failed"
    """Transient or unknown failure; the subscription is kept."""


@dataclass(frozen=True, slots=True)
class PushTarget:
    """Where to deliver: a browser push subscription."""

    subscription_id: str
    endpoint: str
    p256dh: str
    auth: str


class Notifier(Protocol):
    def send(self, target: PushTarget, payload: dict[str, Any]) -> SendOutcome:
        """Deliver ``payload`` (JSON-safe, no PII) to ``target``. Must not raise."""
        ...


class NullNotifier:
    """Used when push is not configured: logs and reports ``FAILED`` (subscriptions kept)."""

    def send(self, target: PushTarget, payload: dict[str, Any]) -> SendOutcome:
        log.info("push disabled (no VAPID keys); not sending", extra={"kind": payload.get("kind")})
        return SendOutcome.FAILED


class WebPushNotifier:
    """Web Push (RFC 8030) with VAPID via ``pywebpush``. Blocking; run it off the event loop."""

    def __init__(
        self, private_key: str, subject: str, *, ttl_s: int = 300, timeout_s: float = 10.0
    ) -> None:
        self._private_key = private_key
        self._subject = subject
        self._ttl_s = ttl_s
        self._timeout_s = timeout_s

    def send(self, target: PushTarget, payload: dict[str, Any]) -> SendOutcome:
        from pywebpush import WebPushException, webpush

        try:
            webpush(
                subscription_info={
                    "endpoint": target.endpoint,
                    "keys": {"p256dh": target.p256dh, "auth": target.auth},
                },
                data=json.dumps(payload, separators=(",", ":")),
                vapid_private_key=self._private_key,
                vapid_claims={"sub": self._subject},
                ttl=self._ttl_s,
                timeout=self._timeout_s,
                headers={"Urgency": "high"},
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):
                return SendOutcome.GONE
            log.warning("web push failed", extra={"status": status})
            return SendOutcome.FAILED
        except Exception:  # network errors, bad keys: never break the caller
            log.exception("web push error")
            return SendOutcome.FAILED
        return SendOutcome.SENT
