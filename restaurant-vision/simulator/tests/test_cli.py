import json
from pathlib import Path

import pytest

from conftest import SMOKE
from rv_sim.cli import main


def test_describe(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["describe", str(SMOKE)]) == 0
    out = capsys.readouterr().out
    assert "scenario smoke" in out and "8 tables, 32 seats" in out and "layout      ok" in out


def test_run_writes_truth(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    truth_path, log_path = tmp_path / "truth.json", tmp_path / "log.jsonl"
    assert (
        main(["run", str(SMOKE), "--truth-out", str(truth_path), "--log-out", str(log_path)]) == 0
    )
    assert '"parties": 11' in capsys.readouterr().out
    truth = json.loads(truth_path.read_text())
    assert truth["summary"]["waiter_needed"] == 1
    assert len(truth["sessions"]) == 9
    log = [json.loads(line) for line in log_path.read_text().splitlines()]
    assert [e["ts"] for e in log] == sorted(e["ts"] for e in log)
    assert {"party.arrived", "table.seated", "queue.walkaway"} <= {e["type"] for e in log}


def test_invalid_scenario(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("run: {start: '18:00', duration: 60}\narrivals: {}\n")
    assert main(["describe", str(bad)]) == 2
    assert "exactly one of hourly_rates or explicit" in capsys.readouterr().err
