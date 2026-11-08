# rv_sim: restaurant simulator and analytics evaluation

Synthetic restaurant services for Restaurant Vision. The simulator drives the full product end to
end (`rv-edge simulate`) and measures analytics accuracy against ground truth before any real
footage exists (architecture section 9).

## Quick start

```bash
.venv/bin/rv-sim describe simulator/scenarios/smoke.yaml        # validate + summary
.venv/bin/rv-sim run simulator/scenarios/demo_dinner.yaml --truth-out truth.json
.venv/bin/rv-sim eval simulator/scenarios/smoke.yaml             # truth tracker (analytics only)
.venv/bin/rv-sim eval simulator/scenarios/smoke.yaml --tracker bytetrack --json scores.json
.venv/bin/rv-edge simulate --scenario simulator/scenarios/demo_dinner.yaml --speed 20   # live demo
```

`--seed N` is added to the scenario's own seed (0 = the scenario as written).

## Scenarios

| file | what | use |
|---|---|---|
| `smoke.yaml` | 10 min, scripted: 8 parties fill the room, one slow first visit, one party seated from the queue, two walk-aways | CI |
| `demo_dinner.yaml` | 2 h dinner, ~31 parties, queue peaks ~12 people, 5 slow first visits, 4 slow bussings, 4 walk-aways | live demo at speed 20 (6 min) |
| `peak_friday.yaml` | 2.5 h, demand far above capacity, queue past `long_queue`, ~22 walk-aways | stress |
| `quiet_lunch.yaml` | 2 h quiet lunch, no queue | false-alarm check |

Scenario YAML (all keys validated, unknown keys are errors; see `rv_sim/scenario.py`):

- `site`: `sample` (`rv_contracts.fixtures.sample_site_config()`) or an inline `SiteConfig`;
  `thresholds` partially overrides the site's thresholds.
- `run`: `date`, `start` (local time, quote it: `"18:00"`), `duration` (`600`, `"10m"`, `"2h"`),
  `fps` (5, so `dt = 0.2 s`).
- `arrivals`: exactly one of `hourly_rates` (local hour → parties/hour, Poisson) or `explicit`
  (`at`, `size`, optional `dwell`, `patience`, `first_visit_delay` overrides);
  `stop_before_end`.
- `party_size` (size → weight), `dwell` (`default`, `by_party_size`), `patience`.
- `staff`: `count`, `first_visit_delay` (a mixture with a slow component creates
  `waiter_needed` cases), `checkin_interval`, `visit_duration`, `bussing_delay`,
  `bussing_duration`.
- `uniform_scores` (staff ~0.8±0.1, guests ~0.1±0.1), `noise` (`box_jitter`,
  `seated_miss_prob` + `occlusion_mean_s`, `false_positives_per_frame`, `uniform_frame_sd`),
  `motion`, `body`, `layout`, `seed`.
- Distributions: `{dist: fixed|uniform|normal|lognormal|exponential|mixture, ...}` or a number.

`layout` holds the places that are not analytics zones: street door, walking aisles, camera
entry points and the routes across the entrance line. The defaults fit the sample site; an inline
site with other ids needs its own layout. It is compiled and checked at load time: every spot
lies inside its zone with `margin`, aisles avoid other zones, and the route to the dining room
crosses the entrance line exactly once inward.

## How it works

- `world.py`: deterministic discrete-time agents. Parties arrive at the door (entrance camera),
  the host seats them at the smallest free table that fits or they queue (or balk when the queue
  is full). They cross the entrance line inward, disappear, appear at the dining camera's entry,
  walk the aisle and sit. They dwell, then leave through the entrance camera (crossing the line
  outward). A queued party whose wait exceeds its patience walks back to the door without
  crossing the line. Waiters idle in the staff area and walk the aisle for first visits,
  check-ins and bussing. Boxes come from foot anchors (bottom-centre; standing 0.25, seated 0.18,
  width 0.4 × height).
- `source.py`: `SimulatedSource` (`FrameSource`): `read()` advances the shared world to
  `clock.now()` and returns a 1280x720 `Frame` whose `image` is a `SyntheticImage`. Detector
  noise is applied here (the edge `SimulatedDetector` runs with zero noise).
- `ground_truth.py`: sessions (seated, left, guests, visits, first visit, cleared), true
  `waiter_needed` / `bussing_needed` cases, queue-seated per person, walk-aways per party, a 1 Hz
  occupancy timeline and a chronological event log.
- `evaluate.py`: the pipeline (`source → detector → tracker → hints → AnalyticsEngine`) on a manual
  clock, and the scores: sessions matched/missed/false + seat latency, alert P/R + timing,
  walk-away P/R, queue wait MAE, occupancy MAE, turnover. Cases within the analytics'
  confirmation lags of a threshold are *ambiguous* and not counted either way.
- `_fallback.py`: pass-through detector + truth tracker (`--tracker fallback`).

## Integration (`load_simulation`)

```python
from rv_sim.adapter import load_simulation

sim = load_simulation(path, speed=20.0, seed=0, manual=False, start_ts=None)
sim.config, sim.clock, sim.sources, sim.world, sim.ground_truth, sim.close()
```

- `start_ts` (epoch seconds) moves the run to start then instead of at the scenario's `run.date`
  and `run.start`; `rv-edge simulate` passes the current time by default (`--rebase-to-now`).
  Only timestamps shift: arrivals (including `hourly_rates`, looked up on the scenario's own
  local hours) and everything random stay the same.

- `manual=False`: `AcceleratedClock`, scenario time = start + speed × real time, anchored on the
  first `now()` call. `manual=True`: `ManualClock`; advance it with `sim.step()` or
  `sim.clock.advance(sim.dt)`.
- `read()` returns `None` within an already returned frame interval, before the start, after the
  last frame (`source.exhausted`), or after `close()`. `Frame.index` is the world tick, so it skips
  when a reader falls behind (dropped frames). `Frame.ts` is `clock.now()`.

## Development

```bash
cd simulator && ../.venv/bin/pytest -q && ../.venv/bin/ruff check . && ../.venv/bin/mypy rv_sim
```
