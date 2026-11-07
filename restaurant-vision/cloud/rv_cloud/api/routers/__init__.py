"""HTTP and WebSocket routers, mounted under ``/api/v1``."""

from fastapi import APIRouter

from . import alerts, auth, edge, health, orgs, push, sites, ws

api_router = APIRouter()
for module in (auth, orgs, sites, alerts, edge, push, ws, health):
    api_router.include_router(module.router)

__all__ = ["api_router"]
