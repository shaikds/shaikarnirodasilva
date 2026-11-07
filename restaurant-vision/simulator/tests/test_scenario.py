import random
from typing import Any

import pytest
import yaml
from pydantic import ValidationError
from rv_contracts.fixtures import sample_site_config

from conftest import SCENARIOS
from rv_sim.scenario import Lognormal, Mixture, MixtureComponent, Uniform, parse_scenario

BASE: dict[str, Any] = {
    "name": "t",
    "run": {"start": "18:00", "duration": "10m"},
    "arrivals": {"explicit": [{"at": 0, "size": 2}]},
}


def scenario(**changes: Any) -> Any:
    data = {**BASE, **changes}
    return parse_scenario(yaml.safe_dump(data))


@pytest.mark.parametrize("name", ["smoke", "demo_dinner", "peak_friday", "quiet_lunch"])
def test_shipped_scenarios_validate(name: str) -> None:
    sc = parse_scenario((SCENARIOS / f"{name}.yaml").read_text(), name)
    assert sc.name == name
    assert sc.site_config.site_id == "site-demo"
    assert len(sc.geometry.tables) == 8


def test_defaults_and_durations() -> None:
    sc = scenario(run={"start": "19:30", "duration": "1h30m", "fps": 5})
    assert sc.run.duration == 5400
    assert sc.site_config == sample_site_config()
    assert sc.staff.count == 3
    assert sc.uniform_scores.staff.mean == 0.8 and sc.uniform_scores.guest.mean == 0.1


def test_threshold_overrides() -> None:
    sc = scenario(thresholds={"first_visit_timeout_s": 120})
    assert sc.site_config.thresholds.first_visit_timeout_s == 120
    assert sc.site_config.thresholds.seat_confirm_s == 20


def test_inline_site() -> None:
    site = sample_site_config("site-inline").model_dump(mode="json")
    sc = scenario(site=site)
    assert sc.site_config.site_id == "site-inline"


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"arrivals": {}}, "exactly one of hourly_rates or explicit"),
        (
            {"arrivals": {"hourly_rates": {18: 10}, "explicit": [{"at": 0, "size": 2}]}},
            "exactly one",
        ),
        ({"arrivals": {"hourly_rates": {25: 10}}}, "not in 0..23"),
        ({"arrivals": {"explicit": [{"at": 0, "size": 7}]}}, "exceeds 6 seats"),
        ({"arrivals": {"explicit": [{"at": 900, "size": 2}]}}, "after the run ends"),
        ({"party_size": {2: 1.0, 8: 1.0}}, "does not fit any table"),
        ({"surprise": 1}, "Extra inputs are not permitted"),
        ({"run": {"start": 1080, "duration": 60}}, "quote the start time"),
        ({"run": {"start": "18:00", "duration": "ten minutes"}}, "invalid duration"),
        ({"patience": {"dist": "gamma", "k": 2}}, "does not match any of the expected tags"),
        ({"patience": {"dist": "normal", "mean": 300, "sd": 60}}, "can be negative"),
        ({"patience": {"dist": "uniform", "low": 9, "high": 1}}, "low must not exceed high"),
        ({"staff": {"count": 0}}, "greater than or equal to 1"),
        ({"noise": {"box_jitter": 0.01}}, "too large for layout.margin"),
        ({"noise": {"seated_miss_prob": 1.5}}, "less than or equal to 0.9"),
    ],
)
def test_validation_errors(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        scenario(**changes)


def test_layout_errors() -> None:
    inside_queue = [[0.2, 0.5], [0.4, 0.5], [0.4, 0.7], [0.2, 0.7]]
    with pytest.raises(ValidationError, match="inside the queue zone"):
        scenario(layout={"entrance": {"door": inside_queue}})
    with pytest.raises(ValidationError, match="lane_in .* crosses the entrance line none"):
        scenario(layout={"entrance": {"lane_in": [[0.36, 0.33], [0.6, 0.33]]}})
    with pytest.raises(ValidationError, match="aisle passes through zone 'z-t6'"):
        scenario(layout={"cameras": {"cam-dining": {"entry": [0.08, 0.47],
                                                    "aisle": [[0.08, 0.47], [0.4, 0.7]]}}})
    site = sample_site_config().model_dump(mode="json")
    site["zones"] = [z for z in site["zones"] if z["zone_id"] != "z-staff-kitchen"]
    with pytest.raises(ValidationError, match="'z-staff-kitchen' not found"):
        scenario(site=site)


def test_distributions_sample_within_bounds() -> None:
    rng = random.Random(1)
    mix = Mixture(
        components=[
            MixtureComponent(weight=3, value=Lognormal(median=60, sigma=0.5, min=20, max=150)),
            MixtureComponent(weight=1, value=Uniform(low=240, high=420)),
        ]
    )
    samples = [mix.sample(rng) for _ in range(2000)]
    assert all(20 <= s <= 150 or 240 <= s <= 420 for s in samples)
    slow = sum(s >= 240 for s in samples) / len(samples)
    assert 0.2 < slow < 0.3
    assert mix.bounds() == (20, 420)
