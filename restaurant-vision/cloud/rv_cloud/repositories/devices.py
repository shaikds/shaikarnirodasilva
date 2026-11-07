"""Edge devices, their latest heartbeat and pairing codes of one site."""

from collections.abc import Sequence
from typing import Any

from rv_contracts import new_uuid7
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import Device, DeviceHealth, PairingCode
from ..tenancy import SiteScope


class DeviceRepository:
    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def list(self) -> Sequence[Device]:
        return self._session.scalars(
            select(Device)
            .where(Device.site_id == self._scope.site_id)
            .order_by(Device.created_at, Device.id)
        ).all()

    def get(self, device_id: str) -> Device | None:
        return self._session.scalars(
            select(Device).where(Device.id == device_id, Device.site_id == self._scope.site_id)
        ).one_or_none()

    def create(self, token_hash: str, now: float) -> Device:
        device = Device(
            id=new_uuid7(),
            site_id=self._scope.site_id,
            token_hash=token_hash,
            created_at=now,
            last_seen_at=None,
            version=None,
        )
        self._session.add(device)
        self._session.flush()
        return device

    def delete(self, device: Device) -> None:
        self._session.delete(device)
        self._session.flush()

    def health_by_device(self) -> dict[str, DeviceHealth]:
        rows = self._session.scalars(
            select(DeviceHealth).where(DeviceHealth.site_id == self._scope.site_id)
        )
        return {row.device_id: row for row in rows}

    def get_health(self, device_id: str) -> DeviceHealth | None:
        return self._session.scalars(
            select(DeviceHealth).where(
                DeviceHealth.device_id == device_id, DeviceHealth.site_id == self._scope.site_id
            )
        ).one_or_none()

    def upsert_health(
        self,
        device_id: str,
        *,
        ts: float,
        version: str,
        cameras: list[dict[str, Any]],
        cpu_pct: float,
        mem_mb: float,
        outbox_depth: int,
    ) -> None:
        """Store a heartbeat unless a newer one (by edge ``ts``) is already stored."""
        row = self.get_health(device_id)
        if row is None:
            row = DeviceHealth(device_id=device_id, site_id=self._scope.site_id)
            self._session.add(row)
        elif row.ts > ts:
            return
        row.ts = ts
        row.version = version
        row.cameras_json = cameras
        row.cpu_pct = cpu_pct
        row.mem_mb = mem_mb
        row.outbox_depth = outbox_depth

    def add_pairing_code(self, code: str, expires_at: float, now: float) -> PairingCode:
        pairing = PairingCode(
            code=code, site_id=self._scope.site_id, expires_at=expires_at, created_at=now
        )
        self._session.add(pairing)
        self._session.flush()
        return pairing

    def pairing_code_exists(self, code: str) -> bool:
        # Codes are globally unique (primary key); a collision check must look at all sites.
        return self._session.get(PairingCode, code) is not None
