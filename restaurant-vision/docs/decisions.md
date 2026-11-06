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
