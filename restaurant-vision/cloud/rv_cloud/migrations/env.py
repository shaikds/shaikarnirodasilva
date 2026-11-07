"""Alembic environment for rv_cloud.

Database URL, first match wins: a connection passed in ``config.attributes["connection"]``
(programmatic use), ``-x url=...``, ``sqlalchemy.url`` in the config, ``RV_DATABASE_URL``
(via :class:`rv_cloud.config.Settings`).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection

from rv_cloud.config import Settings
from rv_cloud.db import models  # noqa: F401  (registers every table on the metadata)
from rv_cloud.db.base import Base
from rv_cloud.db.session import create_db_engine

config = context.config
if config.config_file_name is not None and not config.attributes.get("connection"):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    url = x_args.get("url") or config.get_main_option("sqlalchemy.url")
    return url or Settings().database_url


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    engine = create_db_engine(_database_url())
    try:
        with engine.begin() as conn:
            _run(conn)
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
