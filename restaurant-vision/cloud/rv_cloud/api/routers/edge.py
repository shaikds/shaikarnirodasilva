"""``/edge/*``: device pairing, event ingest, config sync and command polling.

Every route except ``/edge/pair`` takes ``Authorization: Bearer <device token>``.
"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Header, Query, Request, Response, status
from rv_contracts import (
    CommandsPage,
    EventBatch,
    EventsAccepted,
    PairRequest,
    PairResponse,
    SiteConfig,
)

from ...services import CommandService, DeviceService, IngestService, SiteService, notify_alerts
from ..deps import DeviceDep, SessionDep, StateDep, client_ip, device_scope

router = APIRouter(prefix="/edge", tags=["edge"])


def etag_for(version: int) -> str:
    return f'"{version}"'


def etag_matches(if_none_match: str | None, etag: str) -> bool:
    if not if_none_match:
        return False
    candidates = [c.strip() for c in if_none_match.split(",")]
    return any(c == "*" or c.removeprefix("W/") == etag for c in candidates)


@router.post("/pair", response_model=PairResponse, status_code=status.HTTP_201_CREATED)
def pair(body: PairRequest, request: Request, state: StateDep, session: SessionDep) -> PairResponse:
    """Exchange a single-use pairing code for a device token (shown once)."""
    return DeviceService(session, state.clock).pair(body, client_ip(request), state.pair_limiter)


@router.post("/events", response_model=EventsAccepted)
def post_events(
    body: EventBatch,
    device: DeviceDep,
    state: StateDep,
    session: SessionDep,
    background: BackgroundTasks,
) -> EventsAccepted:
    """Up to 500 events; idempotent on ``event_id``. Every event must carry the device's
    ``site_id`` (403 otherwise)."""
    result = IngestService(session, state.clock, state.broker).ingest(device, body.events)
    if result.push_payloads:
        background.add_task(
            notify_alerts,
            state.session_factory,
            state.notifier,
            device_scope(device),
            result.push_payloads,
        )
    return EventsAccepted(accepted=result.accepted, duplicates=result.duplicates)


@router.get(
    "/config",
    response_model=SiteConfig,
    responses={304: {"description": "Not modified (If-None-Match matched the ETag)"}},
)
def get_config(
    device: DeviceDep,
    state: StateDep,
    session: SessionDep,
    response: Response,
    if_none_match: Annotated[str | None, Header()] = None,
) -> SiteConfig | Response:
    """The site config. ``ETag: "<config_version>"``; ``If-None-Match`` -> 304."""
    config = SiteService(session, state.clock).config(device_scope(device))
    etag = etag_for(config.config_version)
    if etag_matches(if_none_match, etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    response.headers["ETag"] = etag
    return config


@router.put("/config", response_model=SiteConfig)
def put_config(
    body: SiteConfig, device: DeviceDep, state: StateDep, session: SessionDep, response: Response
) -> SiteConfig:
    """Save ``cameras``, ``tables`` and ``zones`` from the setup wizard. ``timezone``,
    ``locale``, ``thresholds`` and ``modules`` are dashboard-owned and ignored here. Returns
    the stored config (version bumped when something changed)."""
    config = SiteService(session, state.clock).put_from_edge(device_scope(device), body)
    response.headers["ETag"] = etag_for(config.config_version)
    return config


@router.get("/commands", response_model=CommandsPage)
def get_commands(
    device: DeviceDep,
    session: SessionDep,
    after: Annotated[str | None, Query(max_length=32)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> CommandsPage:
    """Commands after ``after`` (opaque cursor; omit on first poll), oldest first."""
    return CommandService(session).poll(device_scope(device), after, limit)
