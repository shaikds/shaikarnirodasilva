"""Sites: listing and authorization for a user (:class:`SiteRepository`) and the record of the
site a :class:`SiteScope` is bound to (:class:`ScopedSiteRepository`)."""

from collections.abc import Sequence
from typing import Any

from rv_contracts import Role, new_uuid7
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import Site
from ..errors import Forbidden, NotFound
from ..tenancy import OrgScope, SiteScope


class SiteRepository:
    """Sites of the caller's org, filtered by the caller's roles."""

    def __init__(self, session: Session, scope: OrgScope) -> None:
        self._session = session
        self._scope = scope

    def list_accessible(self) -> Sequence[Site]:
        query = select(Site).where(Site.org_id == self._scope.org_id)
        if not self._scope.is_owner:
            query = query.where(Site.id.in_(list(self._scope.site_roles)))
        return self._session.scalars(query.order_by(Site.created_at, Site.id)).all()

    def accessible_site_ids(self) -> list[str]:
        return [site.id for site in self.list_accessible()]

    def org_site_ids(self) -> set[str]:
        """All site ids of the org (for validating membership grants)."""
        return set(self._session.scalars(select(Site.id).where(Site.org_id == self._scope.org_id)))

    def get(self, site_id: str) -> Site | None:
        return self._session.scalars(
            select(Site).where(Site.id == site_id, Site.org_id == self._scope.org_id)
        ).one_or_none()

    def authorize(self, site_id: str) -> tuple[SiteScope, Role, Site]:
        """The scope and role for ``site_id``. :class:`NotFound` if the site is not in the
        caller's org; :class:`Forbidden` if it is but the caller has no role there."""
        site = self.get(site_id)
        if site is None:
            raise NotFound("Site not found")
        role = self._scope.role_for(site.id)
        if role is None:
            raise Forbidden("No access to this site")
        return SiteScope(org_id=site.org_id, site_id=site.id), role, site

    def create(
        self,
        *,
        name: str,
        timezone: str,
        locale: str,
        currency: str,
        avg_check_per_guest: float,
        config_json: dict[str, Any],
        config_version: int,
        now: float,
        site_id: str | None = None,
    ) -> Site:
        site = Site(
            id=site_id or new_uuid7(),
            org_id=self._scope.org_id,
            name=name,
            timezone=timezone,
            locale=locale,
            currency=currency,
            avg_check_per_guest=avg_check_per_guest,
            config_json=config_json,
            config_version=config_version,
            floor_plan_json=[],
            command_seq=0,
            first_event_ts=None,
            created_at=now,
        )
        self._session.add(site)
        self._session.flush()
        return site


class ScopedSiteRepository:
    """The site row of a :class:`SiteScope`."""

    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def get(self, *, for_update: bool = False) -> Site:
        """The site; ``for_update`` takes a row lock (Postgres) to serialize writers."""
        query = select(Site).where(Site.id == self._scope.site_id, Site.org_id == self._scope.org_id)
        if for_update:
            query = query.with_for_update()
        site = self._session.scalars(query).one_or_none()
        if site is None:
            raise NotFound("Site not found")
        return site
