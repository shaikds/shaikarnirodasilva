"""``POST /alerts/{alert_id}/ack``."""

from fastapi import APIRouter
from rv_contracts import AlertView

from ...services import AlertService
from ..deps import CurrentUserDep, SessionDep, StateDep

router = APIRouter(tags=["alerts"])


@router.post("/alerts/{alert_id}/ack", response_model=AlertView)
def ack_alert(
    alert_id: str, user: CurrentUserDep, state: StateDep, session: SessionDep
) -> AlertView:
    """ "On it" (any role with access to the alert's site). Stores time and ``ack_via=cloud``,
    never who pressed; queues an ``alert_ack`` command for the edge. Idempotent."""
    return AlertService(session, state.clock, state.broker).ack(user, alert_id)
