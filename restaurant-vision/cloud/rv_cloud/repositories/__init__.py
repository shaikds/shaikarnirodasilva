"""Data access (Repository pattern). Every class is bound to a tenancy scope (an ``org_id`` or a
:class:`~rv_cloud.tenancy.SiteScope`) and filters every query by it. The only unscoped lookups
live in :class:`~rv_cloud.repositories.auth.AuthRepository` (finding a principal from a
presented secret) and the global idempotency/uniqueness checks that return ids only."""

from .alerts import AlertRepository, OrgAlertRepository
from .auth import AuthRepository, DevicePrincipal
from .commands import CommandRepository
from .devices import DeviceRepository
from .events import EventRepository
from .orgs import OrgRepository, UserRepository
from .push import PushRepository, UserPushRepository
from .queues import QueueRepository, SnapshotRepository
from .sites import ScopedSiteRepository, SiteRepository
from .tables import TableRepository

__all__ = [
    "AlertRepository",
    "AuthRepository",
    "CommandRepository",
    "DevicePrincipal",
    "DeviceRepository",
    "EventRepository",
    "OrgAlertRepository",
    "OrgRepository",
    "PushRepository",
    "QueueRepository",
    "ScopedSiteRepository",
    "SiteRepository",
    "SnapshotRepository",
    "TableRepository",
    "UserPushRepository",
    "UserRepository",
]
