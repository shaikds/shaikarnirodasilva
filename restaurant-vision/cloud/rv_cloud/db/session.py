"""Engine and session factory."""

from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


def is_sqlite(url: str) -> bool:
    return make_url(url).get_backend_name() == "sqlite"


def create_db_engine(url: str, *, echo: bool = False) -> Engine:
    """Create an engine. SQLite gets foreign keys, WAL and a busy timeout; an in-memory SQLite
    database uses a single shared connection so every session sees the same data."""
    kwargs: dict[str, Any] = {"echo": echo}
    parsed = make_url(url)
    sqlite = parsed.get_backend_name() == "sqlite"
    if sqlite:
        kwargs["connect_args"] = {"check_same_thread": False}
        if parsed.database in (None, "", ":memory:"):
            kwargs["poolclass"] = StaticPool
    else:
        kwargs["pool_pre_ping"] = True
    engine = create_engine(url, **kwargs)
    if sqlite:
        event.listen(engine, "connect", _sqlite_on_connect)
    return engine


def _sqlite_on_connect(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Sessions keep loaded attributes after commit (responses are built after committing)."""
    return sessionmaker(bind=engine, expire_on_commit=False)
