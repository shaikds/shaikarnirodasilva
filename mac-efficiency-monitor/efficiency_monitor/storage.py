import sqlite3
import time
from pathlib import Path

from .models import Flag, RevisitItem

DB_PATH = Path.home() / ".mac_efficiency_monitor" / "activity.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    idle_seconds REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    kind TEXT NOT NULL,
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    minutes REAL NOT NULL,
    tip TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    app TEXT NOT NULL,
    title TEXT NOT NULL,
    reason TEXT NOT NULL,
    suggestion TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
);
"""


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    return conn


def log_event(conn, ts: float, app: str, title: str, category: str, idle_seconds: float):
    conn.execute(
        "INSERT INTO events (ts, app, title, category, idle_seconds) VALUES (?, ?, ?, ?, ?)",
        (ts, app, title, category, idle_seconds),
    )
    conn.commit()


def log_flag(conn, flag: Flag):
    conn.execute(
        "INSERT INTO flags (ts, kind, app, title, detail, minutes, tip) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (flag.ts, flag.kind, flag.app, flag.title, flag.detail, flag.minutes, flag.tip),
    )
    conn.commit()

    # stuck / skimming episodes become things to revisit later
    if flag.kind in ("stuck", "skimming"):
        reason = flag.detail
        suggestion = flag.tip
        conn.execute(
            "INSERT INTO revisit (ts, app, title, reason, suggestion, resolved) VALUES (?, ?, ?, ?, ?, 0)",
            (flag.ts, flag.app, flag.title, reason, suggestion),
        )
        conn.commit()


def get_revisit_items(conn, only_unresolved: bool = True) -> list[RevisitItem]:
    query = "SELECT id, ts, app, title, reason, suggestion, resolved FROM revisit"
    if only_unresolved:
        query += " WHERE resolved = 0"
    query += " ORDER BY ts DESC"
    rows = conn.execute(query).fetchall()
    return [
        RevisitItem(id=r[0], ts=r[1], app=r[2], title=r[3], reason=r[4],
                    suggestion=r[5], resolved=bool(r[6]))
        for r in rows
    ]


def resolve_revisit(conn, item_id: int):
    conn.execute("UPDATE revisit SET resolved = 1 WHERE id = ?", (item_id,))
    conn.commit()


def events_since(conn, since_ts: float):
    return conn.execute(
        "SELECT ts, app, title, category, idle_seconds FROM events WHERE ts >= ? ORDER BY ts",
        (since_ts,),
    ).fetchall()


def flags_since(conn, since_ts: float):
    return conn.execute(
        "SELECT ts, kind, app, title, detail, minutes, tip FROM flags WHERE ts >= ? ORDER BY ts",
        (since_ts,),
    ).fetchall()


def start_of_today() -> float:
    now = time.localtime()
    midnight = time.struct_time((now.tm_year, now.tm_mon, now.tm_mday, 0, 0, 0, 0, 0, -1))
    return time.mktime(midnight)
