# rv_cloud: Restaurant Vision cloud backend

Multi-tenant FastAPI backend (architecture section 7): auth and tenancy, edge ingest and
projections, live view, alerts and acks, edge commands and config sync, metrics, shift report
and ROI, WebSocket fan-out and Web Push. Request and response bodies are the `rv_contracts`
models; see `contracts/rv_contracts/api.py` for the endpoint-to-model map.

## Run

```bash
# from restaurant-vision/ (shared venv)
.venv/bin/python -m rv_cloud.tools.seed_demo          # migrate + demo tenant + pairing codes
.venv/bin/uvicorn rv_cloud.main:app --reload --port 8000
# API docs: http://localhost:8000/api/v1/docs   health: /healthz (also /api/v1/healthz)
```

The seed tool is idempotent. It creates the org "Demo Restaurant Group" with
`demo@example.com`, `manager@example.com` (Tel Aviv) and `waiter@example.com` (Tel Aviv), all
with password `demo-password-123`. It also creates the sites "Tel Aviv" (Asia/Jerusalem, ILS,
he) and "Sydney" (Australia/Sydney, AUD, en), each with the sample 8-table config and a floor
plan. Every run prints a fresh 24-hour pairing code per site.

Migrations: `alembic upgrade head` (run from `cloud/`; uses `RV_DATABASE_URL`, or
`-x url=...`). The app also migrates on startup unless `RV_AUTO_MIGRATE=false`. Use that
setting for multi-worker deployments and run the migration as a release step.

Tests: `.venv/bin/python -m pytest --cov=rv_cloud cloud/tests` · lint: `ruff check
cloud/rv_cloud cloud/tests` · types: `cd cloud && mypy rv_cloud` (strict).

## Settings (`RV_*` environment variables or `.env`)

| Variable | Default | Notes |
|---|---|---|
| `RV_DATABASE_URL` | `sqlite:///./rv_cloud.sqlite3` | Postgres: `postgresql+psycopg://user:pass@host/db` |
| `RV_ENVIRONMENT` | `dev` | `production` refuses the default JWT secret |
| `RV_JWT_SECRET` | dev-only value | HS256 signing key |
| `RV_ACCESS_TOKEN_TTL_S` / `RV_REFRESH_TOKEN_TTL_S` | 900 / 2592000 | |
| `RV_VAPID_PRIVATE_KEY`, `RV_VAPID_PUBLIC_KEY`, `RV_VAPID_SUBJECT` | unset | `python -m rv_cloud.tools.gen_vapid`; Web Push is disabled without them (vapid-public-key answers 503) |
| `RV_CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | comma list or JSON list |
| `RV_BUSINESS_DAY_START_HOUR` | 5 | shift report day boundary, site-local |
| `RV_DASHBOARD_DIR`, `RV_WAITER_DIR` | unset | built SPAs served at `/` and `/waiter` (SPA fallback; build the waiter app with base `/waiter/`) |
| `RV_PAIRING_CODE_TTL_S` | 600 | |
| `RV_LOGIN_MAX_ATTEMPTS` / `RV_LOGIN_WINDOW_S` | 5 / 300 | failed logins per (IP, email) |
| `RV_PAIR_MAX_ATTEMPTS` / `RV_PAIR_WINDOW_S` | 10 / 60 | failed pairings per IP |
| `RV_AUTO_MIGRATE`, `RV_LOG_LEVEL`, `RV_LOG_JSON`, `RV_SIGNUP_PLAN` | `true`, `INFO`, `true`, `pro` | |
| `RV_RETENTION_RAW_EVENTS_DAYS` | 90 | raw edge events, processed edge commands (and expired pairing codes) are deleted after this |
| `RV_RETENTION_METRICS_DAYS` | 400 | metric snapshots, queue facts, alerts and table sessions are deleted after this |
| `RV_RETENTION_INTERVAL_S` | 21600 | how often the app applies retention (first run 1 min after startup); `0` = off, use `python -m rv_cloud.tools.retention` from cron |

Behind a reverse proxy, run uvicorn with `--proxy-headers` so rate limits see client IPs.

## Layout

```
rv_cloud/
  api/          routers (thin) + deps.py: current_user, require_role, require_site_access, current_device
  services/     use cases; one commit per call, then side effects (broadcast, push)
  repositories/ SQLAlchemy queries, each bound to an org_id or SiteScope (tenancy by construction)
  db/           ORM models, engine/session, programmatic migrations; migrations/ = Alembic
  metrics/      pure KPI, time-series, ROI and time-bucket functions
  realtime/     EventBroker protocol + InMemoryBroker (Redis sketch in broker.py docstring)
  push/         Notifier protocol + WebPushNotifier (pywebpush) + NullNotifier
  integrations/ PosAdapter protocol + NullPosAdapter (phase 2)
  tools/        seed_demo, gen_vapid, retention (data retention CLI, also run periodically)
```

## Integration notes

**Users (dashboard, waiter app).** `POST /api/v1/auth/login` returns a `TokenPair`. Send
`Authorization: Bearer <access_token>` (15 min). On 401, call `POST /api/v1/auth/refresh` with
`{refresh_token}` (30 days), which returns a new pair. A password change, user deletion or
revoked membership takes effect immediately. Unknown or cross-tenant ids answer 404. A
known site without the needed role answers 403. Roles: an owner covers all sites; a manager
has one site (live, alerts, reports, thresholds, floor plan); a waiter has one site
(`GET /sites/{id}/alerts?status=open`, `POST /alerts/{id}/ack`, push, WS, and
`GET /sites/{id}/devices` reduced to `device_id`, `online`, `last_seen_at` and `local_url` for
the offline link).

**WebSocket.** `WS /api/v1/ws?token=<access JWT>&site_id=<id>`. Each message is one JSON
object: an `EdgeEvent` or a `LiveSnapshotMessage` (`{"type": "live.snapshot", "snapshot":
LiveSnapshot}`); dispatch on `type`. Owners and managers get one `live.snapshot` right after
connecting (so a reconnect re-syncs by itself), then events. A cloud ack also produces an
`alert.acknowledged` with `via: "cloud"`. Waiters receive only `alert.*` events. Close codes
(`WsCloseCode`) are 4400 (missing params), 4401 (bad or expired token: refresh and reconnect)
and 4403 (no access). The token is checked only at connect.

**Edge.** The flow is:

1. `POST /api/v1/edge/pair {code}` returns 201 with `{device_id, site_id, token}`.
2. Send `Authorization: Bearer <token>` (starts with `rvd_`) on every `/edge/*` call.
3. `POST /edge/events` takes at most 500 events per call and returns `{accepted, duplicates}`.
   It is idempotent on `event_id`. Any event whose `site_id` is not the device's site rejects
   the whole batch with **422** (as does a schema error). A bad or revoked token gives 401.
4. `GET /edge/config` returns `ETag: "<config_version>"`. Send `If-None-Match` to get 304
   when the config is unchanged.
5. `PUT /edge/config` stores `cameras`, `tables` and `zones` only. `timezone`, `locale`,
   `thresholds` and `modules` belong to the dashboard and are ignored. The call returns the
   stored config and the new ETag (the version bumps only when something changed). A
   `site_id` mismatch returns 422.
6. `GET /edge/commands?after=<cursor>&limit=` returns `alert_ack` and `config_changed`
   commands, oldest first. Omit `after` on the first poll. Persist the returned cursor; it is
   echoed back unchanged when nothing is new. A cursor from another site restarts from 0.

Heartbeats: `last_seen_at` is the cloud receive time of the latest `edge.heartbeat` from that
device token, and the device is online within `DEVICE_OFFLINE_AFTER_S` (90 s). The cloud
stores health under the authenticated device, including the edge's LAN address
(`DeviceStatus.local_url`, for the waiter app's offline link). The heartbeat's `device_id`
equals the paired `device_id`.

Backdated times (contracts 1.1): `TableStateChanged.since_ts` and
`AlertRaised.condition_since_ts` carry when a state or condition really began (the edge
confirms with a delay). The live view's `TableLive.since_ts`, the session's `seated_at` and
`AlertView.condition_since_ts` use them (falling back to `ts` for 1.0 edges); transitions are
still ordered by `ts`.

**Push.** The browser gets `GET /api/v1/push/vapid-public-key`, subscribes, then calls
`POST /api/v1/push/subscriptions {site_id, endpoint, keys}`. A newly raised alert that is
still unresolved at the end of its ingest batch sends an `AlertPush` payload:
`{alert_id, site_id, kind, severity, table_label, raised_at, condition_since_ts}`, with no
PII. Subscriptions that answer 404 or 410 are deleted.

## Design notes and limits

- Timestamps are stored as epoch seconds (`DOUBLE`), and reports are computed in the site's
  time zone.
- Projections run in the ingest transaction. The latest-state rows (table state, occupancy,
  queue, heartbeat) are replaced only by newer `ts`, so late, buffered events are safe.
  Acks or resolutions of unknown alerts are ignored, so ordering across batches is assumed.
- The bussing delay is derived from `needs_bussing -> empty` with the same `session_id`,
  whichever event arrives first.
- Commands get a per-site `seq` under a site-row lock, so pollers never skip one on Postgres.
- `InMemoryBroker` and the rate limiters are per process. Multi-worker deployments need a
  shared broker (Redis) and shared limits. See the `realtime/broker.py` docstring.
- Plans: Starter sites start with `tables`/`alerts` modules off, and cannot enable them or
  use branch comparison (403).
- `DELETE /sites/{id}/devices/{device_id}` (owner) unpairs a device. This route is an
  addition beyond 7.3.
- Time series metrics: `occupancy`, `queue`, `walkaways`, `response_time` (p50),
  `response_time_p90` and `queue_wait` (mean `queue.seated` wait per bucket, by seating time).
- Data retention: see the settings above and `rv_cloud/services/retention.py`. Latest-state
  rows are kept; the ROI response-time baseline ages out with `RV_RETENTION_METRICS_DAYS`.
