# Backend end-to-end test

`test_backend_e2e.py` runs the **real cloud app** and the **real edge runtime** together on
`simulator/scenarios/smoke.yaml` (10 simulated minutes) and checks the seams between them.
It needs no servers, network, Docker or model files and takes about 20 s.

```bash
# from restaurant-vision/ (shared venv with the 4 packages installed)
make test-e2e
# or
cd e2e && ../.venv/bin/pytest -q
```

## How it is wired

- **Cloud**: `rv_cloud.main.create_app` on a SQLite file, migrated by the app on startup
  (Alembic), behind Starlette's `TestClient`. Web Push goes to a recording notifier.
- **Edge**: built by `rv_edge.runtime.cli.build_simulated_runtime`, the same function
  `rv-edge simulate --cloud ... --pair-code ...` uses (simulated sources, simulated detector,
  own ByteTrack, the full analytics engine, outbox, cloud sync). It pairs with a real pairing
  code and pushes its site config on the first sync.
- **One clock**: the simulator's `ManualClock` is also the cloud's clock and the sync's
  scheduling clock. The runtime runs in manual mode (`start(threaded=False)`): every 0.2 s tick
  `runtime.step()` reads one frame per camera and runs analytics, timers and heartbeats; once
  per simulated second `runtime.sync.run_once()` does one sync round. No sleeps, no threads,
  deterministic.
- **Transport**: `conftest.CloudTransport` hands the edge's httpx requests to the `TestClient`.
  It can refuse requests (internet down) and lose a response after the cloud stored the batch.

## What it asserts

1. Pairing: the edge holds a device token for the site; the cloud lists the device.
2. Store-and-forward: a 60 s outage fills the outbox; afterwards it drains to 0.
3. Idempotent ingest: every edge event is stored exactly once; the batch whose response was
   lost comes back as duplicates; replaying a batch returns `accepted: 0`.
4. `GET /sites/{id}/live` mid-service: table states and backdated `since_ts` equal the edge's,
   occupancy and the queue are populated.
5. A `waiter_needed` alert reaches the cloud with `condition_since_ts` within 5 s of the
   simulator's true seating time, and the waiter's push (`AlertPush`) carries it.
6. "On it" in the cloud becomes an `alert_ack` command; the edge applies it within one poll and
   sends `alert.acknowledged` (`via: cloud`) back; the alert ends resolved by the staff visit.
7. `metrics/summary`, the time series (occupancy, queue, walk-aways, `queue_wait`,
   `response_time`, `response_time_p90`) and the shift report are non-empty and agree with each
   other and with the events the edge emitted.
8. The device is online with its `local_url` (the waiter app's offline link).

The analytics accuracy itself is scored separately by `rv-sim eval` (`make smoke`).
