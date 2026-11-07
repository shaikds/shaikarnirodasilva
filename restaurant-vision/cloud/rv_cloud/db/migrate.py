"""Run Alembic migrations programmatically (startup auto-migrate, seed tool, tests)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def alembic_config(database_url: str | None = None) -> Config:
    """An Alembic config pointing at the packaged migrations."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    if database_url is not None:
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def upgrade_head(engine: Engine) -> None:
    """Upgrade the database behind ``engine`` to the latest revision (idempotent)."""
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
