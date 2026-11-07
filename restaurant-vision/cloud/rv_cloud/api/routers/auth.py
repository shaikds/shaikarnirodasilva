"""``/auth/*`` and ``/me``."""

from fastapi import APIRouter, Request, status
from rv_contracts import LoginRequest, Me, RefreshRequest, SignupRequest, TokenPair

from ...services import OrgService
from ..deps import CurrentUserDep, SessionDep, StateDep, auth_service, client_ip

router = APIRouter(tags=["auth"])


@router.post("/auth/signup", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, state: StateDep, session: SessionDep) -> TokenPair:
    """Create an organization and its owner; returns tokens for the owner."""
    return auth_service(state, session).signup(body)


@router.post("/auth/login", response_model=TokenPair)
def login(body: LoginRequest, request: Request, state: StateDep, session: SessionDep) -> TokenPair:
    """Email + password. Repeated failures per (IP, email) answer 429 with ``Retry-After``."""
    return auth_service(state, session).login(body, client_ip(request))


@router.post("/auth/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, state: StateDep, session: SessionDep) -> TokenPair:
    """Exchange a refresh token for a new pair."""
    return auth_service(state, session).refresh(body)


@router.get("/me", response_model=Me)
def me(user: CurrentUserDep, state: StateDep, session: SessionDep) -> Me:
    return OrgService(session, state.clock).me(user)
