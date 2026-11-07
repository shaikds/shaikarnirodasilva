# Restaurant Vision

Anonymous AI analytics on a restaurant's **existing IP cameras**. Software on a PC inside the
restaurant watches the camera feeds and tells staff and owners, in real time:

- which tables are seated and waiting for a waiter, attended, or need clearing, with alerts to
  waiters' phones and an "On it" button;
- the entrance queue, real waiting times and walk-aways;
- how many guests are in, table dwell time and turnover;
- shift reports and an ROI view per branch and across branches.

It is **anonymous by design**: no face recognition, no recording, no sound, and nothing measured
per employee. Video stays in the restaurant PC's memory; only anonymous table and zone events
reach the cloud. The UIs are in Hebrew (RTL) and English.

**Status:** MVP, not yet piloted. Everything runs end to end on simulated restaurants
(`simulator/`); no real-restaurant accuracy figures exist yet. See [Status](#status).

## Architecture

```
 Restaurant LAN                                       Cloud (multi-tenant)
 IP cameras / NVR ──RTSP 5 fps──► rv_edge (PC)  ──HTTPS events──►  rv_cloud (FastAPI + Postgres)
                                  ingest → detect → track             auth, orgs, sites, users
                                  → analytics → outbox                metrics, reports, ROI
                                  LAN API :8787 (setup wizard,  ◄──── commands, config
                                  offline alerts)                     realtime WS + Web Push
                                        ▲                                   │
                     waiter phones (offline mode)          dashboard (owners/managers), waiter PWA
```

- **Edge** (`rv_edge`): runs on an existing always-on back-office PC (Windows or Linux) or a
  mini PC. YOLOX-tiny person detection on ONNX Runtime, ByteTrack with random rotating IDs,
  per-table state machines, queue and occupancy modules, a durable SQLite outbox, and a LAN API
  that keeps waiter alerts working when the internet is down.
- **Cloud** (`rv_cloud`): multi-tenant FastAPI + Postgres. Organisations, sites, roles (owner,
  manager, waiter), edge ingest, live view, alerts, metrics, shift report and ROI, WebSocket
  fan-out and Web Push.
- **Web** (`web/`): pnpm workspace with the owners' dashboard, the waiter PWA and edge-ui (the
  setup wizard the edge serves on the LAN).

Read more: [docs/architecture.md](docs/architecture.md) (the source of truth),
[docs/decisions.md](docs/decisions.md), and the market research in `reports/`.

## Repository map

| Path | What |
|---|---|
| `contracts/` | `rv_contracts`: shared pydantic models, edge protocols, JSON Schema export for the web types |
| `edge/` | `rv_edge`: ingest, vision, analytics, runtime, `rv-edge` CLI; `scripts/fetch_models.py` |
| `cloud/` | `rv_cloud`: FastAPI backend, Alembic migrations, `seed_demo` and `gen_vapid` tools ([README](cloud/README.md)) |
| `simulator/` | `rv_sim`: synthetic restaurant scenarios, ground truth and `rv-sim eval` ([README](simulator/README.md)) |
| `web/` | `apps/dashboard`, `apps/waiter`, `apps/edge-ui`, `packages/shared` |
| `deploy/` | Dockerfiles, `docker-compose.yml`, demo scripts, edge installers for Linux and Windows ([edge packaging](deploy/edge/README.md)) |
| `docs/compliance/` | Bilingual compliance pack: signage, privacy notice, staff policy and NSW/ACT notice, non-identification statement, DPIA, DPA ([index](docs/compliance/README.md)) |
| `docs/runbooks/` | [Install the edge](docs/runbooks/install-edge.md), [pilot checklist](docs/runbooks/pilot-checklist.md), [demo](docs/runbooks/demo.md), [operations](docs/runbooks/operations.md) |
| `reports/`, `research_notes/` | Market research (Israel, USA, Australia) |
| `Makefile` | Developer tasks: `make help` |
| `../.github/workflows/restaurant-vision.yml` | CI: Python (3.11, 3.13), web, smoke |

## Quickstart: the demo

**Docker** (Postgres, cloud with the built dashboard and waiter app, and a simulated edge):

```bash
cd restaurant-vision
deploy/scripts/demo-up.sh       # builds, seeds, pairs the simulated edge, prints URLs
# Dashboard http://localhost:8000/   Waiter http://localhost:8000/waiter/
deploy/scripts/demo-down.sh     # --purge also deletes the database
```

**Without Docker** (Python 3.11+, Node 22 + pnpm):

```bash
cd restaurant-vision
make setup        # .venv with the 4 packages editable, pnpm install, YOLOX-tiny model
make demo-local   # cloud on :8000 (SQLite), simulated edge on :8787, dashboard :5173, waiter :5174
```

Logins (password `demo-password-123`): `demo@example.com` (owner), `manager@example.com`,
`waiter@example.com`. The simulated edge plays a 2-hour dinner at Tel Aviv in about 6 minutes.
Details and a 5-minute demo script: [docs/runbooks/demo.md](docs/runbooks/demo.md).

Other tasks: `make test`, `make lint`, `make smoke` (analytics accuracy on the CI scenario),
`make models MODEL=s`, `make up` / `make down` (Docker demo).

## Privacy summary

Enforced in code and tests (architecture section 10;
[non-identification statement](docs/compliance/non-identification-statement-en.md)):

- **No video leaves the restaurant and none is stored.** Frames live only in the edge PC's RAM;
  a test fails the build if frame-writing or face-recognition APIs appear in `rv_edge`.
- **No identification.** Person boxes only; privacy masks blacked out before detection; motion-only
  tracking with random, camera-scoped IDs rotated at least daily; no appearance embeddings; no
  cross-camera or cross-day matching. The one appearance cue is a single "uniform colour"
  number to tell staff from guests, computed and discarded in RAM.
- **Anonymous outputs.** The cloud accepts only `rv_contracts` events (table states, counts,
  durations); unknown fields are rejected.
- **Table and zone level only.** No per-employee metric exists; "On it" acknowledgements carry no
  identity. Staff policy templates follow Israeli guidance 5/2017 and *Isakov*, and NSW/ACT
  14-day notice rules.
- **Credentials stay local.** Camera RTSP credentials live in the edge's owner-only secrets file.

The [compliance pack](docs/compliance/README.md) (Hebrew and English) gives restaurants the
signs, notices, DPIA and DPA they need. Templates, not legal advice.

## Status

| Part | State |
|---|---|
| Contracts, edge (vision, analytics, runtime), cloud, simulator | Implemented with tests (contracts 175, edge 266, cloud 73, simulator 51 at the time of writing); analytics and cloud coverage above 80% |
| Web: dashboard, waiter PWA | In progress |
| Web: edge-ui setup wizard | In progress |
| Packaging | Docker images, compose demo, Linux systemd installer, Windows service installer. A single-file installer (PyInstaller) is a later step |
| Accuracy | Measured on simulated scenarios only (`rv-sim eval`); first real numbers come from the pilot's week 0 coverage check and baseline week |
| POS integrations, WhatsApp/SMS alerts | Phase 2 (interfaces exist) |
