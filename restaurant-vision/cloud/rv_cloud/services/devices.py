"""Edge device pairing, authentication and status."""

import secrets

from rv_contracts import DeviceStatus, PairingCodeInfo, PairRequest, PairResponse
from sqlalchemy.orm import Session

from ..clock import Clock
from ..errors import NotFound, Unauthorized
from ..repositories import AuthRepository, DevicePrincipal, DeviceRepository
from ..security import RateLimiter, hash_token, new_device_token
from ..tenancy import SiteScope
from . import views

PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
"""``A-Z0-9`` without look-alikes (0/O, 1/I)."""
PAIRING_CODE_LENGTH = 6


def new_pairing_code() -> str:
    return "".join(secrets.choice(PAIRING_ALPHABET) for _ in range(PAIRING_CODE_LENGTH))


class DeviceService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def create_pairing_code(self, scope: SiteScope, ttl_s: float) -> PairingCodeInfo:
        """A fresh single-use code, valid for ``ttl_s`` seconds."""
        now = self._clock.now()
        AuthRepository(self._session).purge_expired_pairing_codes(now)
        repo = DeviceRepository(self._session, scope)
        code = new_pairing_code()
        while repo.pairing_code_exists(code):
            code = new_pairing_code()
        pairing = repo.add_pairing_code(code, now + ttl_s, now)
        self._session.commit()
        return PairingCodeInfo(
            code=pairing.code, site_id=scope.site_id, expires_at=pairing.expires_at
        )

    def pair(
        self, request: PairRequest, client_ip: str, limiter: RateLimiter | None
    ) -> PairResponse:
        """Exchange a pairing code for a device token (returned once, stored hashed)."""
        if limiter is not None:
            limiter.check(client_ip)
        principal = AuthRepository(self._session).consume_pairing_code(
            request.code, self._clock.now()
        )
        if principal is None:
            self._session.rollback()
            if limiter is not None:
                limiter.hit(client_ip)
            raise Unauthorized("Invalid or expired pairing code")
        scope = SiteScope(org_id=principal.org_id, site_id=principal.site_id)
        token, token_hash = new_device_token()
        device = DeviceRepository(self._session, scope).create(token_hash, self._clock.now())
        self._session.commit()
        return PairResponse(device_id=device.id, site_id=scope.site_id, token=token)

    def authenticate(self, token: str) -> DevicePrincipal:
        principal = AuthRepository(self._session).device_by_token_hash(hash_token(token))
        if principal is None:
            raise Unauthorized("Invalid device token")
        return principal

    def statuses(self, scope: SiteScope) -> list[DeviceStatus]:
        repo = DeviceRepository(self._session, scope)
        health = repo.health_by_device()
        now = self._clock.now()
        return [views.device_status(d, health.get(d.id), now) for d in repo.all()]

    def delete(self, scope: SiteScope, device_id: str) -> None:
        """Unpair: the device token stops working immediately."""
        repo = DeviceRepository(self._session, scope)
        device = repo.get(device_id)
        if device is None:
            raise NotFound("Device not found")
        repo.delete(device)
        self._session.commit()
