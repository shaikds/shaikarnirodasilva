"""The only unscoped lookups: authentication has to find a principal before a scope exists.

Each method resolves exactly one principal from a secret the caller presented (email +
password, signed token, device token, pairing code) and never lists tenant data.
"""

from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db.models import Device, PairingCode, Site, User


@dataclass(frozen=True, slots=True)
class DevicePrincipal:
    device_id: str
    site_id: str
    org_id: str


class AuthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def user_by_email(self, email: str) -> User | None:
        return self._session.scalars(
            select(User).where(func.lower(User.email) == email.lower())
        ).one_or_none()

    def email_taken(self, email: str) -> bool:
        return self.user_by_email(email) is not None

    def user_for_token(self, user_id: str, org_id: str) -> User | None:
        """The user a token names, only if still in the org the token was issued for."""
        return self._session.scalars(
            select(User).where(User.id == user_id, User.org_id == org_id)
        ).one_or_none()

    def device_by_token_hash(self, token_hash: str) -> DevicePrincipal | None:
        row = self._session.execute(
            select(Device.id, Device.site_id, Site.org_id)
            .join(Site, Site.id == Device.site_id)
            .where(Device.token_hash == token_hash)
        ).one_or_none()
        if row is None:
            return None
        return DevicePrincipal(device_id=row[0], site_id=row[1], org_id=row[2])

    def consume_pairing_code(self, code: str, now: float) -> DevicePrincipal | None:
        """Atomically delete a valid code (single use) and return its site, or None if the code
        is unknown, expired or was consumed concurrently."""
        row = self._session.execute(
            select(PairingCode.site_id, Site.org_id)
            .join(Site, Site.id == PairingCode.site_id)
            .where(PairingCode.code == code, PairingCode.expires_at > now)
        ).one_or_none()
        if row is None:
            return None
        result = self._session.execute(
            delete(PairingCode).where(PairingCode.code == code, PairingCode.expires_at > now)
        )
        if getattr(result, "rowcount", 0) != 1:
            return None
        return DevicePrincipal(device_id="", site_id=row[0], org_id=row[1])

    def purge_expired_pairing_codes(self, now: float) -> None:
        self._session.execute(delete(PairingCode).where(PairingCode.expires_at <= now))
