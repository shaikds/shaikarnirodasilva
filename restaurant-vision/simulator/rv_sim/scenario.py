"""Scenario YAML models (pydantic v2). :func:`load_scenario` reads and validates one file.

A scenario describes one service: the site (``sample_site_config()`` by default, or inline), the
run window, arrivals (an hourly rate profile *or* explicit arrivals), party sizes, staff
behaviour, dwell and patience distributions, appearance scores, detector noise and the seed.
Validation is strict: unknown keys are errors, and the layout is compiled against the site so a
scenario that cannot be simulated fails at load time with a readable message.

Durations accept seconds (``90``) or strings (``"90s"``, ``"15m"``, ``"2h"``, ``"1h30m"``).
Distributions are mappings with a ``dist`` key (``fixed``, ``uniform``, ``normal``,
``lognormal``, ``exponential``, ``mixture``) or a bare number (fixed).
"""

from __future__ import annotations

import datetime as dt
import math
import random
import re
from pathlib import Path
from typing import Annotated, Any, Literal, Self
from zoneinfo import ZoneInfo

import yaml
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PrivateAttr, model_validator
from rv_contracts import SiteConfig
from rv_contracts.fixtures import sample_site_config

from .layout import Body, Layout, SiteGeometry, compile_layout


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --------------------------------------------------------------------------------------
# Durations
# --------------------------------------------------------------------------------------

_DURATION_RE = re.compile(
    r"^\s*(?:(?P<h>\d+(?:\.\d+)?)\s*h)?\s*(?:(?P<m>\d+(?:\.\d+)?)\s*(?:min|m))?"
    r"\s*(?:(?P<s>\d+(?:\.\d+)?)\s*s)?\s*$"
)


def parse_duration(value: Any) -> Any:
    """Seconds from a number or a string like ``"90s"``, ``"15m"``, ``"2h"``, ``"1h30m"``."""
    if isinstance(value, str):
        match = _DURATION_RE.match(value)
        if match is None or not any(match.groupdict().values()):
            raise ValueError(f"invalid duration {value!r}; use seconds or e.g. '15m', '2h'")
        parts = {k: float(v) for k, v in match.groupdict().items() if v is not None}
        return parts.get("h", 0.0) * 3600 + parts.get("m", 0.0) * 60 + parts.get("s", 0.0)
    return value


Duration = Annotated[float, BeforeValidator(parse_duration), Field(ge=0, allow_inf_nan=False)]


# --------------------------------------------------------------------------------------
# Distributions
# --------------------------------------------------------------------------------------


class _Dist(_Model):
    def sample(self, rng: random.Random) -> float:
        raise NotImplementedError

    def mean(self) -> float:
        """Approximate mean (ignores clipping)."""
        raise NotImplementedError

    def bounds(self) -> tuple[float, float]:
        """Smallest and largest value a sample can take."""
        raise NotImplementedError


class _Clipped(_Dist):
    min: float | None = None
    max: float | None = None

    def _clip(self, value: float) -> float:
        if self.min is not None:
            value = max(self.min, value)
        if self.max is not None:
            value = min(self.max, value)
        return value

    @model_validator(mode="after")
    def _check_clip(self) -> Self:
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("min must not exceed max")
        return self


class Fixed(_Dist):
    dist: Literal["fixed"] = "fixed"
    value: float

    def sample(self, rng: random.Random) -> float:
        return self.value

    def mean(self) -> float:
        return self.value

    def bounds(self) -> tuple[float, float]:
        return (self.value, self.value)


class Uniform(_Dist):
    dist: Literal["uniform"] = "uniform"
    low: float
    high: float

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.low > self.high:
            raise ValueError("uniform: low must not exceed high")
        return self

    def sample(self, rng: random.Random) -> float:
        return rng.uniform(self.low, self.high)

    def mean(self) -> float:
        return (self.low + self.high) / 2

    def bounds(self) -> tuple[float, float]:
        return (self.low, self.high)


class Normal(_Clipped):
    dist: Literal["normal"] = "normal"
    mean_: float = Field(alias="mean")
    sd: float = Field(ge=0)

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    def sample(self, rng: random.Random) -> float:
        return self._clip(rng.gauss(self.mean_, self.sd))

    def mean(self) -> float:
        return self.mean_

    def bounds(self) -> tuple[float, float]:
        lo = self.min if self.min is not None else (self.mean_ if self.sd == 0 else -math.inf)
        hi = self.max if self.max is not None else (self.mean_ if self.sd == 0 else math.inf)
        return (lo, hi)


class Lognormal(_Clipped):
    """``exp(N(ln(median), sigma))``: right-skewed, positive (dwell, response times)."""

    dist: Literal["lognormal"] = "lognormal"
    median: float = Field(gt=0)
    sigma: float = Field(ge=0)

    def sample(self, rng: random.Random) -> float:
        return self._clip(rng.lognormvariate(math.log(self.median), self.sigma))

    def mean(self) -> float:
        return self.median * math.exp(self.sigma**2 / 2)

    def bounds(self) -> tuple[float, float]:
        lo = self.min if self.min is not None else 0.0
        return (lo, self.max if self.max is not None else math.inf)


class Exponential(_Clipped):
    dist: Literal["exponential"] = "exponential"
    mean_: float = Field(alias="mean", gt=0)

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    def sample(self, rng: random.Random) -> float:
        return self._clip(rng.expovariate(1.0 / self.mean_))

    def mean(self) -> float:
        return self.mean_

    def bounds(self) -> tuple[float, float]:
        lo = self.min if self.min is not None else 0.0
        return (lo, self.max if self.max is not None else math.inf)


class MixtureComponent(_Model):
    weight: float = Field(gt=0)
    value: Dist


class Mixture(_Dist):
    """Pick a component by weight, then sample it (e.g. mostly quick, sometimes very slow)."""

    dist: Literal["mixture"] = "mixture"
    components: list[MixtureComponent] = Field(min_length=1)

    def sample(self, rng: random.Random) -> float:
        total = sum(c.weight for c in self.components)
        r = rng.uniform(0.0, total)
        for c in self.components:
            r -= c.weight
            if r <= 0:
                return c.value.sample(rng)
        return self.components[-1].value.sample(rng)

    def mean(self) -> float:
        total = sum(c.weight for c in self.components)
        return sum(c.weight * c.value.mean() for c in self.components) / total

    def bounds(self) -> tuple[float, float]:
        b = [c.value.bounds() for c in self.components]
        return (min(lo for lo, _ in b), max(hi for _, hi in b))


def _number_to_fixed(value: Any) -> Any:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return {"dist": "fixed", "value": value}
    return value


Dist = Annotated[
    Fixed | Uniform | Normal | Lognormal | Exponential | Mixture,
    Field(discriminator="dist"),
    BeforeValidator(_number_to_fixed),
]
"""Any distribution; a bare number means ``fixed``."""

MixtureComponent.model_rebuild()


def _non_negative(name: str, dist: _Dist, errors: list[str]) -> None:
    lo, _ = dist.bounds()
    if lo < 0:
        errors.append(f"{name}: samples can be negative ({lo}); set min: 0 or use lognormal")


# --------------------------------------------------------------------------------------
# Scenario parts
# --------------------------------------------------------------------------------------


def _parse_time(value: Any) -> Any:
    if isinstance(value, int) and not isinstance(value, bool):
        raise ValueError('quote the start time in YAML, e.g. start: "18:00"')
    return value


class RunWindow(_Model):
    """When the simulated service runs, in the site's local time zone."""

    date: dt.date = dt.date(2026, 11, 6)
    start: Annotated[dt.time, BeforeValidator(_parse_time)] = dt.time(18, 0)
    duration: Duration
    fps: float = Field(default=5.0, gt=0, le=30)
    """Camera frame rate; the world steps at ``dt = 1 / fps`` (0.2 s by default)."""

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.duration < 1.0 / self.fps:
            raise ValueError("duration must be at least one frame")
        return self

    def start_epoch(self, timezone: str) -> float:
        local = dt.datetime.combine(self.date, self.start, tzinfo=ZoneInfo(timezone))
        return local.timestamp()


class ExplicitArrival(_Model):
    """One scripted party. Optional fields override the scenario's distributions."""

    at: Duration
    """Seconds after the run start."""
    size: int = Field(ge=1, le=50)
    dwell: Duration | None = None
    patience: Duration | None = None
    first_visit_delay: Duration | None = None


class Arrivals(_Model):
    """Exactly one of ``hourly_rates`` (local hour -> parties per hour) or ``explicit``."""

    hourly_rates: dict[int, float] | None = None
    explicit: list[ExplicitArrival] | None = None
    stop_before_end: Duration = 0.0
    """No new random arrivals in the last part of the run (lets the room drain)."""

    @model_validator(mode="after")
    def _check(self) -> Self:
        if (self.hourly_rates is None) == (self.explicit is None):
            raise ValueError("arrivals need exactly one of hourly_rates or explicit")
        for hour, rate in (self.hourly_rates or {}).items():
            if not 0 <= hour <= 23:
                raise ValueError(f"hourly_rates: hour {hour} is not in 0..23")
            if rate < 0 or not math.isfinite(rate):
                raise ValueError(f"hourly_rates: rate for hour {hour} must be >= 0")
        return self


class Staff(_Model):
    """Waiters: how many, and how quickly they visit and bus tables."""

    count: int = Field(default=3, ge=1, le=20)
    first_visit_delay: Dist = Field(
        default_factory=lambda: Mixture(
            components=[
                MixtureComponent(
                    weight=0.88, value=Lognormal(median=70, sigma=0.35, min=20, max=150)
                ),
                MixtureComponent(weight=0.12, value=Uniform(low=240, high=420)),
            ]
        )
    )
    """Seconds from seated to the first visit; the slow component triggers ``waiter_needed``."""
    checkin_interval: Dist = Field(default_factory=lambda: Uniform(low=360, high=720))
    visit_duration: Dist = Field(default_factory=lambda: Uniform(low=15, high=45))
    bussing_delay: Dist = Field(default_factory=lambda: Uniform(low=30, high=150))
    """Seconds from guests starting to leave until a waiter is sent to clear the table."""
    bussing_duration: Dist = Field(default_factory=lambda: Uniform(low=20, high=50))


class Dwell(_Model):
    """How long a party stays at the table, by party size."""

    default: Dist = Field(
        default_factory=lambda: Lognormal(median=2400, sigma=0.3, min=600, max=5400)
    )
    by_party_size: dict[int, Dist] = Field(default_factory=dict)

    def for_size(self, size: int) -> _Dist:
        dist: _Dist = self.by_party_size.get(size, self.default)
        return dist


class ScoreDist(_Model):
    mean: float = Field(ge=0, le=1)
    sd: float = Field(ge=0, le=0.5)

    def sample(self, rng: random.Random) -> float:
        return min(1.0, max(0.0, rng.gauss(self.mean, self.sd)))


class UniformScores(_Model):
    """Per-person similarity to the staff uniform (a real hint extractor's output)."""

    staff: ScoreDist = ScoreDist(mean=0.8, sd=0.1)
    guest: ScoreDist = ScoreDist(mean=0.1, sd=0.1)


class Noise(_Model):
    """Detector noise applied by the simulated sources (the edge detector adds none)."""

    box_jitter: float = Field(default=0.003, ge=0, le=0.02)
    """Std of each box coordinate, normalized units (truncated at 3 sd)."""
    seated_miss_prob: float = Field(default=0.05, ge=0, le=0.9)
    """Fraction of frames a seated guest is occluded (not detected)."""
    occlusion_mean_s: float = Field(default=1.5, gt=0, le=120)
    """Mean length of one occlusion."""
    false_positives_per_frame: float = Field(default=0.01, ge=0, le=5)
    """Expected spurious boxes per frame per camera (Poisson)."""
    uniform_frame_sd: float = Field(default=0.03, ge=0, le=0.3)
    """Frame-to-frame noise of each person's uniform score."""


class Motion(_Model):
    guest_speed: float = Field(default=0.15, gt=0.01, le=2)
    """Normalized image units per second."""
    staff_speed: float = Field(default=0.22, gt=0.01, le=2)
    stagger_s: float = Field(default=0.8, ge=0, le=10)
    """Delay between party members starting to walk."""
    door_pause_s: float = Field(default=3.0, ge=0, le=120)
    """Time at the door while the host decides."""
    transit_s: float = Field(default=2.0, ge=0, le=60)
    """Time off camera when moving between cameras."""


def _default_party_sizes() -> dict[int, float]:
    return {1: 0.08, 2: 0.45, 3: 0.15, 4: 0.22, 5: 0.05, 6: 0.05}


class Scenario(_Model):
    """One simulated service. See the module docstring and ``simulator/README.md``."""

    name: str = Field(min_length=1, max_length=64)
    description: str = ""
    seed: int = 0
    site: Literal["sample"] | SiteConfig = "sample"
    """``sample`` (``rv_contracts.fixtures.sample_site_config()``) or an inline SiteConfig."""
    thresholds: dict[str, float] = Field(default_factory=dict)
    """Partial overrides of the site's analytics thresholds."""
    layout: Layout = Field(default_factory=lambda: Layout())
    body: Body = Field(default_factory=lambda: Body())
    run: RunWindow
    arrivals: Arrivals
    party_size: dict[int, float] = Field(default_factory=_default_party_sizes)
    """Party size -> relative weight."""
    staff: Staff = Field(default_factory=lambda: Staff())
    dwell: Dwell = Field(default_factory=lambda: Dwell())
    patience: Dist = Field(default_factory=lambda: Uniform(low=300, high=1200))
    """Seconds a queued party waits before walking away."""
    uniform_scores: UniformScores = Field(default_factory=lambda: UniformScores())
    noise: Noise = Field(default_factory=lambda: Noise())
    motion: Motion = Field(default_factory=lambda: Motion())

    _config: SiteConfig = PrivateAttr()
    _geometry: SiteGeometry = PrivateAttr()

    @model_validator(mode="after")
    def _resolve(self) -> Self:
        config = sample_site_config() if self.site == "sample" else self.site
        assert isinstance(config, SiteConfig)
        if self.thresholds:
            thresholds = {**config.thresholds.model_dump(), **self.thresholds}
            config = SiteConfig.model_validate({**config.model_dump(), "thresholds": thresholds})
        errors: list[str] = []
        if not config.tables:
            raise ValueError("the site has no tables")
        max_seats = max(t.seats for t in config.tables)
        sizes = [s for s, w in self.party_size.items() if w > 0]
        if not sizes or any(w < 0 for w in self.party_size.values()):
            errors.append("party_size needs non-negative weights and at least one positive")
        for size in sizes:
            if not 1 <= size <= max_seats:
                errors.append(f"party_size {size} does not fit any table (max {max_seats} seats)")
        for arrival in self.arrivals.explicit or []:
            if arrival.size > max_seats:
                errors.append(f"explicit arrival of {arrival.size} exceeds {max_seats} seats")
            if arrival.at > self.run.duration:
                errors.append(f"explicit arrival at {arrival.at}s is after the run ends")
        for name, dist in (
            ("staff.first_visit_delay", self.staff.first_visit_delay),
            ("staff.checkin_interval", self.staff.checkin_interval),
            ("staff.visit_duration", self.staff.visit_duration),
            ("staff.bussing_delay", self.staff.bussing_delay),
            ("staff.bussing_duration", self.staff.bussing_duration),
            ("dwell.default", self.dwell.default),
            ("patience", self.patience),
            *((f"dwell.by_party_size[{k}]", v) for k, v in self.dwell.by_party_size.items()),
        ):
            _non_negative(name, dist, errors)
        if self.staff.checkin_interval.bounds()[0] <= 0:
            errors.append("staff.checkin_interval must be positive")
        if 3 * self.noise.box_jitter >= self.layout.margin:
            errors.append(
                f"noise.box_jitter {self.noise.box_jitter} is too large for layout.margin "
                f"{self.layout.margin} (need 3 * jitter < margin)"
            )
        if errors:
            raise ValueError("; ".join(errors))
        max_party = max([*sizes, *(a.size for a in self.arrivals.explicit or [])], default=1)
        self._config = config
        self._geometry = compile_layout(
            config, self.layout, self.body, staff_count=self.staff.count, max_party=max_party
        )
        return self

    @property
    def site_config(self) -> SiteConfig:
        """The resolved site config (sample or inline, with threshold overrides)."""
        return self._config

    @property
    def geometry(self) -> SiteGeometry:
        """The compiled layout (spots and routes)."""
        return self._geometry

    def start_epoch(self) -> float:
        return self.run.start_epoch(self._config.timezone)


def load_scenario(path: str | Path) -> Scenario:
    """Read and validate a scenario YAML file. ``name`` defaults to the file stem."""
    path = Path(path)
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: a scenario must be a YAML mapping")
    data.setdefault("name", path.stem)
    return Scenario.model_validate(data)


def parse_scenario(text: str, name: str = "scenario") -> Scenario:
    """Validate a scenario from YAML text (handy in tests)."""
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError("a scenario must be a YAML mapping")
    data.setdefault("name", name)
    return Scenario.model_validate(data)
