from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from rv_contracts import EdgeEvent, QueueSeated, make_event
from rv_contracts.fixtures import SAMPLE_TS, sample_events

from rv_edge.runtime.outbox import SENT_RETENTION_S, Outbox

from .fakes import ManualClock


def _seated(i: int) -> EdgeEvent:
    return make_event(QueueSeated, "site-demo", SAMPLE_TS + i, zone_id="z-queue", waited_s=float(i))


def test_persists_and_batches_across_reopen(tmp_path: Path) -> None:
    path = tmp_path / "outbox.sqlite3"
    events = sample_events()
    box = Outbox(path)
    for event in events:
        assert box.append(event)
    box.close()

    box = Outbox(path)
    assert box.depth() == len(events)
    first = box.fetch_batch(3)
    assert [i.event for i in first] == events[:3]
    assert box.mark_sent(i.id for i in first) == 3
    box.close()

    box = Outbox(path)
    assert box.depth() == len(events) - 3
    rest = box.fetch_batch()
    assert [i.event for i in rest] == events[3:]
    assert box.fetch_batch(1)[0].event == events[3]  # unsent rows are fetched again
    box.close()


def test_wal_mode(tmp_path: Path) -> None:
    box = Outbox(tmp_path / "o.sqlite3")
    box.close()
    db = sqlite3.connect(tmp_path / "o.sqlite3")
    assert db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    db.close()


def test_batch_is_capped_at_500(tmp_path: Path) -> None:
    box = Outbox(tmp_path / "o.sqlite3")
    for i in range(520):
        box.append(_seated(i))
    assert len(box.fetch_batch(10_000)) == 500
    assert len(box.fetch_batch(0)) == 1
    box.close()


def test_append_is_idempotent_on_event_id(tmp_path: Path) -> None:
    box = Outbox(tmp_path / "o.sqlite3")
    event = _seated(1)
    assert box.append(event)
    assert not box.append(event)
    assert box.depth() == 1
    box.close()


def test_prune_removes_only_old_sent_rows(tmp_path: Path) -> None:
    clock = ManualClock(1_000_000.0)
    box = Outbox(tmp_path / "o.sqlite3", wall_clock=clock.now)
    for i in range(3):
        box.append(_seated(i))
    items = box.fetch_batch()
    box.mark_sent([items[0].id])
    clock.advance(SENT_RETENTION_S - 10)
    box.mark_sent([items[1].id])
    clock.advance(20)
    assert box.prune() == 1  # only the first one is older than 7 days
    assert box.depth() == 1  # the unsent one is never pruned
    box.close()


def test_failed_rows_leave_the_queue(tmp_path: Path) -> None:
    box = Outbox(tmp_path / "o.sqlite3")
    box.append(_seated(1))
    box.append(_seated(2))
    first = box.fetch_batch(1)[0]
    box.mark_failed([first.id])
    assert box.depth() == 1
    assert box.fetch_batch()[0].event.event_id != first.event.event_id
    box.close()


def test_meta_round_trip(tmp_path: Path) -> None:
    box = Outbox(tmp_path / "o.sqlite3")
    assert box.get_meta("k") is None
    box.set_meta("k", "a")
    box.set_meta("k", "b")
    box.close()
    box = Outbox(tmp_path / "o.sqlite3")
    assert box.get_meta("k") == "b"
    box.close()


def test_concurrent_appends(tmp_path: Path) -> None:
    box = Outbox(tmp_path / "o.sqlite3")

    def worker(offset: int) -> None:
        for i in range(25):
            box.append(_seated(offset + i))

    threads = [threading.Thread(target=worker, args=(n * 100,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert box.depth() == 100
    box.close()
