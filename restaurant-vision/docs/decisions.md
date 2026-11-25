# Restaurant Vision — Decisions Log

## Round 1 (answered)

| Topic | Decision |
|---|---|
| Audience | Product for many restaurants (multi-tenant), starting with a single-restaurant pilot |
| Cameras | Existing IP cameras (RTSP / NVR: Hikvision, Dahua, Provision, etc.) |
| Processing | Edge computer inside the restaurant + cloud. Video never leaves the site; only numeric data goes up |
| Privacy | Fully anonymous: no face recognition, no stored video, only counts and events |

## Next

1. Market research: Israel, USA, Australia
2. Rounds 2-4 of questions (informed by research)
3. Architecture plan
4. Build (sub-agents per module)

## Founder input (during research)

- Most restaurants already have computers and cameras.
  - Implication: software-first. The edge agent should install on an existing PC (likely Windows), with a dedicated box only as a fallback/premium option.
  - To verify in round 2: which PCs (POS terminal vs back-office PC), OS, always-on, specs, and whether the NVR is reachable on the same LAN.

## Round 2: product (answered)

| Topic | Decision |
|---|---|
| Staff metrics | Table and zone level only. No per-waiter attribution |
| MVP features | All four: table state + waiter-needed alerts; entrance queue + walk-aways; diner count + turnover; ROI dashboard + shift report |
| Camera coverage | Setup tool shows uncovered tables and recommends adding a cheap ceiling camera |
| Staff alerts | Web app (PWA) on the waiter's phone with push and an "acknowledged" button |

## Round 3: technical (answered)

| Topic | Decision |
|---|---|
| Edge host | Install on an existing always-on PC (Windows or Linux, prefer back-office over POS). Fallback: cheap mini PC (Intel N100) with the same software |
| Languages | Python on edge and cloud (FastAPI), shared data models. Dashboard and waiter PWA in React + TypeScript |
| Detection model | Permissive licenses only (YOLOX / RT-DETR, Apache/MIT; ByteTrack MIT). Pluggable detector interface. No Ultralytics / AGPL |
| UI languages | Hebrew (RTL) + English, i18n-ready |

## Round 4: scope and accounts (answered)

| Topic | Decision |
|---|---|
| Build scope now | End-to-end working MVP (edge engine, cloud, dashboard, waiter PWA) with tests, running on sample/simulated video |
| Accounts | Organization -> sites (branches) -> roles: owner (all sites), manager (one site), waiter (alerts only) |
| Offline | Alerts keep working over the restaurant LAN/WiFi when internet drops; edge buffers and syncs later |
| Pilot | No pilot restaurant yet. Generic POS adapter interface now, concrete POS integration in phase 2 |

## Founder input: automatic table detection

- The setup wizard auto-detects tables (COCO "dining table" + "chair" from the same YOLOX model) and suggests a polygon and seat count per table; the installer accepts, edits or rejects. Best run when the restaurant is empty.
- Still manual by nature: table numbers matching the POS, queue zone, entrance line, staff area, privacy masks.
- Endpoint: `POST /local/cameras/{camera_id}/suggest-tables` (setup PIN, LAN only, returns polygons only, no image data).

## Founder input: features from competitor video

Four additive capabilities (contracts 1.3, details in architecture 12):

| Topic | Decision |
|---|---|
| Table freed alert | New `table_freed` (info) raised the moment a table enters `needs_bussing`, auto-resolved by the bussing visit or any state change; `bussing_needed` stays as the escalation. On by default (`Modules.table_freed_alerts`), switchable per site. Not raised when staff already cleared the table during the departure confirmation. Never part of waiter response metrics. |
| Host view | Cloud `GET /sites/{id}/host` for owner, manager and waiter: queue, free tables and the predicted next table to free. Median dwell of the last 28 days by party size (>= 10 sessions), else site median, else **60 minutes (a guess to calibrate)**; overdue tables predict now + 5 min with lower confidence. Party size = the current guest count. |
| Staffing | `GET /sites/{id}/metrics/staffing?weeks=4`: p75 of hourly mean guests per local hour, weekday vs weekend, `ceil(p75 / guests_per_waiter)` with a minimum of 1 in open hours. **`guests_per_waiter = 20` is a guess to calibrate** with each restaurant; weekend defaults to Fri+Sat in Israel, Sat+Sun elsewhere. Shown as an estimate. UI wording avoids anything that reads like a per-employee metric. |
| Live view | LAN-only MJPEG from the edge (~2 fps), same privacy pipeline as the setup snapshot (people blurred, masks black, in-memory only) plus table colours. PIN protected; the PIN may be a query parameter because `<img>` cannot send headers (never logged; cross-site pages cannot read the stream). |
| Compatibility | Existing APIs and behaviour unchanged. Tests that pinned the schema version (1.2) and the exact `modules` dict were updated for 1.3; the edge analytics DSL turns `table_freed_alerts` off by default so the pre-1.3 exact event sequences still hold, and a separate test proves the module only adds events. |
