# Screenshots

Captured with Playwright (Chromium, device scale factor 2) from the real stack running locally,
without Docker: the cloud (`uvicorn`, SQLite, demo seed) serving the built dashboard at `/` and the
waiter PWA at `/waiter/`, and a simulated edge (`rv-edge simulate --scenario
simulator/scenarios/demo_dinner.yaml --speed 20`, rebased to now) paired with Tel Aviv and serving
edge-ui on `:8787`. Every figure comes from that run: no mock backend. Logins are the seed's
(`demo@example.com`, `waiter@example.com`, password `demo-password-123`).

| File | What it shows |
|---|---|
| `01-dashboard-live-floor-he.png` | Owner, Tel Aviv live floor (Hebrew, RTL, 1280×800): tables coloured by state with guest counts and timers, a `waiter_needed` alert for table 7 timed from when the guests sat down ("האורחים ממתינים 2:53 · מאז 9:20"), occupancy and the entrance queue. |
| `02-dashboard-analytics-queue-wait-he.png` | Analytics, "today" in 15-minute buckets: occupancy by hour, waiter response median and p90 on one axis, queue size, the new queue-wait chart (minutes before seating), and walk-aways. |
| `03-dashboard-shift-report-roi-he.png` | Today's shift report: KPIs, the ROI block with every figure badged as an estimate (lost revenue from walk-aways, response-time improvement, extra covers and revenue), guests by hour and per-table stats. |
| `04-waiter-alert-waiting-since-phone-he.png` | Waiter PWA on a phone (390×844): the `waiter_needed` alert with "guests waiting 2:59 · since 9:20" (from `condition_since_ts`, 3 minutes before the alert was raised) and the big "בטיפול" (On it) button. |
| `05-waiter-after-on-it-phone-he.png` | The same phone after "On it": the alert moved to "in progress" with "someone is on it" (no identity recorded), and the sound row switched to "alert sounds are on" in place instead of disappearing. |
| `06-dashboard-live-floor-acknowledged-en.png` | The dashboard in English (LTR) a moment later: table 7's alert shows "Someone is on it" (it arrived within about 0.2 s of the tap). |
| `07-dashboard-devices-pairing-local-url-he.png` | Settings › Edge devices: the paired edge online with its LAN address (`local_url`, used for the waiter's offline link) and a freshly generated pairing code with the `rv-edge pair` command. |
| `08-edge-ui-zones-editor-he.png` | edge-ui setup wizard, zones step (after entering the setup PIN): the simulated camera's snapshot with people blurred, table zones (primary), staff area and a privacy mask. |
| `09-edge-ui-coverage-he.png` | edge-ui coverage check: all 8 tables are counted by a camera. |
| `10-edge-ui-offline-alerts-phone-he.png` | edge-ui `/local-alerts` on a phone: the same alert straight from the edge over the restaurant network, for when the internet is down. |

The simulated edge runs 20× faster than the wall clock, so the apps measure timers against the
edge's clock (`useSiteLive`'s `clockOffsetS`); in production that offset is zero.
