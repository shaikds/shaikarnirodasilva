"""``WS /ws?token=<access JWT>&site_id=<site>``: live events of one site.

Each server message is one JSON object: an ``EdgeEvent`` (as ingested, plus a cloud-generated
``alert.acknowledged`` when someone presses "on it" in the cloud) or, right after connecting,
one ``LiveSnapshotMessage`` (``{"type": "live.snapshot", "snapshot": LiveSnapshot}``) for
owners and managers, so a (re)connecting dashboard starts from the full state. Waiters receive
``alert.*`` events only. Client messages are ignored. Failures accept and close with a
``WsCloseCode``, so browsers can read the code: 4400 (missing parameters), 4401 (bad, expired
or revoked token) or 4403 (no access to the site).

Authorization is not a one-off: before every outgoing message the token's expiry is checked
(no I/O), and at least every ``RV_WS_REVALIDATE_INTERVAL_S`` (default 30 s; cached in between,
so there is no database hit per message) the user is re-loaded: it must still exist with the
same token version (deleting a user or changing its password revokes) and still have a role on
the site. An idle socket wakes up for this check too. On failure the socket is closed with
4401 (expired/revoked) or 4403 (site access removed).
"""

import asyncio
import contextlib
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from rv_contracts import LiveSnapshotMessage, Role, WsCloseCode
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ...errors import Forbidden, NotFound, Unauthorized
from ...realtime import BrokerMessage, Subscription
from ...repositories import SiteRepository
from ...security import TokenClaims
from ...services import AuthService, LiveService
from ...state import AppState
from ...tenancy import SiteScope

router = APIRouter(tags=["realtime"])

CLOSE_BAD_REQUEST = int(WsCloseCode.BAD_REQUEST)
CLOSE_UNAUTHORIZED = int(WsCloseCode.UNAUTHORIZED)
CLOSE_FORBIDDEN = int(WsCloseCode.FORBIDDEN)
MIN_WAKE_S = 0.05


@dataclass(frozen=True, slots=True)
class _Grant:
    """What the socket was authorized with."""

    claims: TokenClaims
    site_id: str
    scope: SiteScope
    role: Role


def _auth_service(state: AppState, session: Session) -> AuthService:
    return AuthService(
        session,
        settings=state.settings,
        clock=state.clock,
        hasher=state.hasher,
        tokens=state.tokens,
    )


def _site_role(state: AppState, claims: TokenClaims, site_id: str) -> tuple[SiteScope, Role]:
    """Load the user of ``claims`` fresh and authorize ``site_id`` (one short session)."""
    with state.session_factory() as session:
        user = _auth_service(state, session).authenticate_claims(claims)
        scope, role, _site = SiteRepository(session, user.scope).authorize(site_id)
        return scope, role


def _authorize(state: AppState, token: str, site_id: str) -> _Grant:
    claims = state.tokens.decode(token, "access")
    scope, role = _site_role(state, claims, site_id)
    return _Grant(claims=claims, site_id=site_id, scope=scope, role=role)


class _Revalidator:
    """Decides whether the socket may keep streaming (see the module docstring). Expiry is
    checked on every call; the database check is cached for ``interval`` (app clock)."""

    def __init__(self, state: AppState, grant: _Grant) -> None:
        self._state = state
        self._grant = grant
        self._interval = state.settings.ws_revalidate_interval_s
        self._next_check = state.clock.now() + self._interval
        self.alerts_only = grant.role is Role.WAITER

    def wake_after(self) -> float:
        """Seconds until an idle socket must re-check (the interval, or the token expiry)."""
        left = self._grant.claims.expires_at - self._state.clock.now()
        return max(MIN_WAKE_S, min(self._interval, left))

    async def close_code(self) -> int | None:
        """None while the socket may stream, else the close code."""
        now = self._state.clock.now()
        if now >= self._grant.claims.expires_at:
            return CLOSE_UNAUTHORIZED
        if now < self._next_check:
            return None
        try:
            _scope, role = await run_in_threadpool(
                _site_role, self._state, self._grant.claims, self._grant.site_id
            )
        except Unauthorized:
            return CLOSE_UNAUTHORIZED
        except (Forbidden, NotFound):
            return CLOSE_FORBIDDEN
        self.alerts_only = role is Role.WAITER  # e.g. demoted from manager to waiter
        self._next_check = now + self._interval
        return None


def _snapshot_message(state: AppState, scope: SiteScope) -> str:
    with state.session_factory() as session:
        snapshot = LiveService(session, state.clock).snapshot(scope)
    return LiveSnapshotMessage(snapshot=snapshot).model_dump_json()


async def _reject(websocket: WebSocket, code: int) -> None:
    await websocket.accept()
    await websocket.close(code=code)


async def _wait_disconnect(websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return


async def _pump(websocket: WebSocket, subscription: Subscription, guard: _Revalidator) -> None:
    receiver = asyncio.ensure_future(_wait_disconnect(websocket))
    getter: asyncio.Future[BrokerMessage] | None = None
    try:
        while True:
            if getter is None:
                getter = asyncio.ensure_future(subscription.get())
            done, _ = await asyncio.wait(
                {getter, receiver},
                timeout=guard.wake_after(),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if receiver in done:
                return
            code = await guard.close_code()  # before every message, and when idle
            if code is not None:
                with contextlib.suppress(Exception):
                    await websocket.close(code=code)
                return
            if not getter.done():
                continue
            message = getter.result()
            getter = None
            if guard.alerts_only and not message.event_type.startswith("alert."):
                continue
            await websocket.send_text(message.data)
    except (WebSocketDisconnect, RuntimeError):
        return
    finally:
        if getter is not None:
            getter.cancel()
        receiver.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await receiver


@router.websocket("/ws")
async def live_socket(websocket: WebSocket) -> None:
    state: AppState = websocket.app.state.rv
    token = websocket.query_params.get("token")
    site_id = websocket.query_params.get("site_id")
    if not token or not site_id:
        await _reject(websocket, CLOSE_BAD_REQUEST)
        return
    try:
        grant = await run_in_threadpool(_authorize, state, token, site_id)
    except Unauthorized:
        await _reject(websocket, CLOSE_UNAUTHORIZED)
        return
    except (Forbidden, NotFound):
        await _reject(websocket, CLOSE_FORBIDDEN)
        return
    # Subscribe before accepting, so nothing published after the handshake is missed.
    async with state.broker.subscribe(site_id) as subscription:
        await websocket.accept()
        guard = _Revalidator(state, grant)
        if not guard.alerts_only:
            try:
                await websocket.send_text(
                    await run_in_threadpool(_snapshot_message, state, grant.scope)
                )
            except (WebSocketDisconnect, RuntimeError):
                return
        await _pump(websocket, subscription, guard)
