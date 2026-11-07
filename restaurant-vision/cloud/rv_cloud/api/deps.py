"""FastAPI dependencies: database session, authentication and authorization.

* :func:`current_user`: valid access JWT (``Authorization: Bearer``) -> :class:`CurrentUser`.
* :func:`require_role`: the user holds one of the roles somewhere in the org (owner checks).
* :func:`require_site_access`: the ``{site_id}`` path parameter is a site of the user's org
  (404 otherwise) on which the user has one of the roles (403 otherwise) -> :class:`SiteAccess`.
* :func:`current_device`: valid device token -> :class:`DevicePrincipal` (edge endpoints).
"""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from rv_contracts import Role
from sqlalchemy.orm import Session

from ..errors import Forbidden, Unauthorized
from ..repositories import DevicePrincipal, SiteRepository
from ..services import AuthService, CurrentUser, DeviceService
from ..state import AppState
from ..tenancy import SiteScope

_bearer = HTTPBearer(auto_error=False, description="User access JWT or edge device token")


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.rv
    return state


StateDep = Annotated[AppState, Depends(get_state)]


def get_session(state: StateDep) -> Iterator[Session]:
    """One session per request; services commit explicitly, anything else is rolled back."""
    with state.session_factory() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
CredentialsDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def auth_service(state: AppState, session: Session) -> AuthService:
    return AuthService(
        session,
        settings=state.settings,
        clock=state.clock,
        hasher=state.hasher,
        tokens=state.tokens,
        login_limiter=state.login_limiter,
    )


def current_user(state: StateDep, session: SessionDep, credentials: CredentialsDep) -> CurrentUser:
    if credentials is None:
        raise Unauthorized("Not authenticated")
    return auth_service(state, session).authenticate(credentials.credentials)


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]


def require_role(*roles: Role) -> Callable[[CurrentUser], CurrentUser]:
    """Dependency factory: 403 unless the user holds one of ``roles`` in the org."""

    def dependency(user: CurrentUserDep) -> CurrentUser:
        if not user.scope.has_role(*roles):
            raise Forbidden("Insufficient role")
        return user

    return dependency


OwnerDep = Annotated[CurrentUser, Depends(require_role(Role.OWNER))]


@dataclass(frozen=True, slots=True)
class SiteAccess:
    user: CurrentUser
    scope: SiteScope
    role: Role


ALL_ROLES = (Role.OWNER, Role.MANAGER, Role.WAITER)
STAFF_ROLES = (Role.OWNER, Role.MANAGER)


def require_site_access(*roles: Role) -> Callable[..., SiteAccess]:
    """Dependency factory for ``/sites/{site_id}/...`` routes (all roles when none given)."""
    allowed = roles or ALL_ROLES

    def dependency(site_id: str, user: CurrentUserDep, session: SessionDep) -> SiteAccess:
        scope, role, _site = SiteRepository(session, user.scope).authorize(site_id)
        if role not in allowed:
            raise Forbidden("Insufficient role for this site")
        return SiteAccess(user=user, scope=scope, role=role)

    return dependency


StaffSiteDep = Annotated[SiteAccess, Depends(require_site_access(*STAFF_ROLES))]
OwnerSiteDep = Annotated[SiteAccess, Depends(require_site_access(Role.OWNER))]
AnySiteDep = Annotated[SiteAccess, Depends(require_site_access())]


def current_device(
    session: SessionDep, state: StateDep, credentials: CredentialsDep
) -> DevicePrincipal:
    if credentials is None:
        raise Unauthorized("Device token required")
    return DeviceService(session, state.clock).authenticate(credentials.credentials)


DeviceDep = Annotated[DevicePrincipal, Depends(current_device)]


def device_scope(device: DevicePrincipal) -> SiteScope:
    return SiteScope(org_id=device.org_id, site_id=device.site_id)


def client_ip(request: Request) -> str:
    """Peer address (run uvicorn with ``--proxy-headers`` behind a reverse proxy)."""
    return request.client.host if request.client else "unknown"
