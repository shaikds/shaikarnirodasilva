"""Web Push subscriptions and alert notifications."""

import logging
import time
from collections.abc import Callable, Sequence
from typing import Any

from rv_contracts import PushSubscriptionIn, PushSubscriptionOut
from sqlalchemy.orm import Session, sessionmaker

from ..clock import Clock
from ..config import DEFAULT_PUSH_ALLOWED_HOSTS
from ..errors import InvalidInput, NotFound
from ..push import Notifier, PushTarget, SendOutcome, endpoint_allowed
from ..repositories import PushRepository, SiteRepository, UserPushRepository
from ..tenancy import SiteScope
from .auth import CurrentUser

log = logging.getLogger(__name__)


class PushService:
    def __init__(
        self,
        session: Session,
        clock: Clock,
        *,
        allowed_hosts: Sequence[str] = DEFAULT_PUSH_ALLOWED_HOSTS,
    ) -> None:
        self._session = session
        self._clock = clock
        self._allowed_hosts = tuple(allowed_hosts)

    def subscribe(self, user: CurrentUser, request: PushSubscriptionIn) -> PushSubscriptionOut:
        """Any role with access to the site may subscribe (re-subscribing updates in place).
        The endpoint must be an ``https`` URL of an allowlisted Web Push service (422
        otherwise), so the server never POSTs to arbitrary or internal addresses."""
        if not endpoint_allowed(request.endpoint, self._allowed_hosts):
            raise InvalidInput("endpoint is not a supported Web Push service URL")
        scope, _role, _site = SiteRepository(self._session, user.scope).authorize(request.site_id)
        row = PushRepository(self._session, scope).upsert(
            user_id=user.user_id,
            endpoint=request.endpoint,
            keys=request.keys.model_dump(),
            now=self._clock.now(),
        )
        self._session.commit()
        return PushSubscriptionOut(
            subscription_id=row.id, site_id=row.site_id, endpoint=row.endpoint
        )

    def unsubscribe(self, user: CurrentUser, subscription_id: str) -> None:
        """Users can delete only their own subscriptions."""
        repo = UserPushRepository(self._session, user.org_id, user.user_id)
        row = repo.get(subscription_id)
        if row is None:
            raise NotFound("Subscription not found")
        repo.delete(row)
        self._session.commit()


def notify_alerts(
    session_factory: sessionmaker[Session],
    notifier: Notifier,
    scope: SiteScope,
    payloads: Sequence[dict[str, Any]],
    *,
    allowed_hosts: Sequence[str] = DEFAULT_PUSH_ALLOWED_HOSTS,
    max_sends: int | None = None,
    deadline_s: float | None = None,
    monotonic: Callable[[], float] = time.monotonic,
) -> int:
    """Send each payload to the site's push subscriptions whose user still has access to the
    site, and return the number of sends. Runs on the push dispatcher (own session), never on
    the request path.

    Subscriptions whose user lost access to the site (or was deleted), whose endpoint is not
    (or no longer) allowlisted, or that the push service reports gone (404/410) are deleted.
    At most ``max_sends`` requests are made, and none after ``deadline_s``."""
    if not payloads:
        return 0
    started = monotonic()
    sent = 0
    with session_factory() as session:
        repo = PushRepository(session, scope)
        subscriptions = repo.list()
        with_access = repo.owners_with_access({s.user_id for s in subscriptions})
        stale = {
            s.id
            for s in subscriptions
            if s.user_id not in with_access or not endpoint_allowed(s.endpoint, allowed_hosts)
        }
        live = [s for s in subscriptions if s.id not in stale]
        gone: set[str] = set()
        stopped = False
        for payload in payloads:
            for sub in live:
                if sub.id in gone:
                    continue
                if (max_sends is not None and sent >= max_sends) or (
                    deadline_s is not None and monotonic() - started >= deadline_s
                ):
                    stopped = True
                    break
                target = PushTarget(
                    subscription_id=sub.id,
                    endpoint=sub.endpoint,
                    p256dh=str(sub.keys_json.get("p256dh", "")),
                    auth=str(sub.keys_json.get("auth", "")),
                )
                sent += 1
                if notifier.send(target, payload) is SendOutcome.GONE:
                    gone.add(sub.id)
            if stopped:
                log.warning(
                    "push batch cut short", extra={"site_id": scope.site_id, "sent": sent}
                )
                break
        if gone or stale:
            repo.delete_ids(gone | stale)
            session.commit()
            log.info(
                "removed push subscriptions",
                extra={"gone": len(gone), "no_access_or_endpoint": len(stale)},
            )
    return sent
