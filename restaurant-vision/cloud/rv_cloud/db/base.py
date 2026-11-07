"""Declarative base with portable column types and a constraint naming convention.

Portability rules (SQLite for dev/tests, Postgres in production):

* Timestamps are ``Double`` Unix epoch seconds (UTC), the same unit as the contracts.
* Enums are stored as short strings (validated by the contracts), never as database enums.
* JSON documents use the generic ``JSON`` type.
* Constraint names follow :data:`NAMING_CONVENTION` so Alembic migrations are deterministic.
"""

from typing import Any, Final

from sqlalchemy import JSON, BigInteger, Double, Integer, MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION: Final = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

BigIntPk = BigInteger().with_variant(Integer(), "sqlite")
"""64-bit autoincrement key on Postgres; ``INTEGER PRIMARY KEY`` (rowid) on SQLite."""


class Base(DeclarativeBase):
    """Base class of every ORM model."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {
        float: Double(),
        dict[str, Any]: JSON(),
        list[Any]: JSON(),
    }
