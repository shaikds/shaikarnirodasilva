"""Site settings and site configuration (dashboard edits and edge setup-wizard uploads).

Ownership of ``SiteConfig`` parts:

* the **edge** (setup wizard, ``PUT /edge/config``) owns ``cameras``, ``tables`` and ``zones``;
* the **dashboard** (``PATCH /sites/{id}``) owns ``timezone``, ``locale``, ``thresholds`` and
  ``modules``.

Every saved change bumps ``config_version`` (the ETag) and appends a ``config_changed`` command
so edges re-fetch ``GET /edge/config``. It also prunes the live projections (current table
states, latest queue rows) of tables and queue zones that are no longer in the config.
"""

from typing import Any

from rv_contracts import (
    CommandKind,
    Role,
    SiteConfig,
    SiteSettings,
    SiteSettingsPatch,
)
from sqlalchemy.orm import Session

from ..clock import Clock
from ..db.models import Site
from ..errors import Forbidden, InvalidInput
from ..repositories import (
    CommandRepository,
    OrgRepository,
    QueueRepository,
    ScopedSiteRepository,
    TableRepository,
)
from ..tenancy import SiteScope
from . import views

OWNER_ONLY_FIELDS = frozenset(
    {"name", "timezone", "locale", "currency", "avg_check_per_guest", "modules"}
)
"""Managers may change thresholds and the floor plan only."""

EDGE_FIELDS = ("cameras", "tables", "zones")


class SiteService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def settings(self, scope: SiteScope) -> SiteSettings:
        return views.site_settings(ScopedSiteRepository(self._session, scope).get())

    def config(self, scope: SiteScope) -> SiteConfig:
        return views.load_config(ScopedSiteRepository(self._session, scope).get())

    def patch(self, scope: SiteScope, role: Role, patch: SiteSettingsPatch) -> SiteSettings:
        changes = {name: value for name, value in patch if value is not None}
        if role is not Role.OWNER and OWNER_ONLY_FIELDS & changes.keys():
            raise Forbidden(
                "Only owners can change " + ", ".join(sorted(OWNER_ONLY_FIELDS & changes.keys()))
            )
        site = ScopedSiteRepository(self._session, scope).get(for_update=True)
        config = views.load_config(site)
        config_changes: dict[str, Any] = {}

        if patch.name is not None:
            site.name = patch.name
        if patch.timezone is not None:
            site.timezone = views.validate_timezone(patch.timezone)
            config_changes["timezone"] = site.timezone
        if patch.locale is not None:
            site.locale = patch.locale.value
            config_changes["locale"] = patch.locale.value
        if patch.currency is not None:
            site.currency = patch.currency.value
        if patch.avg_check_per_guest is not None:
            site.avg_check_per_guest = patch.avg_check_per_guest
        if patch.thresholds is not None:
            config_changes["thresholds"] = patch.thresholds.model_dump(mode="json")
        if patch.modules is not None:
            org = OrgRepository(self._session, scope.org_id).get()
            views.check_plan_modules(org.plan if org else "", patch.modules)
            config_changes["modules"] = patch.modules.model_dump(mode="json")
        if patch.floor_plan is not None:
            table_ids = {t.table_id for t in config.tables}
            seen: set[str] = set()
            for item in patch.floor_plan:
                if item.table_id not in table_ids:
                    raise InvalidInput(f"floor_plan: unknown table_id {item.table_id!r}")
                if item.table_id in seen:
                    raise InvalidInput(f"floor_plan: duplicate table_id {item.table_id!r}")
                seen.add(item.table_id)
            site.floor_plan_json = [item.model_dump(mode="json") for item in patch.floor_plan]

        self._save_config(scope, site, config, config_changes)
        self._session.commit()
        return views.site_settings(site)

    def put_from_edge(self, scope: SiteScope, incoming: SiteConfig) -> SiteConfig:
        """Save cameras, tables and zones from the edge setup wizard. Other fields of the body
        are ignored (the cloud's values win); the stored config is returned."""
        if incoming.site_id != scope.site_id:
            raise InvalidInput("site_id does not match the device's site")
        site = ScopedSiteRepository(self._session, scope).get(for_update=True)
        config = views.load_config(site)
        changes = {
            name: [item.model_dump(mode="json") for item in getattr(incoming, name)]
            for name in EDGE_FIELDS
        }
        saved = self._save_config(scope, site, config, changes)
        if saved is not None:
            items = views.floor_plan(site)
            site.floor_plan_json = [
                i.model_dump(mode="json") for i in views.reconcile_floor_plan(items, saved.tables)
            ]
        self._session.commit()
        return views.load_config(site)

    def _save_config(
        self, scope: SiteScope, site: Site, current: SiteConfig, changes: dict[str, Any]
    ) -> SiteConfig | None:
        """Apply ``changes``; if anything differs, bump the version, store, and notify edges."""
        if not changes:
            return None
        base = current.model_dump(mode="json")
        merged = {**base, **changes}
        if merged == base:
            return None
        merged["config_version"] = site.config_version + 1
        try:
            new_config = SiteConfig.model_validate(merged)
        except ValueError as exc:
            raise InvalidInput(str(exc)) from exc
        views.store_config(site, new_config)
        TableRepository(self._session, scope).prune_states({t.table_id for t in new_config.tables})
        QueueRepository(self._session, scope).prune_latest(views.queue_zone_ids(new_config))
        now = self._clock.now()
        CommandRepository(self._session, scope).append(
            CommandKind.CONFIG_CHANGED.value, {"config_version": new_config.config_version}, now
        )
        return new_config
