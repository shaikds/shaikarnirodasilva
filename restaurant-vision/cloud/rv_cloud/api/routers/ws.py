"""``WS /ws?token=<access JWT>&site_id=<site>``: live events of one site.

Each server message is one ``EdgeEvent`` JSON object (as ingested, plus a cloud-generated
``alert.acknowledged`` when someone presses "on it" in the cloud). Waiters receive ``alert.*``
events only. Client messages are ignored. Authentication happens once at connect; failures
accept and immediately close with 4400 (missing parameters), 4401 (bad/expired token) or
4403 (no access to the site), so browsers can read the code.
"""

import asyncio
import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from rv_contracts import Role
from starlette.concurrency import run_in_threadpool

from ...errors import Forbidden, NotFound, Unauthorized
from ...realtime import Subscription
from ...repositories import SiteRepository
from ...services import AuthService
from ...state import AppState

router = APIRouter(tags=["realtime"])

CLOSE_BAD_REQUEST = 4400
CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403


def _authorize(state: AppState, token: str, site_id: str) -> Role:
    with state.session_factory() as session:
        user = AuthService(
            session,
            settings=state.settings,
            clock=state.clock,
            hasher=state.hasher,
            tokens=state.tokens,
        ).authenticate(token)
        _scope, role, _site = SiteRepository(session, user.scope).authorize(site_id)
        return role


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
        role = await run_in_threadpool(_authorize, state, token, site_id)
    except Unauthorized:
        await _reject(websocket, CLOSE_UNAUTHORIZED)
        return
    except (Forbidden, NotFound):
        await _reject(websocket, CLOSE_FORBIDDEN)
        return
    # Subscribe before accepting, so nothing published after the handshake is missed.
    async with state.broker.subscribe(site_id) as subscription:
        await websocket.accept()
        await _pump(websocket, subscription, alerts_only=role is Role.WAITER)
