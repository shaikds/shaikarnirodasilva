> **Template, not legal advice.** Have local counsel review before use.

# Data protection impact assessment (DPIA): Restaurant Vision

Pre-filled with the system's facts. The restaurant (controller) completes the `[BRACKETS]`,
checks every pre-filled statement against its own installation, and signs it before go-live.
Hebrew version: `dpia-template-he.md`.

Why a DPIA: the Israeli Privacy Protection Authority's draft guidance on AI (2025) recommends a
DPIA for AI systems that process personal data at any stage; the CCPA regulations require risk
assessments for "systematic observation" used to infer employee performance (this system is
designed to avoid that); in Australia a privacy impact assessment is the OAIC's expected
practice for new surveillance technology. It is also the record of the proportionality choice
that the Kmart and Bunnings decisions looked for.

## 1. Overview

| | |
|---|---|
| Controller (restaurant) | [LEGAL NAME, COMPANY NO., ADDRESS] |
| Sites covered | [BRANCHES] |
| Processor (vendor) | [VENDOR LEGAL NAME, ADDRESS] |
| System | Restaurant Vision [VERSION]: edge engine (rv-edge) on [PC MODEL / LOCATION], cloud (rv-cloud) hosted in [REGION] |
| DPIA owner | [NAME, ROLE] · DPO / privacy contact: [NAME, if appointed] |
| Date / version | [DATE] / [v1] · Next review: [DATE, at most 12 months] |

## 2. Description of the processing

**Purpose.** Guest service operations: live table states (empty, seated, attended, needs
clearing), alerts to waiters' phones when a table waits too long for a first visit, a check-in
or clearing, the entrance queue and walk-aways, guest counts and table turnover, and shift and
ROI reports at restaurant level.

**Nature.** The edge computer in the restaurant reads the substream of [N] existing cameras over
the LAN (about 5 frames per second each), blacks out privacy masks, detects people (bounding
boxes only), follows them within one camera with random short-lived IDs, distinguishes guests
from staff (uniform colour, staff-area origin, movement pattern), and turns this into anonymous
table, queue and occupancy events. Frames are discarded after processing. Events are sent to
the cloud over HTTPS. Details: `non-identification-statement-en.md`.

**Scope.** Cameras: [LIST: name, area covered, mounting]. Areas excluded by masks: [restrooms,
staff room, kitchen workstations, ...]. Hours: [OPENING HOURS]. Data subjects: guests, staff,
delivery couriers and other visitors who appear in camera view. Approximate daily volume:
[GUESTS / DAY].

**Context.** Guests and staff are in a semi-public dining room and do not expect to be
identified. The restaurant already operates security cameras under [CCTV POLICY]; this system
reuses their video for a new, operational purpose and does not record.

## 3. Data inventory

| Data | Personal data? | Where / how long | Recipients |
|---|---|---|---|
| Live frames | Yes, while in memory (identifiable images) | Edge RAM, milliseconds | None |
| Person boxes, random track IDs, uniform score, role | Pseudonymous at most; not linkable once frames are gone | Edge RAM, minutes; IDs rotated within 24 h | None |
| Table, queue and occupancy events; alerts and acknowledgements (no user identity) | No (anonymous, table and zone level) | Edge outbox 7 days after delivery; cloud: raw events 90 days, derived metrics and reports 400 days (defaults; `RV_RETENTION_RAW_EVENTS_DAYS`, `RV_RETENTION_METRICS_DAYS`) | Restaurant managers and waiters; vendor as processor |
| Floor config (table labels, zone polygons, privacy masks) | No | Edge and cloud, until changed | Same |
| Dashboard user accounts (name, email, password hash, role) | Yes | Cloud, while the account exists | Vendor as processor |
| Waiters' browser push subscriptions (push endpoint and keys) | Yes (device-level) | Cloud, until unsubscribed or expired | Vendor; browser push services (encrypted payload: alert kind and table label only) |
| Camera RTSP credentials | Not personal; security-sensitive | Edge `secrets.json`, owner-only | None |

## 4. Necessity and proportionality

| Option considered | Outcome |
|---|---|
| Manager observes tables manually | Inconsistent at peak times, no data for planning; in practice more intrusive for staff |
| POS / reservation data only | Shows checks, not waiting tables or the door queue |
| Face recognition, re-identification, recorded video analytics | **Rejected**: biometric/special-sensitivity data, not needed for the purpose (Kmart: a less intrusive alternative existed) |
| Per-waiter response times | **Rejected**: workplace monitoring (Israeli guidance 5/2017, *Isakov*; NSW/ACT; CCPA); table level meets the purpose |
| **Chosen:** anonymous, on-site, table and zone analytics with no storage | Meets the purpose with the least data |

Data minimisation in practice: substream at low resolution and 5 fps; person class only;
masks before detection; no storage; random rotating IDs; closed outbound schema; no staff
identity in acknowledgements. Transparency: signs at each entrance (`signage-en.md`), website
notice (`privacy-notice-en.md`), staff policy and notices (`staff-notice-en.md`).

## 5. Legal basis and duties (complete with counsel)

| Jurisdiction | Points to confirm |
|---|---|
| Israel | Privacy Protection Law + Amendment 13: purpose and notice duties; legitimate operational purpose; workplace guidance 5/2017 and *Isakov* (specific written policy, signed acknowledgement/consent); Data Security Regulations 2017 security level of any database; processor ("holder") agreement; cross-border transfer basis if the cloud is outside Israel; whether a DPO is needed (systematic monitoring at scale applies to holders too) |
| United States | No biometric identifiers (BIPA, Texas CUBI, NYC § 22-1201 exemption); employee monitoring notices (CT, NY, DE); CCPA applicability, service-provider contract, risk assessment only if employee performance were inferred (it is not); California AB 1331 (from 1 Jan 2027) excluded areas |
| Australia | APP entity or small business exemption; APP 1 and APP 5 notices (specific, not "may"); APP 8 if the cloud is overseas; NSW / ACT 14-day written notice and entrance signs; statutory privacy tort (from 10 Jun 2025): no covert monitoring of private areas; ADM disclosure (from 10 Dec 2026) not triggered while no decisions about individuals are made |

## 6. Risks and measures

Likelihood and severity: low / medium / high. Fill in the residual column after the measures
are in place.

| # | Risk | L | S | Measures in the product | Measures by the restaurant | Residual |
|---|---|---|---|---|---|---|
| 1 | Guests identified or tracked across visits | L | H | No face/appearance features, no storage, random camera-scoped IDs rotated within 24 h, closed schema | Do not add face recognition or other identifying tools to these cameras | [ ] |
| 2 | Function creep into staff performance monitoring | M | H | No per-employee metric or acknowledgement identity in the schema | Written policy (section 5 of the staff policy), no use in discipline, any change goes through a new DPIA | [ ] |
| 3 | Cameras or analysis cover private areas (restrooms, changing, staff rooms) | L | H | Privacy masks applied before detection; setup wizard prompts for them | Configure masks at setup and after any camera move; photo evidence in section 8 | [ ] |
| 4 | Video leaves the site via this system | L | H | No image in any outbound model; privacy guard test in CI | Keep the edge on the restaurant LAN; do not expose port 8787 to the internet | [ ] |
| 5 | Camera credentials or device token stolen from the edge PC | M | M | Secrets file owner-only; logs redact URLs; device token revocable in the dashboard | Use a dedicated read-only camera account; keep the PC patched; limit admin access | [ ] |
| 6 | Unauthorised view of live state or acks on the LAN | M | L | LAN API shows anonymous state only; setup protected by PIN with rate limits | Separate guest Wi-Fi from the staff/camera LAN where possible | [ ] |
| 7 | Breach of cloud account data | L | M | Tenant isolation by construction (tested); argon2 password hashes; HTTPS | Strong passwords, remove leavers promptly, least-privilege roles | [ ] |
| 8 | Small counts single out a guest in a near-empty room | L | L | Events carry no identity or appearance | Do not join events with reservation or POS records about named guests | [ ] |
| 9 | Inaccurate alerts erode staff trust or cause blame | M | M | Accuracy measured on simulated scenarios before pilots; alerts are table-level | Brief staff that alerts are aids, not evaluations; review false alerts in week 1 | [ ] |
| 10 | Cross-border transfer of account data | [ ] | M | Regional hosting option [REGION] | Transfer clause in the DPA (country rider) | [ ] |

## 7. Consultation

| Who | When | Outcome |
|---|---|---|
| Staff briefing / workers' committee or union | [DATE] | [SUMMARY] |
| NSW / ACT: 14-day notice given | [DATE NOTICE SENT] → start [DATE] | [ ] |
| DPO / counsel | [DATE] | [ADVICE] |
| Vendor | [DATE] | Non-identification statement version [ ] received |

## 8. Go-live checklist (evidence)

- [ ] Signs posted at every entrance (photo, date): [ ]
- [ ] Website privacy notice updated (URL): [ ]
- [ ] Staff policy signed by all staff / NSW-ACT notice delivered 14+ days before start: [ ]
- [ ] Privacy masks configured for [AREAS] (setup wizard coverage screen, date): [ ]
- [ ] Edge PC: setup PIN set, OS updates on, port 8787 open to the LAN only: [ ]
- [ ] Dedicated read-only camera account used for RTSP: [ ]
- [ ] DPA signed with the vendor, country rider [IL / US / AU]: [ ]
- [ ] Cloud retention period agreed (defaults: raw events 90 days, metrics and reports 400 days): [ ]

## 9. Decision and sign-off

Residual risk is [acceptable / not acceptable]. Conditions: [ ].

Approved by: [NAME, ROLE] · Signature: __________ · Date: __________

Review this DPIA at least yearly and before any change to cameras, areas, purposes, retention or
the product's identification properties.
