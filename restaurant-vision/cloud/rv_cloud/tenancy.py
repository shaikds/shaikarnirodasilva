"""Tenancy scopes passed to every repository.

* :class:`OrgScope`: a signed-in user's view of their organization (roles per site).
* :class:`SiteScope`: one site of one organization. Only created by
  :meth:`rv_cloud.repositories.sites.SiteRepository.authorize` (after checking the site belongs
  to the user's org and the user has a role there) or by device authentication (the device's
  own site). Repositories filter every query by it, so cross-tenant access cannot be expressed.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from rv_contracts import Role

ROLE_RANK: Mapping[Role, int] = {Role.WAITER: 0, Role.MANAGER: 1, Role.OWNER: 2}


def best_role(roles: Iterable[Role]) -> Role | None:
    """Highest of ``roles`` (owner > manager > waiter), or None."""
    return max(roles, key=ROLE_RANK.__getitem__, default=None)


@dataclass(frozen=True, slots=True)
class OrgScope:
    """What a user may reach: ``is_owner`` covers every site of ``org_id``; otherwise
    ``site_roles`` maps each granted site to the user's best role there."""

    org_id: str
    user_id: str
    is_owner: bool
    site_roles: Mapping[str, Role] = field(default_factory=dict)

    def role_for(self, site_id: str) -> Role | None:
        """Role on ``site_id`` assuming the site belongs to ``org_id`` (callers verify)."""
        if self.is_owner:
            return Role.OWNER
        return self.site_roles.get(site_id)

    def has_role(self, *roles: Role) -> bool:
        """True if the user holds any of ``roles`` somewhere in the org."""
        held = {Role.OWNER} if self.is_owner else set(self.site_roles.values())
        return bool(held & set(roles))


@dataclass(frozen=True, slots=True)
class SiteScope:
    """One site of one org; the unit every site-data repository is bound to."""

    org_id: str
    site_id: str
