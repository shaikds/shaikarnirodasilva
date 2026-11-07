from __future__ import annotations

import os

import pytest

from rv_edge.runtime.governor import MAX_PACE_FACTOR, THREAD_ENV_VARS, ResourceGovernor


def test_backs_off_above_limit_and_recovers() -> None:
    gov = ResourceGovernor(70, cpu_count=4, manage_priority=False)
    assert gov.frame_delay(5.0) == 0.0
    for _ in range(50):
        gov.observe(cpu_pct=360.0, mem_mb=100.0)  # 90% of a 4-core machine
    assert gov.pace_factor == pytest.approx(MAX_PACE_FACTOR)
    assert gov.frame_delay(5.0) == pytest.approx((MAX_PACE_FACTOR - 1) / 5.0)

    gov.observe(cpu_pct=240.0, mem_mb=100.0)  # 60%: inside the hysteresis band, no change
    assert gov.pace_factor == pytest.approx(MAX_PACE_FACTOR)
    for _ in range(100):
        gov.observe(cpu_pct=40.0, mem_mb=100.0)
    assert gov.pace_factor == 1.0
    assert gov.frame_delay(5.0) == 0.0


def test_update_reports_cpu_and_memory() -> None:
    gov = ResourceGovernor(70, manage_priority=False)
    sample = gov.update()
    assert sample.cpu_pct >= 0 and sample.mem_mb > 0
    assert gov.last_sample == sample


def test_configure_threads_sets_env_without_overriding(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in THREAD_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("OMP_NUM_THREADS", "7")
    n = ResourceGovernor.configure_threads(2)
    assert n == 2
    assert os.environ["OMP_NUM_THREADS"] == "7"
    assert os.environ["OPENBLAS_NUM_THREADS"] == "2"


def test_priority_management_can_be_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []

    def fake_nice(increment: int) -> int:
        calls.append(increment)
        return increment

    monkeypatch.setattr(os, "nice", fake_nice)
    ResourceGovernor(manage_priority=False).lower_priority()
    assert calls == []
    if os.name == "posix":
        monkeypatch.setattr(os, "getpriority", lambda *_: 0)
        ResourceGovernor().lower_priority()
        assert calls == [10]
