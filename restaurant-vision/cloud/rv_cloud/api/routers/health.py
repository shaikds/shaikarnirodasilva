"""Health check."""

from fastapi import APIRouter
from rv_contracts import HealthStatus

from ... import __version__

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthStatus)
def healthz() -> HealthStatus:
    return HealthStatus(version=__version__)
