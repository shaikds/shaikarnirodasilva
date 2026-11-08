# Runbook: operations

Day-2 operations for the cloud and the edge devices: health, updates, backups, secret rotation
and incident response. Commands assume the Docker deployment of the cloud
(`deploy/docker/cloud.Dockerfile`) and the edge installers (`install-edge.md`).

## 1. Health

**Cloud**

- `GET /healthz` (also `GET /api/v1/healthz`) returns `{"status": "ok", "version": ...}`. The
  image's Docker healthcheck polls it every 10 s; point the load balancer and uptime monitor at
  it as well.
- Logs are JSON on stdout (`RV_LOG_JSON=true`), one access line per request with a request id,
  without client IPs. Alert on bursts of 5xx and on `unhandled error`.
- One uvicorn worker per container: realtime fan-out and rate limits are per process. To scale
  out, add a shared broker (Redis, see `cloud/rv_cloud/realtime/broker.py`) first.

**Edge devices** (dashboard → Settings → Devices, or `GET /api/v1/sites/{id}/devices`)

| Signal | Healthy | Action when not |
|---|---|---|
| Online (heartbeat within 90 s) | yes | PC asleep or off, service stopped, internet down. Alerts still work on the LAN; the outbox buffers events. Call the restaurant if offline > 30 min during service. |
| Camera status | `ok` | `degraded`: low fps, check the PC load and network. `offline`: camera, NVR or RTSP credentials changed; re-enter them in the setup wizard. |
| `outbox_depth` | near 0 | Growing: the edge cannot reach the cloud (DNS, firewall, expired token after unpairing). |
| `cpu_pct` / `mem_mb` | within the PC's budget | Sustained back-off: drop a camera or move to a stronger PC (`rv-edge check`). |

On the PC:

- Linux: `systemctl status rv-edge`, `journalctl -u rv-edge -n 200`,
  `curl -s localhost:8787/local/health`.
- Windows: `Get-Service RestaurantVisionEdge`, `C:\ProgramData\RestaurantVision\logs\rv-edge.log`,
  the Application event log (source RestaurantVisionEdge).
- Docker appliance: `docker logs rv-edge`, `docker inspect --format '{{.State.Health.Status}}' rv-edge`.

## 2. Updates

**Cloud**

1. Build and tag the image in CI (`docker build -f deploy/docker/cloud.Dockerfile -t
   registry/rv-cloud:<git-sha> .`).
2. Back up the database (section 3).
3. Migrations: with a single container, the app migrates on startup (`RV_AUTO_MIGRATE=true`).
   With several containers, set `RV_AUTO_MIGRATE=false` and run the migration once as a
   release step: `docker run --rm -e RV_DATABASE_URL=... registry/rv-cloud:<sha> python -c
   "from rv_cloud.config import Settings; from rv_cloud.db import create_db_engine,
   upgrade_head; upgrade_head(create_db_engine(Settings().database_url))"`.
4. Roll the containers; check `/healthz` and that devices reconnect (they retry with backoff
   and resend from the outbox, so a short outage loses nothing).

**Edge**

- Linux: new bundle or `git pull`, then `sudo deploy/edge/linux/install.sh` (keeps settings,
  pairing and data; restarts the service).
- Windows: new bundle, then `install.ps1` again (stops, upgrades, restarts the service).
- Docker appliance: `docker pull` / rebuild, then recreate the container with the same volume.
- Upgrade outside service hours. Events created during the restart stay in the outbox.
- Contract changes: the cloud must accept the new `schema_version` before edges send it. Deploy
  the cloud first, then the edges.

## 3. Backups

| What | Where | How | Restore notes |
|---|---|---|---|
| Cloud database | Postgres | Managed snapshots plus a daily `pg_dump -Fc` kept 30 days, encrypted at rest, in another region | Restore into a new instance, point `RV_DATABASE_URL` at it, start one container (it migrates) |
| Cloud secrets | Secret manager | `RV_JWT_SECRET`, `RV_VAPID_*`, the database password. Never in git or images | |
| Edge data dir | `/var/lib/rv-edge`, `C:\ProgramData\RestaurantVision\data`, or the `rv-edge-data` volume | Optional nightly copy of `site_config.json` and `secrets.json` to an encrypted location the restaurant controls | `secrets.json` holds the device token and camera passwords: treat the backup as a secret. Without it, re-pair and re-enter camera credentials; zones and tables come back from the cloud config |

The edge holds no video and no history beyond the outbox (delivered events are pruned after
7 days), so a lost edge PC loses only undelivered events. A replacement PC needs a new pairing
code and the camera credentials.

Docker demo database: `docker compose -f deploy/docker-compose.yml exec db pg_dump -U rv -Fc rv
> rv.dump`.

### Data retention

The cloud deletes old data by itself (every `RV_RETENTION_INTERVAL_S`, default 6 h, first run a
minute after startup; `0` turns it off):

| Setting | Default | Deletes |
|---|---|---|
| `RV_RETENTION_RAW_EVENTS_DAYS` | 90 | raw edge events (`events`), processed edge commands, expired pairing codes |
| `RV_RETENTION_METRICS_DAYS` | 400 | metric snapshots, queue facts, alerts, table sessions (what reports read) |

Latest-state rows (live table state, occupancy, queues, device health) are kept. Run it by hand,
or from cron when the periodic task is off: `python -m rv_cloud.tools.retention [--dry-run]`
(also `--raw-events-days`, `--metrics-days`, `--database-url`). Deleting is idempotent, so several
workers running it is harmless. These defaults are the periods stated in `docs/compliance`;
change both together. The ROI response-time baseline (first 7 days after install) ages out with
the metrics horizon.

## 4. Secret rotation

**JWT signing secret (`RV_JWT_SECRET`)**, yearly or after any suspected exposure:

1. Generate: `openssl rand -hex 32`. Store it in the secret manager.
2. Deploy with the new value. All access and refresh tokens become invalid, so every user signs
   in again (waiters too). Plan it outside service hours and tell the restaurants.
3. Device tokens are not JWTs (they are random `rvd_` tokens stored hashed), so edges are not
   affected.

**VAPID keys (`RV_VAPID_PRIVATE_KEY`, `RV_VAPID_PUBLIC_KEY`)**, only after exposure (rotation
breaks existing push subscriptions):

1. `python -m rv_cloud.tools.gen_vapid` (in the cloud image) prints a new pair.
2. Deploy both values together.
3. Existing subscriptions were made for the old public key: push services reject them and the
   cloud deletes subscriptions that answer 404/410. Waiters re-open the waiter app, which
   subscribes again with the new key. Until then they still see alerts in the open app and on
   the LAN page.

**Device tokens**: remove the device in the dashboard (Settings → Devices) to revoke its token,
then re-pair with a new code. Do this when a PC is replaced, stolen or decommissioned.

**Camera credentials**: change the password on the NVR/camera, then update it in the setup
wizard. The edge's secrets file is the only copy.

**Setup PIN**: set by the first visitor of the wizard. To reset it, pre-provision
`setup_pin_hash` in `edge.yaml` (see the comment in `deploy/edge/edge.example.yaml`) and restart
the service.

## 5. Incident response

Follows the Israeli Privacy Protection (Data Security) Regulations, 2017: a documented procedure,
an incident log, and notification of the Privacy Protection Authority "immediately" upon
discovery or reasonable suspicion of a serious security incident (the regulator's 2022 position).
The vendor is a holder (processor): it notifies each affected restaurant (the controller)
without delay and in any case within the DPA deadline (24 h), so the restaurant can meet its own
duty. Equivalent duties: Australia, assess an eligible data breach within 30 days and notify the
OAIC and individuals if serious harm is likely; US, state breach laws via the restaurant.

### Severity

| Level | Examples |
|---|---|
| **Serious** | Unauthorised access to the cloud database or backups (account data, events); leaked JWT secret or database credentials; a tenant seeing another tenant's data; a compromised edge PC exposing camera credentials |
| **Moderate** | A single user account taken over; a device token leaked (revocable); exposure of anonymous events only |
| **Minor** | Failed attacks, blocked by controls; an availability incident with no data exposure |

Anonymous events alone are not personal data, but treat any exposure as an incident until
assessed.

### Steps

1. **Detect and log** (time 0): open an incident record (who, what, when, how detected). Keep it
   for at least 24 months.
2. **Contain** (within hours): rotate the affected secrets (section 4); revoke device tokens;
   disable compromised user accounts; block the attacker's access; for an edge PC, stop the
   service, isolate the PC, and change the camera passwords.
3. **Assess**: what data, which tenants, how many people, whether the data was encrypted, and the
   likely harm. Decide the severity.
4. **Notify**:
   - affected restaurants: without delay, at most 24 h (DPA section 8), with facts, impact,
     measures and a contact;
   - Israel: for a serious incident, the restaurant (and the vendor where it holds the database)
     notifies the Privacy Protection Authority immediately, and individuals if the Authority
     requires it;
   - Australia: help the restaurant assess within 30 days and notify the OAIC and individuals for
     an eligible data breach;
   - US: state breach-notification laws, through the restaurant.
5. **Recover**: restore from backup if needed, redeploy clean images, verify tenant isolation
   tests pass, monitor closely for 2 weeks.
6. **Review** (within 2 weeks): root cause, fixes, updates to this runbook, the DPIA and the
   non-identification statement if the privacy design was involved.

### Privacy-design incidents

If anything suggests that the product stored or sent images, identified a person or attributed
data to an employee (for example a bug report or a security finding), treat it as **serious**:
stop the affected edge versions, confirm with the privacy guard test
(`edge/tests/runtime/test_privacy_guard.py`) and traffic captures, and inform the restaurants and
counsel before resuming.
