import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from efficiency_monitor import storage, report
from efficiency_monitor.models import Flag


def test_report_pipeline_with_synthetic_day(tmp_path=None):
    db_path = Path(tempfile.mkdtemp()) / "activity.db"
    conn = storage.connect(db_path)

    now = time.time()
    storage.log_event(conn, now - 3000, "Xcode", "Bug.swift", "coding", 0)
    storage.log_event(conn, now - 2000, "Google Chrome", "Stack Overflow - X", "research_learning", 0)
    storage.log_event(conn, now - 1000, "Xcode", "Bug.swift", "coding", 0)

    flag = Flag(ts=now - 2500, kind="stuck", app="Xcode", title="Bug.swift",
                detail="25 min on the same thing.", minutes=25,
                tip="Re-read the error from the top.")
    storage.log_flag(conn, flag)

    items = storage.get_revisit_items(conn)
    assert len(items) == 1
    assert items[0].app == "Xcode"

    storage.resolve_revisit(conn, items[0].id)
    assert storage.get_revisit_items(conn) == []

    text = report.build_today_report(conn)
    assert "EFFICIENCY REPORT" in text
    print(text)


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
