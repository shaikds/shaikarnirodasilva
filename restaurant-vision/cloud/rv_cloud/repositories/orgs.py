"""Organizations and users, scoped by ``org_id``."""

from collections.abc import Sequence

from rv_contracts import MembershipInfo, Role, new_uuid7
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.models import Membership, Organization, User


class OrgRepository:
    """The caller's own organization."""

    def __init__(self, session: Session, org_id: str) -> None:
        self._session = session
        self._org_id = org_id

    def get(self) -> Organization | None:
        return self._session.get(Organization, self._org_id)

    @staticmethod
    def create(session: Session, name: str, plan: str, now: float) -> Organization:
        """New tenant (signup, seed). The only way to create an org."""
        org = Organization(id=new_uuid7(), name=name, plan=plan, created_at=now)
        session.add(org)
        session.flush()
        return org


class UserRepository:
    """Users and memberships of one organization."""

    def __init__(self, session: Session, org_id: str) -> None:
        self._session = session
        self._org_id = org_id

    def list(self) -> Sequence[User]:
        return self._session.scalars(
            select(User).where(User.org_id == self._org_id).order_by(User.created_at, User.id)
        ).all()

    def get(self, user_id: str) -> User | None:
        return self._session.scalars(
            select(User).where(User.id == user_id, User.org_id == self._org_id)
        ).one_or_none()

    def create(
        self,
        *,
        email: str,
        name: str,
        password_hash: str,
        locale: str,
        memberships: Sequence[MembershipInfo],
        now: float,
    ) -> User:
        user = User(
            id=new_uuid7(),
            org_id=self._org_id,
            email=email,
            password_hash=password_hash,
            name=name,
            locale=locale,
            token_version=0,
            created_at=now,
        )
        user.memberships = [self._membership(user.id, m) for m in memberships]
        self._session.add(user)
        self._session.flush()
        return user

    def set_memberships(self, user: User, memberships: Sequence[MembershipInfo]) -> None:
        user.memberships = [self._membership(user.id, m) for m in memberships]
        self._session.flush()

    def delete(self, user: User) -> None:
        self._session.delete(user)
        self._session.flush()

    def count_owners(self, exclude_user_id: str | None = None) -> int:
        query = select(func.count(func.distinct(Membership.user_id))).where(
            Membership.org_id == self._org_id, Membership.role == Role.OWNER.value
        )
        if exclude_user_id is not None:
            query = query.where(Membership.user_id != exclude_user_id)
        return int(self._session.scalar(query) or 0)

    def _membership(self, user_id: str, info: MembershipInfo) -> Membership:
        return Membership(
            user_id=user_id, org_id=self._org_id, role=info.role.value, site_id=info.site_id
        )
