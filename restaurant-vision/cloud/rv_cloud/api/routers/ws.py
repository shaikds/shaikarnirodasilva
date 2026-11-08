"""``WS /ws?token=<access JWT>&site_id=<site>``: live events of one site.

Each server message is one JSON object: an ``EdgeEvent`` (as ingested, plus a cloud-generated
``alert.acknowledged`` when someone presses "on it" in the cloud) or, right after connecting,
one ``LiveSnapshotMessage`` (``{"type": "live.snapshot", "snapshot": LiveSnapshot}``) for
owners and managers, so a (re)connecting dashboard starts from the full state. Waiters receive
``alert.*`` events only. Client messages are ignored. Authentication happens once at connect;
failures accept and immediately close with a ``WsCloseCode``: 4400 (missing parameters), 4401
(bad/expired token) or 4403 (no access to the site), so browsers can read the code.
"""

import asyncio
import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from rv_contracts import LiveSnapshotMessage, Role, WsCloseCode
from starlette.concurrency import run_in_threadpool

from ...errors import Forbidden, NotFound, Unauthorized
from ...realtime import Subscription
from ...repositories import SiteRepository
from ...services import AuthService, LiveService
from ...state import AppState
from ...tenancy import SiteScope

router = APIRouter(tags=["realtime"])

CLOSE_BAD_REQUEST = int(WsCloseCode.BAD_REQUEST)
CLOSE_UNAUTHORIZED = int(WsCloseCode.UNAUTHORIZED)
CLOSE_FORBIDDEN = int(WsCloseCode.FORBIDDEN)


def _authorize(state: AppState, token: str, site_id: str) -> tuple[Role, SiteScope]:
    with state.session_factory() as session:
        user = AuthService(
            session,
            settings=state.settings,
            clock=state.clock,
            hasher=state.hasher,
            tokens=state.tokens,
        ).authenticate(token)
        scope, role, _site = SiteRepository(session, user.scope).authorize(site_id)
        return role, scope


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


async def _pump(websocket: WebSocket, subscription: Subscription, alerts_only: bool) -> None:
    receiver = asyncio.ensure_future(_wait_disconnect(websocket))
    try:
        while True:
            getter = asyncio.ensure_future(subscription.get())
            done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if receiver in done:
                getter.cancel()
                return
            message = getter.result()
            if alerts_only and not message.event_type.startswith("alert."):
                continue
            await websocket.send_text(message.data)
    except (WebSocketDisconnect, RuntimeError):
        return
    finally:
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
        role, scope = await run_in_threadpool(_authorize, state, token, site_id)
    except Unauthorized:
        await _reject(websocket, CLOSE_UNAUTHORIZED)
        return
    except (Forbidden, NotFound):
        await _reject(websocket, CLOSE_FORBIDDEN)
        return
    # Subscribe before accepting, so nothing published after the handshake is missed.
    async with state.broker.subscribe(site_id) as subscription:
        await websocket.accept()
        alerts_only = role is Role.WAITER
        if not alerts_only:
            try:
                await websocket.send_text(await run_in_threadpool(_snapshot_message, state, scope))
            except (WebSocketDisconnect, RuntimeError):
                return
        await _pump(websocket, subscription, alerts_only=alerts_only)
