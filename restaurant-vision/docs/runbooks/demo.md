# Runbook: run the demo

Three ways to see Restaurant Vision working, from lightest to fullest. All use a simulated
restaurant (`simulator/scenarios/`), so no cameras are needed.

| | Needs | Starts |
|---|---|---|
| A. UI only (mock backend) | Node 22 + pnpm | Dashboard and waiter app on a fake in-browser backend |
| B. Local demo | Python 3.11+, Node 22 + pnpm | Cloud (uvicorn + SQLite), simulated edge, web dev servers |
| C. Docker demo | Docker with Compose v2.24+ | Postgres, cloud image (API + built dashboard + waiter PWA), simulated edge image |

Demo logins (all with password `demo-password-123`):

| User | Role | Sees |
|---|---|---|
| `demo@example.com` | owner | both sites (Tel Aviv, Sydney), settings, reports, branch comparison |
| `manager@example.com` | manager | Tel Aviv: live floor, alerts, reports, thresholds |
| `waiter@example.com` | waiter | Tel Aviv alerts, "On it" button |

The simulated edge is paired with **Tel Aviv** and plays `demo_dinner.yaml`: a 2-hour dinner
(19:00 to 21:00) with about 31 parties, a queue that peaks around 12 people, a few slow first
visits (`waiter_needed`), slow bussing (`bussing_needed`) and walk-aways. At speed 20 it takes
about 6 minutes.

## A. UI only

```bash
cd web && pnpm install && pnpm dev:mock
# dashboard http://localhost:5173  waiter http://localhost:5174  (mock password: demo1234)
```

## B. Local demo (no Docker)

```bash
cd restaurant-vision
make setup          # once: .venv with the 4 packages, pnpm install, YOLOX-tiny model
make demo-local     # or: deploy/scripts/demo-local.sh [--no-web] [--speed 40] [--fresh] [--verbose]
```

The script seeds the demo tenant into a SQLite file in `${TMPDIR:-/tmp}/rv-demo`, starts the
cloud on :8000, pairs a simulated edge with Tel Aviv (fresh pairing every run), starts it on
:8787, starts the dashboard (:5173) and waiter (:5174) dev servers, and prints:

```
  Dashboard     http://localhost:5173/
  Waiter PWA    http://localhost:5174/
  Cloud API     http://localhost:8000/api/v1/docs
  Edge LAN API  http://localhost:8787/local/state
```

Logs from all three are prefixed `[cloud]`, `[edge]`, `[web]`; Ctrl-C stops everything. Run it
again to replay the dinner; `--fresh` also resets the database.

## C. Docker demo

```bash
cd restaurant-vision
deploy/scripts/demo-up.sh          # or: make up
deploy/scripts/demo-down.sh        # or: make down; add --purge to delete the database
```

`demo-up.sh` builds both images, writes `deploy/.env` with a fresh JWT secret and VAPID keys
(first run only; git-ignored), starts Postgres and the cloud and waits until healthy, runs the
seed inside the cloud container, takes the Tel Aviv pairing code from its output, and starts
`edge-sim` with:

```
rv-edge simulate --scenario simulator/scenarios/demo_dinner.yaml --speed 20 \
  --cloud http://cloud:8000 --pair-code <code>
```

Then it prints:

```
  Dashboard     http://localhost:8000/
  Waiter PWA    http://localhost:8000/waiter/
  API docs      http://localhost:8000/api/v1/docs
  Edge LAN API  http://localhost:8787/local/health
```

Options: `--speed N`, `--scenario simulator/scenarios/peak_friday.yaml`, `--site Sydney`,
`--no-build`. Ports: `RV_CLOUD_PORT`, `RV_EDGE_PORT`. Behind a registry mirror (or when Docker
Hub rate-limits): `export RV_PYTHON_IMAGE=mirror.gcr.io/library/python:3.12-slim
RV_NODE_IMAGE=mirror.gcr.io/library/node:22-slim RV_POSTGRES_IMAGE=mirror.gcr.io/library/postgres:16`.

## Demo script (5 minutes)

1. **Dashboard, owner** (`demo@example.com`): the org overview shows Tel Aviv filling up.
2. **Live floor**: tables turn from empty to seated (waiting for a first visit) to attended,
   then needs-clearing; guest counts and timers per table; the queue panel at the door.
3. **Waiter app** on a phone-sized window (`waiter@example.com`): a `waiter_needed` alert
   arrives (push if allowed); tap **On it**. The dashboard shows it acknowledged, with no name
   attached. Point this out: acknowledgements carry no identity.
4. **Offline mode**: open `http://localhost:8787/local-alerts` (when edge-ui is built): the same
   alerts straight from the edge, which is what waiters use if the internet drops.
5. **Reports**: shift report and ROI for the scenario date (`demo_dinner`: 2026-11-06), with
   walk-aways converted to estimated lost revenue.
6. **Compliance page**: the signage and staff-notice templates (PDF downloads in the Docker
   demo).
7. **Privacy**: `http://localhost:8787/local/state` is everything the edge knows: tables, counts,
   queues, alerts. No images, no people.

## Scenarios

| File | Use |
|---|---|
| `demo_dinner.yaml` | The default demo (2 h, moderately busy, 6 min at speed 20) |
| `peak_friday.yaml` | Stress: demand far above capacity, long queue alerts, many walk-aways |
| `quiet_lunch.yaml` | Few guests, no queue: shows there are no false alarms |
| `smoke.yaml` | 10-minute scripted CI scenario: `rv-sim eval simulator/scenarios/smoke.yaml` |

`rv-sim eval <scenario>` scores the analytics against the simulator's ground truth (sessions,
alerts, walk-aways, occupancy) without any server.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no pairing code found` | The seed output changed or the site name differs; run the seed by hand: `docker compose -f deploy/docker-compose.yml exec cloud python -m rv_cloud.tools.seed_demo` |
| edge-sim exits with `pairing failed` | Codes work once and expire; re-run `demo-up.sh` (it seeds a fresh code). |
| Dashboard empty after a re-run | The old device is offline and a new one is paired; the live view follows the newest events. |
| Port already in use | Set `RV_CLOUD_PORT` / `RV_EDGE_PORT`; the Vite ports 5173/5174 are fixed (stop the other server). |
| Docker build fails at `pnpm install --frozen-lockfile` | `web/pnpm-lock.yaml` is out of date with a `package.json`; run `pnpm install` in `web/` and commit the lockfile. |
| `429 Too Many Requests` pulling base images | Docker Hub rate limit: use the mirror variables above or `docker login`. |
| Push notifications do not arrive | Browsers allow push only on HTTPS or `localhost`; use `localhost`, allow notifications, and check that `deploy/.env` has the VAPID keys. |
