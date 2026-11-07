> **Template, not legal advice.** Have local counsel review before use.

# Non-identification statement: how Restaurant Vision is built not to identify people

Technical description of the privacy design, for DPIAs, regulators, landlords, works councils
and customers' counsel. Hebrew version: `non-identification-statement-he.md`.
Source of truth: `docs/architecture.md` section 10 and the code it cites.

| | |
|---|---|
| Product / version | Restaurant Vision MVP, rv-edge and rv-cloud [VERSION, e.g. 0.1.0] |
| Statement date | [DATE] |
| Issued by | [VENDOR LEGAL NAME], [ROLE OF SIGNATORY] |
| Installation (optional) | [RESTAURANT / BRANCH], edge device [DEVICE ID] |

## 1. Statement

Restaurant Vision detects the presence and position of people in the live video of a
restaurant's existing cameras in order to produce anonymous, table-level and zone-level service
information. It is designed so that it **cannot identify, recognise or single out a person**:

- it extracts no facial features, face geometry, gait or body-shape signatures, and no
  appearance embeddings of any kind;
- it does not keep video or images: frames exist only in the edge computer's memory while
  they are processed;
- the short-lived track labels it uses are random, specific to one camera and discarded at
  least every 24 hours, so a person cannot be matched across cameras, days, visits or
  restaurants;
- only anonymous events (table states, queue and occupancy counts, durations) leave the
  restaurant, and the cloud accepts nothing else;
- no metric, report or acknowledgement is attributed to an individual employee.

## 2. Data flow

```
IP camera / NVR ──RTSP (LAN only)──► edge computer in the restaurant (RAM only)
   frame → privacy masks (black) → person detector → tracker (random IDs) → analytics
         └─ discarded after processing ─┘                                     │
                                                                              ▼
            anonymous events (rv_contracts) → local outbox (SQLite) → HTTPS → cloud
```

## 3. What is processed, where, and for how long

| Data | Where | Kept | Leaves the restaurant |
|---|---|---|---|
| Camera frames (pixels) | Edge RAM | Milliseconds, while processed | No |
| Privacy-mask polygons (restrooms, staff rooms, etc.) | Edge config, cloud config | Until changed | Yes (polygon coordinates only) |
| Person boxes (x1, y1, x2, y2, score) | Edge RAM | Per frame | No |
| Track labels (48-bit random, per camera) | Edge RAM | Seconds to minutes; all mappings discarded at least every 24 h | No |
| Uniform-colour score (one number 0..1, "how close is this torso colour to the staff uniform") | Edge RAM | Per frame, then discarded | No |
| Role (guest / staff / unknown) per track | Edge RAM | Life of the track | No |
| Anonymous events: table states and guest counts, alerts, queue and occupancy snapshots, walk-aways, device health | Edge outbox, cloud database | Edge: 7 days after delivery. Cloud: [RETENTION] | Yes |
| Setup snapshot (one frame, every person blurred, masks blacked out) | Edge RAM, shown to the PIN-protected setup page on the LAN | Generated on request, never stored (`Cache-Control: no-store`) | No |
| Camera RTSP URLs and credentials | Edge `secrets.json` (owner-only permissions) | Until changed | No |

## 4. Controls enforced in code

| Control | Implementation | Verified by |
|---|---|---|
| No frame or image persistence | No `imwrite`, `VideoWriter` or `imsave` anywhere in `rv_edge`; the setup snapshot is encoded in memory (`imencode`) | `edge/tests/runtime/test_privacy_guard.py` scans every source file and fails the build on these names |
| No face or identity libraries | No `face_recognition`, `insightface` or `dlib` in `rv_edge` | Same test |
| Person class only | YOLOX (Apache-2.0) via ONNX Runtime returns only COCO class 0 (person) boxes; no face detector exists in the product | `edge/rv_edge/vision/detectors/yolox_onnx.py`, detector tests |
| Masks before detection | Privacy polygons are filled black on a copy of the frame before the detector sees it | `edge/rv_edge/vision/privacy.py`, `edge/tests/vision/test_privacy.py` |
| Motion-only tracking | ByteTrack: a Kalman filter on box position and size plus box overlap (IoU); no appearance features | `edge/rv_edge/vision/bytetrack.py` |
| Random, rotating, camera-scoped IDs | Internal IDs are mapped to `secrets.token_hex(6)` strings; the mapping and all tracker state are discarded every `track_id_ttl_h` hours (default 24, maximum 24, enforced by the config schema) | `edge/rv_edge/vision/tracking.py`, `edge/tests/vision/test_tracking.py` |
| No cross-camera re-identification | Cameras are linked only by zone geometry and timing (e.g. crossing the entrance line); no appearance matching exists | `docs/architecture.md` 6.1-6.2 |
| Appearance hint is a scalar | Uniform similarity from a colour histogram of the torso crop, computed and discarded in RAM; only the number reaches analytics, and it never leaves the edge | `edge/rv_edge/vision/hints.py` |
| Closed outbound schema | The cloud receives only `rv_contracts` event models; every model rejects unknown fields (`extra="forbid"`); no event type has an image, face, track ID or person field | `contracts/rv_contracts/events.py`, `web/packages/shared/src/contracts/schema.json` |
| No staff identity | Alert acknowledgements carry only `via` (`cloud` or `local`) and a time; the schema has no per-employee metric | `contracts/rv_contracts/events.py` (`AlertAcknowledged`) |
| No audio | The ingest reads the video stream only; the product has no audio code path | `edge/rv_edge/ingest/` |
| Credentials stay local | RTSP URLs and passwords live in the edge secrets file (POSIX 0600, Windows ACL to the service account); logs redact them; the cloud config has no field for them | `edge/rv_edge/runtime/secrets_store.py` |
| Setup access | Setup endpoints need a local setup PIN (rate-limited); the LAN API is meant for the restaurant LAN only | `edge/rv_edge/runtime/local_api.py` |

## 5. What the system cannot do

It has no capability, in any configuration, to: recognise or verify faces; identify a person
or compare them with a list (watch lists, VIPs, banned guests); estimate age, gender,
ethnicity or emotion; match a person between cameras, days, visits or restaurants; record or
export video, images or sound; or report on an individual employee. Adding any of these would
be a new product version and requires a new statement and a new DPIA.

## 6. Residual personal data and risks

- **Live frames are personal data while they exist.** Under Israeli, Australian and Californian
  law, identifiable images are personal information even if processed only transiently. The
  restaurant is the controller; the vendor processes on its behalf. Mitigation: processing on
  site, in memory, with no storage and no egress.
- **Small counts.** In a nearly empty room a table-level event ("table 7: 1 guest, waited 9
  minutes") could be linked to a person by someone who was there. The event still carries no
  identity, image or appearance. Restaurants should not combine events with other records
  (e.g. reservations) to single out guests.
- **Staff role.** The system classifies each track as guest or staff to know whether a table was
  visited. It does not identify which staff member, and no output is per employee.
- **Account data in the cloud.** Dashboard users' names, emails and password hashes (argon2),
  and browser push subscription endpoints for waiters' phones, are personal data handled under
  the DPA.
- **LAN exposure.** The edge's LAN API (port 8787) shows live table states without a login so
  that waiters can work offline. Keep it on the restaurant LAN and off guest Wi-Fi where
  possible.

## 7. How to verify

1. Run the privacy guard test: `pytest edge/tests/runtime/test_privacy_guard.py`.
2. Inspect the outbound schema: `web/packages/shared/src/contracts/schema.json` (generated from
   `rv_contracts`; CI fails if it drifts from the code).
3. Capture the edge's outbound traffic: it goes only to the configured cloud host over HTTPS,
   with JSON event batches of a few kilobytes and no image payloads.
4. Read the live state on the LAN: `GET http://<edge>:8787/local/state` shows exactly what the
   edge knows: tables, counts, queues and alerts.

## 8. Change control

Any change to detection, tracking, hints, the event schema or data retention that affects
sections 1 to 6 requires updating this statement and the DPIA before release.

Signed: ______________________ [NAME, TITLE], [VENDOR LEGAL NAME] · Date: __________
