# Restaurant Vision: Architecture (MVP)

Source of truth for every module. Decisions behind it: `docs/decisions.md`. Market context: `reports/`.

## 1. What the product does

Software that sits on a restaurant's **existing IP cameras**, runs on a computer **inside the restaurant**, and tells staff and owners in real time:

- how many diners are in the restaurant now
- the state of every table (empty, just seated and waiting for a waiter, attended, needs bussing)
- when a table needs a waiter (alert to waiters' phones, with an "on it" button)
- the entrance queue, real wait times, and people who walked away
- table dwell time and turnover
- a shift report and ROI dashboard for owners, per branch and across branches

Non-negotiables (from decisions):

- **Anonymous.** No face recognition, no re-identification across cameras or days, no appearance embeddings, no audio. Video frames live only in RAM on the edge machine. Nothing but anonymous events and numbers leaves the restaurant.
- **Table and zone level only.** No metric is attributed to an individual employee. Alert acknowledgements do not record who pressed the button.
- **Works offline.** Waiter alerts keep working over the restaurant LAN when the internet is down. The edge buffers events and syncs later.
- **Permissive licenses only.** No AGPL/GPL code or weights (no Ultralytics, no BoxMOT, no YOLOv6). Detector: YOLOX (Apache-2.0) via ONNX Runtime (MIT). Tracker: ByteTrack via `supervision` (MIT).
- **Multi-tenant SaaS.** Organization -> sites (branches) -> users with roles.
- **Hebrew (RTL) and English** in every UI.

## 2. System overview

```
 Restaurant LAN                                              Cloud (multi-tenant)
 ┌──────────────────────────────────────────────┐          ┌───────────────────────────────┐
 │ IP cameras / NVR ──RTSP substream 5fps──┐    │          │ rv_cloud (FastAPI + Postgres) │
 │                                         ▼    │  HTTPS   │  auth / orgs / sites / users  │
 │  rv_edge (existing PC or mini PC)            │ ───────► │  edge ingest (events, config) │
 │   ingest → detect → track → analytics        │  events  │  metrics / ROI / reports      │
 │   → events → outbox (SQLite) → cloud sync    │ ◄─────── │  realtime WS + Web Push       │
 │   local API :8787 (LAN)                      │ commands └──────────┬────────────────────┘
 │    ├─ edge-ui: setup wizard + local alerts   │                     │
 │    └─ WS alerts + ack (offline fallback)     │          dashboard (owners/managers)
 │                         ▲                    │          waiter PWA (phones, push)
 │   waiter phones on WiFi ┘ (offline mode)     │
 └──────────────────────────────────────────────┘
```

## 3. Repository layout

```
restaurant-vision/
  contracts/            Python pkg rv_contracts: shared pydantic models + edge protocols + JSON Schema export
  edge/                 Python pkg rv_edge: the on-site engine
    rv_edge/ingest/       FrameSource implementations: RTSP, file, simulated; ONVIF discovery
    rv_edge/vision/       Detector backends (YOLOX ONNX, simulated), tracker, privacy masks, appearance hints
    rv_edge/analytics/    zones, role classification, table state machine, queue, occupancy, alert rules
    rv_edge/runtime/      orchestrator, clock, resource governor, outbox, cloud sync, pairing, local API, CLI
  cloud/                Python pkg rv_cloud: FastAPI backend
  simulator/            Python pkg rv_sim: synthetic restaurant scenarios, ground truth, evaluation
  web/                  pnpm workspace
    packages/shared/      API client, auth, i18n (he/en, RTL), generated contract types, UI primitives
    apps/dashboard/       owners and managers (cloud)
    apps/waiter/          waiter PWA (cloud, Web Push)
    apps/edge-ui/         setup wizard + local alerts mode (served by the edge on the LAN)
  deploy/               docker-compose, Dockerfiles, systemd unit, Windows service, CI
  docs/                 decisions, architecture, api, compliance pack, runbooks
  reports/ research_notes/   market research
```

Python: one shared virtualenv at `restaurant-vision/.venv` (Python 3.11+ compatible code; dev box runs 3.13). Each Python component has its own `pyproject.toml` (hatchling) and is installed editable. Tooling: `ruff`, `mypy` (strict for `rv_contracts` and `rv_edge.analytics`), `pytest`.

Web: pnpm workspace, Vite + React 18 + TypeScript (strict), react-router, @tanstack/react-query, zustand, i18next, Tailwind CSS (logical properties for RTL), recharts, vite-plugin-pwa. Tests: vitest + Testing Library.

## 4. Design patterns used (deliberately)

| Pattern | Where |
|---|---|
| Strategy | `Detector` backends, `FrameSource` kinds, `RoleClassifier`s, `Notifier`s, `PosAdapter`s |
| Factory | build detector / source / modules from `SiteConfig` |
| Pipeline (chain) | frame → privacy mask → detect → track → appearance hints → `TrackFrame` |
| Observer / event bus | analytics modules publish `EdgeEvent`s; sinks: outbox, local WS, logger |
| State | per-table state machine (`TableStateMachine`) |
| Repository | cloud data access, every query scoped by `org_id` |
| Adapter | POS systems (phase 2), camera brands (RTSP URL templates) |
| Facade | `EdgeRuntime` wires everything behind `start()/stop()` |
| Outbox | durable store-and-forward of events from edge to cloud |

Analytics are **modules** (`AnalyticsModule` protocol). A site enables modules in `SiteConfig.modules`; plans gate them (Starter: occupancy, queue, turnover. Pro: + table states, waiter alerts, response times, branch comparison).

## 5. Contracts (`rv_contracts`)

Single source for data shapes. Pydantic v2 for anything serialized; frozen dataclasses + `typing.Protocol` for hot-path edge internals. No numpy dependency in contracts.

### 5.1 Geometry and config

- Coordinates are **normalized** `[0,1]` image coordinates per camera.
- `Point = tuple[float, float]`, `Polygon = list[Point]` (>= 3 points), `Line = tuple[Point, Point]` with an `in_direction` (`left_to_right` style unit normal sign) for crossing direction.
- `CameraConfig { camera_id, name, source: rtsp|file|simulated, anchor: foot|center, target_fps=5, privacy_masks: list[Polygon], enabled }`. RTSP URLs and credentials are **not** in `CameraConfig`; they live in the edge's local secrets file and never reach the cloud.
- `Table { table_id, label, seats, section | None }`
- `Zone { zone_id, camera_id, kind: table|queue|entrance_line|staff_area|area|privacy, polygon | None, line | None, table_id | None, primary: bool }`. Each table has exactly one `primary` zone (the camera that counts it), so overlapping cameras never double count.
- `Thresholds` (seconds unless noted, all per site):
  `seat_confirm_s=20, leave_confirm_s=45, staff_visit_min_s=5, first_visit_timeout_s=180, checkin_timeout_s=900, bussing_visit_min_s=10, bussing_timeout_s=300, walkaway_min_wait_s=60, long_queue_people=8, long_queue_wait_s=600, count_window_s=30, snapshot_interval_s=10, track_id_ttl_h=24`
- `Modules { occupancy: bool, queue: bool, tables: bool, alerts: bool }`
- `SiteConfig { schema_version, site_id, timezone, locale, cameras, tables, zones, thresholds, modules, config_version }`

### 5.2 Edge internals (hot path)

```python
@dataclass(frozen=True, slots=True)
class Detection:   box: tuple[float, float, float, float]  # normalized x1,y1,x2,y2
                   score: float

@dataclass(frozen=True, slots=True)
class AppearanceHints: uniform_score: float | None = None   # 0..1 similarity to the site's calibrated uniform color. Scalar only.

@dataclass(frozen=True, slots=True)
class Track:       track_id: str            # random, camera-scoped, rotated at least daily
                   box: tuple[float, float, float, float]
                   score: float
                   first_seen_ts: float
                   hints: AppearanceHints

@dataclass(frozen=True, slots=True)
class Frame:       camera_id: str; ts: float; index: int; width: int; height: int; image: Any  # numpy array, never persisted

@dataclass(frozen=True, slots=True)
class TrackFrame:  camera_id: str; ts: float; index: int; tracks: tuple[Track, ...]

class Clock(Protocol):          def now(self) -> float                       # epoch seconds; SimClock for tests/sim
class FrameSource(Protocol):    camera_id: str; def open(self) -> None; def read(self) -> Frame | None; def close(self) -> None
class Detector(Protocol):       def detect(self, frame: Frame) -> list[Detection]
class Tracker(Protocol):        def update(self, detections: list[Detection], frame: Frame) -> list[Track]; def reset(self) -> None
class EventSink(Protocol):      def publish(self, event: EdgeEvent) -> None
class AnalyticsModule(Protocol):
    name: str
    def configure(self, config: SiteConfig) -> None
    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]
    def on_tick(self, now: float) -> list[EdgeEvent]      # called ~1/s for timers
    def snapshot(self) -> dict[str, Any]                   # JSON-safe live state
```

### 5.3 Events (`EdgeEvent`, discriminated union on `type`)

Common fields: `event_id` (UUID v7 string, idempotency key), `site_id`, `ts` (epoch seconds, float), `schema_version`.

| type | payload |
|---|---|
| `table.state_changed` | `table_id, from_state, to_state, guest_count, session_id` |
| `table.session_closed` | `table_id, session_id, seated_at, left_at, max_guests, first_visit_delay_s \| None, visits, bussing_delay_s \| None` |
| `alert.raised` | `alert_id, kind: waiter_needed\|checkin_needed\|bussing_needed\|long_queue, table_id \| None, zone_id \| None, severity: info\|warn\|urgent` |
| `alert.acknowledged` | `alert_id, ack_at, via: cloud\|local` (no user identity, by design) |
| `alert.resolved` | `alert_id, resolved_at, reason: staff_visit\|state_change\|manual\|expired` |
| `queue.snapshot` | `zone_id, people, parties_est, longest_wait_s, avg_wait_s` |
| `queue.seated` | `zone_id, waited_s` |
| `queue.walkaway` | `zone_id, waited_s, party_size_est` |
| `occupancy.snapshot` | `guests, tables_occupied, tables_total, staff_on_floor` |
| `edge.heartbeat` | `device_id, version, cameras: [{camera_id, status: ok\|degraded\|offline, fps, last_frame_age_s}], cpu_pct, mem_mb, outbox_depth` |

Table states: `empty`, `seated` (guests present, no staff visit yet), `attended`, `needs_bussing`. (`waiting_for_check` arrives in phase 2 with POS.)

`rv_contracts` exposes `export_json_schema(path)` producing `web/packages/shared/src/contracts/schema.json`, and TS types are generated from it (`json-schema-to-typescript`).

## 6. Edge (`rv_edge`)

### 6.1 Vision pipeline (per camera, own thread)

1. `FrameSource`: `RtspSource` (OpenCV/FFmpeg, substream, reconnect with backoff, drops to target fps), `FileSource` (mp4 loop, honors fps, used for demos), `SimulatedSource` (from `rv_sim`, frames carry ground-truth detections, no pixels).
2. Privacy masks: polygons are filled black **before** detection.
3. `Detector`: `YoloxOnnxDetector` (ONNX Runtime; OpenVINO execution provider when available on Intel; CPU fallback; person class only; letterbox + NMS), `SimulatedDetector` (passes ground truth with configurable noise). Factory chooses from config. Models fetched by `scripts/fetch_models.py` (YOLOX-tiny/-s ONNX from the official Megvii release, SHA-256 pinned) into `edge/models/` (git-ignored).
4. `ByteTrackTracker` wrapping `supervision.ByteTrack`; IDs mapped to random camera-scoped strings, the mapping table rotates at `track_id_ttl_h`.
5. Appearance hints: optional uniform-color score from an HSV histogram of the torso crop vs the site's calibrated uniform. A scalar, computed and discarded in RAM.
6. Output: `TrackFrame` to the analytics queue.

`ResourceGovernor`: lowers process priority (nice / BelowNormal on Windows), caps inference threads, and adaptively skips frames when CPU > 70%, so a shared office or POS PC stays responsive.

### 6.2 Analytics (single thread, deterministic, pure logic)

- `ZoneIndex`: point-in-polygon and line-crossing per camera; anchor point is box bottom-center (`foot`) or center (`center`) per camera.
- `RoleClassifier` (Strategy, combined by weighted vote, sticky per track): `StaffZoneOrigin` (first seen in a `staff_area` → staff), `UniformColor` (uses `hints.uniform_score`), `MovementPattern` (visits >= 2 table zones within 10 min, or short standing visits → staff). Output role: `guest | staff | unknown`.
- `TableModule` (State pattern, one machine per table, primary zone only):
  - guests present = smoothed count of guest tracks in the zone (rolling median over `count_window_s`, tolerant to short occlusion dropouts).
  - `empty` → `seated` when guests present continuously `seat_confirm_s`. Opens a session.
  - `seated` → `attended` on a staff visit (staff track in zone for `staff_visit_min_s`).
  - Alert `waiter_needed` if `seated` for `first_visit_timeout_s` with no visit. Alert `checkin_needed` if `attended` and no visit for `checkin_timeout_s`.
  - `seated|attended` → `needs_bussing` when no guests for `leave_confirm_s`. Closes the session (emits `table.session_closed`).
  - `needs_bussing` → `empty` on a staff visit of `bussing_visit_min_s`. Alert `bussing_needed` after `bussing_timeout_s`.
  - Open alerts resolve automatically on the matching staff visit or state change.
- `QueueModule`: tracks inside `queue` zones with entered time; crossing an `entrance_line` inward = seated (`queue.seated` with wait), leaving outward after `walkaway_min_wait_s` without being seated = `queue.walkaway`. Party estimate groups tracks that entered within 5 s and close together. `long_queue` alert by people or wait thresholds. Snapshots every `snapshot_interval_s`.
- `OccupancyModule`: guests = sum of table guest counts + guest tracks in `area` zones (bars, standing); staff on floor; snapshot every `snapshot_interval_s`.
- `AlertManager`: owns alert lifecycle on the edge (source of truth, works offline): raise, de-duplicate, apply acks from cloud or local, resolve.

### 6.3 Runtime

- `EdgeRuntime` (Facade): loads config, builds sources/detectors/modules via factories, runs camera threads + analytics loop + tick timer, publishes events to sinks.
- `Outbox` (SQLite, WAL): every event persisted before send; `CloudSync` sends batches (<= 500) to `POST /api/v1/edge/events`, exponential backoff, marks delivered; polls `GET /api/v1/edge/commands` every 2 s for acks/config changes; fetches config with ETag.
- Pairing: `rv-edge pair --code ABC123 --cloud https://...` → `POST /api/v1/edge/pair` → device token saved in the local secrets file (0600 / user-only ACL).
- Local API (FastAPI on `0.0.0.0:8787`, LAN only): serves `edge-ui` static build, `GET /local/health`, `GET /local/state`, `WS /local/ws` (events), `POST /local/alerts/{id}/ack`, and setup endpoints protected by a local setup PIN: cameras (list, ONVIF discover, add/update with RTSP URL + credentials stored locally), `GET /local/cameras/{id}/snapshot.jpg` (people blurred, generated on demand, never stored), zones and tables (`GET/PUT /local/config` → pushed to cloud), uniform calibration, `GET /local/coverage` (tables without a primary zone).
- CLI `rv-edge`: `run`, `pair`, `discover`, `check` (system capacity estimate: how many cameras this PC can handle), `simulate --scenario ...`.
- Packaging: Linux systemd unit + Dockerfile (mini PC), Windows service (pywin32 service wrapper + PowerShell installer), PyInstaller spec for a single installer later.

## 7. Cloud (`rv_cloud`)

FastAPI, SQLAlchemy 2.0 + Alembic, Postgres (SQLite for tests), PyJWT, argon2-cffi, pywebpush. All timestamps UTC; reports in site timezone.

### 7.1 Data model

`Organization(id, name, plan)`, `Site(id, org_id, name, timezone, locale, currency, avg_check_per_guest, config_json, config_version)`, `User(id, org_id, email, password_hash, name, locale)`, `Membership(user_id, org_id, role: owner|manager|waiter, site_id | None)`, `Device(id, site_id, token_hash, last_seen_at, version)`, `PairingCode(code, site_id, expires_at)`, `Event(event_id PK, site_id, type, ts, payload_json)` (raw, idempotent), `TableSession(...)`, `Alert(alert_id, site_id, kind, table_id, raised_at, acked_at, resolved_at, resolve_reason)`, `QueueEvent(...)`, `MetricSnapshot(site_id, ts, kind, payload)`, `PushSubscription(id, site_id, endpoint, keys_json)`, `Command(id, site_id, kind, payload, created_at)`.

Every repository method takes the caller's tenancy scope; cross-tenant access is impossible by construction and covered by tests.

### 7.2 Roles

- `owner`: all sites in the org, settings, users, devices, reports, branch comparison.
- `manager`: one site: live view, alerts, reports, thresholds.
- `waiter`: one site: open alerts and ack only.

### 7.3 REST API (`/api/v1`, JWT bearer for users, device token for edges)

Auth and tenancy
- `POST /auth/signup` (creates org + owner) · `POST /auth/login` · `POST /auth/refresh` · `GET /me`
- `GET /orgs/{org_id}` · `GET|POST /orgs/{org_id}/sites` · `GET|PATCH /sites/{site_id}` (name, timezone, locale, currency, avg_check_per_guest, thresholds, modules)
- `GET|POST /orgs/{org_id}/users` · `PATCH|DELETE /orgs/{org_id}/users/{user_id}`
- `POST /sites/{site_id}/devices/pairing-code` · `GET /sites/{site_id}/devices`

Edge
- `POST /edge/pair {code}` → `{device_id, site_id, token}`
- `POST /edge/events {events: EdgeEvent[]}` → `{accepted, duplicates}`
- `GET /edge/config` (ETag) · `PUT /edge/config` (zones/tables saved from edge-ui)
- `GET /edge/commands?after=<cursor>` → acks and config-changed notices

Live and alerts
- `GET /sites/{site_id}/config` · `GET /sites/{site_id}/live` (tables, occupancy, queue, open alerts, device health)
- `GET /sites/{site_id}/alerts?status=open|all&from&to` · `POST /alerts/{alert_id}/ack`
- `WS /ws?token=&site_id=` (live events for dashboards and the waiter app)

Metrics and reports
- `GET /sites/{site_id}/metrics/summary?from&to` → KPIs: guests served, sessions, avg dwell, turnover per table, waiter response p50/p90, bussing delay p50, queue avg/max wait, walkaways, estimated lost revenue
- `GET /sites/{site_id}/metrics/timeseries?metric=occupancy|queue|walkaways|response_time&bucket=15m&from&to`
- `GET /sites/{site_id}/tables/stats?from&to`
- `GET /sites/{site_id}/reports/shift?date=YYYY-MM-DD` → shift report + ROI block
- `GET /orgs/{org_id}/reports/compare?from&to` (owners)

Push
- `GET /push/vapid-public-key` · `POST /push/subscriptions` · `DELETE /push/subscriptions/{id}`

Health: `GET /healthz`.

### 7.4 ROI model (all labeled as estimates in the UI)

- Lost revenue from walkaways = walkaways x party_size_est x `avg_check_per_guest`.
- Response time improvement = baseline (first 7 days after install) p50 minus current p50 for `waiter_needed` raised → resolved.
- Extra covers from faster turns are counted only in hours where the queue was non-empty (demand above capacity), per Cornell revenue-management findings.

### 7.5 Integrations (phase 2, interfaces now)

`PosAdapter` protocol (`on_check_opened`, `on_check_closed`, table mapping POS table id ↔ `table_id`) with `NullPosAdapter`; `Notifier` protocol with `WebPushNotifier` (MVP) and room for WhatsApp/SMS/pagers.

## 8. Web

- `packages/shared`: typed API client (fetch + react-query hooks), auth store (zustand, refresh tokens), i18n (i18next; `he` default with `dir="rtl"`, `en`), generated contract types, small UI kit (Button, Card, Badge, StatTile, TableStateChip, Layout with RTL-aware nav), formatting helpers (durations, currency per site).
- `apps/dashboard`: Login · Org overview (site cards with live occupancy and open alerts) · Site live floor (SVG floor plan of tables colored by state, guest counts, timers, queue panel, open alerts, device health) · Analytics (occupancy by hour, queue and walkaways, turnover and dwell per table, response time distribution) · Shift report + ROI · Settings (site details, thresholds, modules, users and roles, devices + pairing code) · Compliance (download signage and staff notice templates).
- `apps/waiter`: installable PWA. Login, pick site. List of open alerts by age with table label and elapsed timer, big "On it" button, sound + vibration, Web Push via service worker. If the cloud is unreachable, shows a banner linking to the local edge URL (`http://<edge-ip>:8787/local-alerts`).
- `apps/edge-ui` (served by the edge over the LAN): setup wizard (setup PIN → pair with cloud → discover/add cameras → snapshot with people blurred → draw table polygons, assign table labels and seats → queue zone and entrance line → staff zone → privacy masks → uniform calibration → coverage check listing uncovered tables and recommending a ceiling camera → live test view with boxes over the blurred snapshot) and a local alerts page for offline mode.

Floor plan geometry: the dashboard shows a schematic floor plan (tables positioned on a grid editable in Settings), not camera images. Camera imagery never leaves the LAN.

## 9. Simulator (`rv_sim`)

- Scenario YAML: cameras, tables (with polygons), queue zone, entrance line, staff zone, arrival rate profile per hour, party sizes, waiter response distribution, dwell distribution, walk-away behavior, detector noise (jitter, missed detections for seated guests, false positives).
- Produces per-camera `Frame`s with ground-truth detections attached (no pixels needed) for `SimulatedSource` + `SimulatedDetector`, plus a ground-truth event log.
- `SimClock` with acceleration (e.g. 20x) for live demos.
- `rv-sim eval`: runs the edge analytics on a scenario and scores emitted events against ground truth (state transitions, alert timing, walkaway precision/recall, occupancy MAE). This is how analytics accuracy is tracked before a real pilot.

## 10. Privacy by design (enforced in code and tests)

- No `cv2.imwrite`, `VideoWriter`, or frame persistence anywhere in `rv_edge` except the in-memory blurred setup snapshot; a test greps for forbidden calls.
- Privacy masks applied before detection; restroom/staff-room masks suggested in the setup wizard.
- Track IDs random and camera-scoped, rotated daily; no cross-camera matching except zone geometry and timing; no embeddings.
- Cloud receives only events defined in `rv_contracts`; payloads contain zone/table ids, counts, durations.
- Acks carry no user identity; no per-employee metric exists in the schema.
- Compliance pack in `docs/compliance/`: signage (he/en), staff notice (he/en, includes NSW/ACT 14-day template), non-identification statement, DPIA template, DPA outline.

## 11. Quality gates

- Python: `ruff check`, `mypy` (strict on contracts and analytics), `pytest` with coverage >= 80% on `rv_edge.analytics` and `rv_cloud`.
- Web: `tsc --noEmit`, `eslint`, `vitest`.
- End-to-end: docker-compose (postgres + cloud + web + edge with a simulator scenario) and a Python e2e test that runs the edge against the cloud app and asserts alerts, acks and metrics.
- CI: `.github/workflows/restaurant-vision.yml`, path-filtered to `restaurant-vision/**`.

## 11.1 Build plan (sub-agents)

| Wave | Module | Owns |
|---|---|---|
| 0 | contracts | `contracts/` |
| 1 | edge vision | `edge/rv_edge/ingest`, `edge/rv_edge/vision`, `edge/scripts`, `edge/tests/vision` |
| 1 | edge analytics | `edge/rv_edge/analytics`, `edge/tests/analytics` |
| 1 | edge runtime | `edge/rv_edge/runtime`, `edge/tests/runtime` |
| 1 | cloud | `cloud/` |
| 1 | simulator | `simulator/` |
| 1 | web core | `web/` (workspace, shared, dashboard, waiter) |
| 2 | edge setup UI | `web/apps/edge-ui` |
| 2 | deploy + docs | `deploy/`, `docs/compliance`, `docs/runbooks`, CI |
| 3 | integration | e2e wiring, fixes across modules, demo |
