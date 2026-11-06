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
