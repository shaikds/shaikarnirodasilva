"""Web Push subscriptions: per site (:class:`PushRepository`) and per owning user
(:class:`UserPushRepository`)."""

import hashlib
from collections.abc import Collection, Sequence

from rv_contracts import new_uuid7
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db.models import PushSubscription, Site
from ..tenancy import SiteScope


def endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


class PushRepository:
    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def list(self) -> Sequence[PushSubscription]:
        return self._session.scalars(
            select(PushSubscription)
            .where(PushSubscription.site_id == self._scope.site_id)
            .order_by(PushSubscription.created_at)
        ).all()

    def upsert(
        self, *, user_id: str, endpoint: str, keys: dict[str, str], now: float
    ) -> PushSubscription:
        """Create, or re-bind an existing browser endpoint to this site and user."""
        digest = endpoint_hash(endpoint)
        row = self._session.scalars(
            select(PushSubscription).where(PushSubscription.endpoint_hash == digest)
        ).one_or_none()
        if row is None:
            row = PushSubscription(id=new_uuid7(), endpoint_hash=digest, created_at=now)
            self._session.add(row)
        row.site_id = self._scope.site_id
        row.user_id = user_id
        row.endpoint = endpoint
        row.keys_json = dict(keys)
        self._session.flush()
        return row

    def delete_ids(self, ids: Collection[str]) -> int:
        if not ids:
            return 0
        result = self._session.execute(
            delete(PushSubscription).where(
                PushSubscription.site_id == self._scope.site_id,
                PushSubscription.id.in_(list(ids)),
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)


class UserPushRepository:
    """Subscriptions owned by one user of one org."""

    def __init__(self, session: Session, org_id: str, user_id: str) -> None:
        self._session = session
        self._org_id = org_id
        self._user_id = user_id

    def get(self, subscription_id: str) -> PushSubscription | None:
        return self._session.scalars(
            select(PushSubscription)
            .join(Site, Site.id == PushSubscription.site_id)
            .where(
                PushSubscription.id == subscription_id,
                PushSubscription.user_id == self._user_id,
                Site.org_id == self._org_id,
            )
        ).one_or_none()

    def delete(self, subscription: PushSubscription) -> None:
        self._session.delete(subscription)
        self._session.flush()
