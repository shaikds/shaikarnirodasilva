"""Signup, login, token refresh and access-token authentication."""

from dataclasses import dataclass

from rv_contracts import (
    LoginRequest,
    MembershipInfo,
    RefreshRequest,
    Role,
    SignupRequest,
    TokenPair,
)
from sqlalchemy.orm import Session

from ..clock import Clock
from ..config import Settings
from ..db.models import User
from ..errors import Conflict, Unauthorized
from ..repositories import AuthRepository, OrgRepository, UserRepository
from ..security import PasswordHasher, RateLimiter, TokenService
from ..tenancy import OrgScope, best_role


@dataclass(frozen=True, slots=True)
class CurrentUser:
    """The authenticated user and their tenancy scope (loaded fresh on every request, so role
    changes and deletions take effect immediately)."""

    user: User
    scope: OrgScope

    @property
    def user_id(self) -> str:
        return self.user.id

    @property
    def org_id(self) -> str:
        return self.scope.org_id


def build_scope(user: User) -> OrgScope:
    roles_by_site: dict[str, list[Role]] = {}
    is_owner = False
    for m in user.memberships:
        role = Role(m.role)
        if role is Role.OWNER:
            is_owner = True
        elif m.site_id is not None:
            roles_by_site.setdefault(m.site_id, []).append(role)
    site_roles = {site_id: r for site_id, roles in roles_by_site.items() if (r := best_role(roles))}
    return OrgScope(org_id=user.org_id, user_id=user.id, is_owner=is_owner, site_roles=site_roles)


def normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthService:
    def __init__(
        self,
        session: Session,
        *,
        settings: Settings,
        clock: Clock,
        hasher: PasswordHasher,
        tokens: TokenService,
        login_limiter: RateLimiter | None = None,
    ) -> None:
        self._session = session
        self._settings = settings
        self._clock = clock
        self._hasher = hasher
        self._tokens = tokens
        self._login_limiter = login_limiter
        self._auth = AuthRepository(session)

    def signup(self, request: SignupRequest) -> TokenPair:
        """Create an organization and its owner, and sign the owner in."""
        email = normalize_email(request.email)
        if self._auth.email_taken(email):
            raise Conflict("Email already registered")
        now = self._clock.now()
        org = OrgRepository.create(
            self._session, request.org_name, self._settings.signup_plan.value, now
        )
        user = UserRepository(self._session, org.id).create(
            email=email,
            name=request.name,
            password_hash=self._hasher.hash(request.password),
            locale=request.locale.value,
            memberships=[MembershipInfo(role=Role.OWNER)],
            now=now,
        )
        self._session.commit()
        return self._tokens.issue_pair(user.id, org.id, user.token_version)

    def login(self, request: LoginRequest, client_ip: str) -> TokenPair:
        """Verify credentials. Failed attempts are rate limited per (client IP, email)."""
        email = normalize_email(request.email)
        key = f"{client_ip}|{email}"
        if self._login_limiter is not None:
            self._login_limiter.check(key)
        user = self._auth.user_by_email(email)
        if not self._hasher.verify(user.password_hash if user else None, request.password):
            if self._login_limiter is not None:
                self._login_limiter.hit(key)
            raise Unauthorized("Invalid email or password")
        assert user is not None
        if self._login_limiter is not None:
            self._login_limiter.reset(key)
        return self._tokens.issue_pair(user.id, user.org_id, user.token_version)

    def refresh(self, request: RefreshRequest) -> TokenPair:
        claims = self._tokens.decode(request.refresh_token, "refresh")
        user = self._load(claims.user_id, claims.org_id, claims.token_version)
        return self._tokens.issue_pair(user.id, user.org_id, user.token_version)

    def authenticate(self, access_token: str) -> CurrentUser:
        claims = self._tokens.decode(access_token, "access")
        user = self._load(claims.user_id, claims.org_id, claims.token_version)
        return CurrentUser(user=user, scope=build_scope(user))

    def _load(self, user_id: str, org_id: str, token_version: int) -> User:
        user = self._auth.user_for_token(user_id, org_id)
        if user is None or user.token_version != token_version:
            raise Unauthorized("Token revoked")
        return user


__all__ = ["AuthService", "CurrentUser", "build_scope", "normalize_email"]
