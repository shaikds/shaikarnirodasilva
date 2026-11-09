"""``/push/*``: VAPID key and the caller's push subscriptions."""

from fastapi import APIRouter, Response, status
from rv_contracts import PushSubscriptionIn, PushSubscriptionOut, VapidPublicKey

from ...errors import ServiceUnavailable
from ...services import PushService
from ..deps import CurrentUserDep, SessionDep, StateDep

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKey)
def vapid_public_key(state: StateDep) -> VapidPublicKey:
    """Public; 503 when push is not configured on this deployment."""
    key = state.settings.vapid_public_key
    if not state.settings.push_enabled or not key:
        raise ServiceUnavailable("Web Push is not configured")
    return VapidPublicKey(public_key=key)


@router.post(
    "/subscriptions", response_model=PushSubscriptionOut, status_code=status.HTTP_201_CREATED
)
def subscribe(
    body: PushSubscriptionIn, user: CurrentUserDep, state: StateDep, session: SessionDep
) -> PushSubscriptionOut:
    return PushService(
        session, state.clock, allowed_hosts=state.settings.push_allowed_hosts
    ).subscribe(user, body)


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    subscription_id: str, user: CurrentUserDep, state: StateDep, session: SessionDep
) -> Response:
    PushService(session, state.clock).unsubscribe(user, subscription_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
