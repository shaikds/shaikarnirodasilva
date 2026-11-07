"""Alerts of one site (:class:`AlertRepository`) and alert lookup across the sites a user can
access (:class:`OrgAlertRepository`, for ``POST /alerts/{alert_id}/ack``)."""

from collections.abc import Collection, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.models import Alert, Site
from ..tenancy import SiteScope


class AlertRepository:
    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def get(self, alert_id: str) -> Alert | None:
        return self._session.get(Alert, (self._scope.site_id, alert_id))

    def add(self, alert: Alert) -> None:
        alert.site_id = self._scope.site_id
        self._session.add(alert)

    def list(
        self,
        *,
        open_only: bool,
        from_ts: float | None = None,
        to_ts: float | None = None,
        kind: str | None = None,
        limit: int = 1000,
    ) -> Sequence[Alert]:
        """Alerts ordered oldest first; ``open_only`` = unresolved (open or acknowledged)."""
        query = select(Alert).where(Alert.site_id == self._scope.site_id)
        if open_only:
            query = query.where(Alert.resolved_at.is_(None))
        if from_ts is not None:
            query = query.where(Alert.raised_at >= from_ts)
        if to_ts is not None:
            query = query.where(Alert.raised_at < to_ts)
        if kind is not None:
            query = query.where(Alert.kind == kind)
        return self._session.scalars(
            query.order_by(Alert.raised_at, Alert.alert_id).limit(limit)
        ).all()

    def count_open(self) -> int:
        return int(
            self._session.scalar(
                select(func.count())
                .select_from(Alert)
                .where(Alert.site_id == self._scope.site_id, Alert.resolved_at.is_(None))
            )
            or 0
        )


class OrgAlertRepository:
    """Finds an alert by id among the sites a user may access (all within one org)."""

    def __init__(self, session: Session, org_id: str, site_ids: Collection[str]) -> None:
        self._session = session
        self._org_id = org_id
        self._site_ids = list(site_ids)

    def find(self, alert_id: str) -> Alert | None:
        if not self._site_ids:
            return None
        return self._session.scalars(
            select(Alert)
            .join(Site, Site.id == Alert.site_id)
            .where(
                Alert.alert_id == alert_id,
                Site.org_id == self._org_id,
                Alert.site_id.in_(self._site_ids),
            )
            .order_by(Alert.raised_at.desc())
            .limit(1)
        ).one_or_none()
