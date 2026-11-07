"""``/orgs/{org_id}``: org info, sites, users and branch comparison."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from rv_contracts import (
    BranchComparison,
    OrgInfo,
    OrgUser,
    SiteCreate,
    SiteSettings,
    SiteSummary,
    UserCreate,
    UserUpdate,
)

from ...services import MetricsService, OrgService, UserService
from ..deps import CurrentUserDep, OwnerDep, SessionDep, StateDep

router = APIRouter(prefix="/orgs/{org_id}", tags=["orgs"])

FromQuery = Annotated[float | None, Query(alias="from", ge=0)]
ToQuery = Annotated[float | None, Query(alias="to", ge=0)]


@router.get("", response_model=OrgInfo)
def get_org(org_id: str, user: CurrentUserDep, state: StateDep, session: SessionDep) -> OrgInfo:
    return OrgService(session, state.clock).org_info(user, org_id)


@router.get("/sites", response_model=list[SiteSummary])
def list_sites(
    org_id: str, user: CurrentUserDep, state: StateDep, session: SessionDep
) -> list[SiteSummary]:
    """Owners: all sites; managers: their site; waiters: 403."""
    return OrgService(session, state.clock).list_sites(user, org_id)


@router.post("/sites", response_model=SiteSettings, status_code=status.HTTP_201_CREATED)
def create_site(
    org_id: str, body: SiteCreate, user: OwnerDep, state: StateDep, session: SessionDep
) -> SiteSettings:
    return OrgService(session, state.clock).create_site(user, org_id, body)


@router.get("/users", response_model=list[OrgUser])
def list_users(org_id: str, user: OwnerDep, state: StateDep, session: SessionDep) -> list[OrgUser]:
    return UserService(session, state.clock, state.hasher).list(user, org_id)


@router.post("/users", response_model=OrgUser, status_code=status.HTTP_201_CREATED)
def create_user(
    org_id: str, body: UserCreate, user: OwnerDep, state: StateDep, session: SessionDep
) -> OrgUser:
    return UserService(session, state.clock, state.hasher).create(user, org_id, body)


@router.patch("/users/{user_id}", response_model=OrgUser)
def update_user(
    org_id: str,
    user_id: str,
    body: UserUpdate,
    user: OwnerDep,
    state: StateDep,
    session: SessionDep,
) -> OrgUser:
    return UserService(session, state.clock, state.hasher).update(user, org_id, user_id, body)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    org_id: str, user_id: str, user: OwnerDep, state: StateDep, session: SessionDep
) -> Response:
    UserService(session, state.clock, state.hasher).delete(user, org_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/reports/compare", response_model=BranchComparison)
def compare(
    org_id: str,
    user: OwnerDep,
    state: StateDep,
    session: SessionDep,
    from_ts: FromQuery = None,
    to_ts: ToQuery = None,
) -> BranchComparison:
    """One ``MetricsSummary`` per site (owners, Pro plan). Default range: last 24 h."""
    service = MetricsService(session, state.clock, state.settings.business_day_start_hour)
    return service.compare(user, org_id, from_ts, to_ts)
