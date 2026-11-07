"""Seed a demo tenant (idempotent): ``python -m rv_cloud.tools.seed_demo``.

Creates (or reuses) the org "Demo Restaurant Group" with:

* owner ``demo@example.com``, manager ``manager@example.com`` (Tel Aviv) and waiter
  ``waiter@example.com`` (Tel Aviv), all with password ``demo-password-123``;
* sites "Tel Aviv" (Asia/Jerusalem, ILS, he) and "Sydney" (Australia/Sydney, AUD, en), each
  with ``rv_contracts.fixtures.sample_site_config()`` re-id'd to the site and a floor plan.

Runs migrations first. Prints a fresh pairing code per site on every run.
"""

import argparse
from dataclasses import dataclass

from rv_contracts import (
    Currency,
    FloorPlanItem,
    Locale,
    MembershipInfo,
    Plan,
    Role,
    SiteConfig,
)
from rv_contracts.fixtures import sample_site_config
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..clock import SystemClock
from ..config import Settings
from ..db import create_db_engine, create_session_factory, upgrade_head
from ..db.models import Organization, Site, User
from ..repositories import AuthRepository, OrgRepository, SiteRepository, UserRepository
from ..security import PasswordHasher
from ..services import DeviceService, views
from ..tenancy import OrgScope, SiteScope

ORG_NAME = "Demo Restaurant Group"
PASSWORD = "demo-password-123"
OWNER_EMAIL = "demo@example.com"
MANAGER_EMAIL = "manager@example.com"
WAITER_EMAIL = "waiter@example.com"
PAIRING_TTL_S = 24 * 3600


@dataclass(frozen=True)
class DemoSite:
    name: str
    timezone: str
    currency: Currency
    locale: Locale
    avg_check_per_guest: float


SITES = (
    DemoSite("Tel Aviv", "Asia/Jerusalem", Currency.ILS, Locale.HE, 140.0),
    DemoSite("Sydney", "Australia/Sydney", Currency.AUD, Locale.EN, 55.0),
)

# Schematic layout mirroring the sample dining room: t1-t4 far row, t5-t8 near row.
FLOOR_PLAN = [
    FloorPlanItem(table_id="t1", x=0, y=0),
    FloorPlanItem(table_id="t2", x=2, y=0),
    FloorPlanItem(table_id="t3", x=4, y=0, w=2),
    FloorPlanItem(table_id="t4", x=7, y=0, w=2),
    FloorPlanItem(table_id="t5", x=0, y=3, w=2),
    FloorPlanItem(table_id="t6", x=3, y=3, w=2),
    FloorPlanItem(table_id="t7", x=6, y=3, w=3, h=2),
    FloorPlanItem(table_id="t8", x=10, y=3, w=3, h=2),
]


def _site_config(site_id: str, demo: DemoSite) -> SiteConfig:
    base = sample_site_config(site_id=site_id).model_dump(mode="json")
    base.update(timezone=demo.timezone, locale=demo.locale.value, config_version=1)
    return SiteConfig.model_validate(base)


def _ensure_org(session: Session, hasher: PasswordHasher, now: float) -> tuple[Organization, User]:
    owner = AuthRepository(session).user_by_email(OWNER_EMAIL)
    if owner is not None:
        org = OrgRepository(session, owner.org_id).get()
        assert org is not None
        return org, owner
    org = OrgRepository.create(session, ORG_NAME, Plan.PRO.value, now)
    owner = UserRepository(session, org.id).create(
        email=OWNER_EMAIL,
        name="Demo Owner",
        password_hash=hasher.hash(PASSWORD),
        locale=Locale.HE.value,
        memberships=[MembershipInfo(role=Role.OWNER)],
        now=now,
    )
    return org, owner


def _ensure_site(session: Session, scope: OrgScope, demo: DemoSite, now: float) -> Site:
    existing = session.scalars(
        select(Site).where(Site.org_id == scope.org_id, Site.name == demo.name)
    ).first()
    if existing is not None:
        return existing
    site = SiteRepository(session, scope).create(
        name=demo.name,
        timezone=demo.timezone,
        locale=demo.locale.value,
        currency=demo.currency.value,
        avg_check_per_guest=demo.avg_check_per_guest,
        config_json={},
        config_version=1,
        now=now,
    )
    views.store_config(site, _site_config(site.id, demo))
    site.floor_plan_json = [item.model_dump(mode="json") for item in FLOOR_PLAN]
    return site


def _ensure_user(
    session: Session,
    hasher: PasswordHasher,
    org_id: str,
    email: str,
    name: str,
    role: Role,
    site_id: str,
    now: float,
) -> None:
    if AuthRepository(session).user_by_email(email) is not None:
        return
    UserRepository(session, org_id).create(
        email=email,
        name=name,
        password_hash=hasher.hash(PASSWORD),
        locale=Locale.HE.value,
        memberships=[MembershipInfo(role=role, site_id=site_id)],
        now=now,
    )


def seed(settings: Settings, pairing_ttl_s: float = PAIRING_TTL_S) -> list[tuple[str, str, str]]:
    """Create the demo data if missing. Returns ``(site name, site_id, pairing code)``."""
    engine = create_db_engine(settings.database_url)
    upgrade_head(engine)
    clock = SystemClock()
    hasher = PasswordHasher(settings)
    codes: list[tuple[str, str, str]] = []
    try:
        with create_session_factory(engine)() as session:
            now = clock.now()
            org, owner = _ensure_org(session, hasher, now)
            scope = OrgScope(org_id=org.id, user_id=owner.id, is_owner=True)
            sites = [_ensure_site(session, scope, demo, now) for demo in SITES]
            tel_aviv = sites[0]
            _ensure_user(
                session,
                hasher,
                org.id,
                MANAGER_EMAIL,
                "Demo Manager",
                Role.MANAGER,
                tel_aviv.id,
                now,
            )
            _ensure_user(
                session, hasher, org.id, WAITER_EMAIL, "Demo Waiter", Role.WAITER, tel_aviv.id, now
            )
            session.commit()
            devices = DeviceService(session, clock)
            for site in sites:
                info = devices.create_pairing_code(
                    SiteScope(org_id=org.id, site_id=site.id), pairing_ttl_s
                )
                codes.append((site.name, site.id, info.code))
    finally:
        engine.dispose()
    return codes


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--database-url", help="defaults to RV_DATABASE_URL")
    parser.add_argument("--pairing-ttl-s", type=float, default=PAIRING_TTL_S)
    args = parser.parse_args(argv)
    settings = Settings()
    if args.database_url:
        settings = Settings(database_url=args.database_url)
    codes = seed(settings, args.pairing_ttl_s)
    print(f"Demo org: {ORG_NAME}")
    print(f"  owner   {OWNER_EMAIL} / {PASSWORD}")
    print(f"  manager {MANAGER_EMAIL} / {PASSWORD}  (Tel Aviv)")
    print(f"  waiter  {WAITER_EMAIL} / {PASSWORD}  (Tel Aviv)")
    for name, site_id, code in codes:
        print(f"Site {name:<9} {site_id}  pairing code: {code}")


if __name__ == "__main__":
    main()
