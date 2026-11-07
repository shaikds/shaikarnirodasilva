"""Web Push subscriptions and alert notifications."""

import logging
from collections.abc import Sequence
from typing import Any

from rv_contracts import PushSubscriptionIn, PushSubscriptionOut
from sqlalchemy.orm import Session, sessionmaker

from ..clock import Clock
from ..errors import NotFound
from ..push import Notifier, PushTarget, SendOutcome
from ..repositories import PushRepository, SiteRepository, UserPushRepository
from ..tenancy import SiteScope
from .auth import CurrentUser

log = logging.getLogger(__name__)


class PushService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def subscribe(self, user: CurrentUser, request: PushSubscriptionIn) -> PushSubscriptionOut:
        """Any role with access to the site may subscribe (re-subscribing updates in place)."""
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
) -> None:
    """Send each payload to every push subscription of the site; delete subscriptions the push
    service reports gone (404/410). Runs after the response (background task), own session."""
    if not payloads:
        return
    with session_factory() as session:
        repo = PushRepository(session, scope)
        subscriptions = repo.list()
        gone: set[str] = set()
        for payload in payloads:
            for sub in subscriptions:
                if sub.id in gone:
                    continue
                target = PushTarget(
                    subscription_id=sub.id,
                    endpoint=sub.endpoint,
                    p256dh=str(sub.keys_json.get("p256dh", "")),
                    auth=str(sub.keys_json.get("auth", "")),
                )
                if notifier.send(target, payload) is SendOutcome.GONE:
                    gone.add(sub.id)
        if gone:
            repo.delete_ids(gone)
            session.commit()
            log.info("removed gone push subscriptions", extra={"count": len(gone)})
