"""Organization, sites overview and user management."""

from collections.abc import Sequence

from rv_contracts import (
    Me,
    MembershipInfo,
    OrgInfo,
    OrgUser,
    Plan,
    Role,
    SiteConfig,
    SiteCreate,
    SiteRef,
    SiteSettings,
    SiteSummary,
    UserCreate,
    UserUpdate,
)
from sqlalchemy.orm import Session

from ..clock import Clock
from ..db.models import Organization, Site
from ..errors import Conflict, Forbidden, InvalidInput, NotFound
from ..repositories import (
    AlertRepository,
    AuthRepository,
    DeviceRepository,
    OrgRepository,
    SiteRepository,
    SnapshotRepository,
    UserPushRepository,
    UserRepository,
)
from ..security import PasswordHasher
from ..tenancy import SiteScope
from . import views
from .auth import CurrentUser, build_scope, normalize_email


def require_own_org(user: CurrentUser, org_id: str) -> None:
    """Other organizations do not exist from the caller's point of view."""
    if org_id != user.org_id:
        raise NotFound("Organization not found")


class OrgService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def _org(self, user: CurrentUser) -> Organization:
        org = OrgRepository(self._session, user.org_id).get()
        if org is None:
            raise NotFound("Organization not found")
        return org

    def me(self, user: CurrentUser) -> Me:
        org = self._org(user)
        sites = SiteRepository(self._session, user.scope).list_accessible()
        return Me(
            user=views.user_info(user.user),
            org=OrgInfo(org_id=org.id, name=org.name, plan=Plan(org.plan)),
            memberships=views.memberships(user.user.memberships),
            sites=[SiteRef(site_id=s.id, name=s.name) for s in sites],
        )

    def org_info(self, user: CurrentUser, org_id: str) -> OrgInfo:
        require_own_org(user, org_id)
        org = self._org(user)
        return OrgInfo(org_id=org.id, name=org.name, plan=Plan(org.plan))

    def list_sites(self, user: CurrentUser, org_id: str) -> list[SiteSummary]:
        """Site cards: owners see every site, managers their own; waiters have no overview."""
        require_own_org(user, org_id)
        if not user.scope.has_role(Role.OWNER, Role.MANAGER):
            raise Forbidden("Waiters have no site overview")
        sites = SiteRepository(self._session, user.scope).list_accessible()
        return [
            self._summary(s)
            for s in sites
            if user.scope.role_for(s.id) in (Role.OWNER, Role.MANAGER)
        ]

    def _summary(self, site: Site) -> SiteSummary:
        scope = SiteScope(org_id=site.org_id, site_id=site.id)
        occupancy = SnapshotRepository(self._session, scope).occupancy_latest()
        now = self._clock.now()
        devices = DeviceRepository(self._session, scope).all()
        settings = views.site_settings(site)
        return SiteSummary(
            site_id=site.id,
            org_id=site.org_id,
            name=site.name,
            timezone=site.timezone,
            locale=settings.locale,
            currency=settings.currency,
            guests=occupancy.guests if occupancy is not None else None,
            open_alerts=AlertRepository(self._session, scope).count_open(),
            edge_online=any(views.is_online(d, now) for d in devices),
        )

    def create_site(self, user: CurrentUser, org_id: str, request: SiteCreate) -> SiteSettings:
        require_own_org(user, org_id)
        org = self._org(user)
        timezone = views.validate_timezone(request.timezone)
        repo = SiteRepository(self._session, user.scope)
        site = repo.create(
            name=request.name,
            timezone=timezone,
            locale=request.locale.value,
            currency=request.currency.value,
            avg_check_per_guest=request.avg_check_per_guest,
            config_json={},
            config_version=1,
            now=self._clock.now(),
        )
        config = SiteConfig(
            site_id=site.id,
            timezone=timezone,
            locale=request.locale,
            modules=views.default_modules(org.plan),
            config_version=1,
        )
        views.store_config(site, config)
        self._session.commit()
        return views.site_settings(site)


class UserService:
    """User management (owners only; enforced by the router)."""

    def __init__(self, session: Session, clock: Clock, hasher: PasswordHasher) -> None:
        self._session = session
        self._clock = clock
        self._hasher = hasher

    def list(self, user: CurrentUser, org_id: str) -> list[OrgUser]:
        require_own_org(user, org_id)
        return [views.org_user(u) for u in UserRepository(self._session, org_id).list()]

    def create(self, user: CurrentUser, org_id: str, request: UserCreate) -> OrgUser:
        require_own_org(user, org_id)
        email = normalize_email(request.email)
        if AuthRepository(self._session).email_taken(email):
            raise Conflict("Email already registered")
        self._check_memberships(user, request.memberships)
        created = UserRepository(self._session, org_id).create(
            email=email,
            name=request.name,
            password_hash=self._hasher.hash(request.password),
            locale=request.locale.value,
            memberships=request.memberships,
            now=self._clock.now(),
        )
        self._session.commit()
        return views.org_user(created)

    def update(self, user: CurrentUser, org_id: str, user_id: str, request: UserUpdate) -> OrgUser:
        require_own_org(user, org_id)
        repo = UserRepository(self._session, org_id)
        target = repo.get(user_id)
        if target is None:
            raise NotFound("User not found")
        if request.name is not None:
            target.name = request.name
        if request.locale is not None:
            target.locale = request.locale.value
        if request.password is not None:
            target.password_hash = self._hasher.hash(request.password)
            target.token_version += 1  # sign out everywhere
        if request.memberships is not None:
            self._check_memberships(user, request.memberships)
            keeps_owner = any(m.role is Role.OWNER for m in request.memberships)
            if not keeps_owner and repo.count_owners(exclude_user_id=target.id) == 0:
                raise Conflict("An organization needs at least one owner")
            repo.set_memberships(target, request.memberships)
            # Pushes for sites the user can no longer access must stop now.
            UserPushRepository(self._session, org_id, target.id).delete_inaccessible(
                build_scope(target)
            )
        self._session.commit()
        return views.org_user(target)

    def delete(self, user: CurrentUser, org_id: str, user_id: str) -> None:
        require_own_org(user, org_id)
        repo = UserRepository(self._session, org_id)
        target = repo.get(user_id)
        if target is None:
            raise NotFound("User not found")
        if target.id == user.user_id:
            raise Conflict("You cannot delete yourself")
        if repo.count_owners(exclude_user_id=target.id) == 0:
            raise Conflict("An organization needs at least one owner")
        UserPushRepository(self._session, org_id, target.id).delete_all()
        repo.delete(target)
        self._session.commit()

    def _check_memberships(self, user: CurrentUser, grants: Sequence[MembershipInfo]) -> None:
        if not grants:
            raise InvalidInput("At least one membership is required")
        org_sites = SiteRepository(self._session, user.scope).org_site_ids()
        unknown = sorted({g.site_id for g in grants if g.site_id and g.site_id not in org_sites})
        if unknown:
            raise InvalidInput(f"Unknown site_id(s): {', '.join(unknown)}")
