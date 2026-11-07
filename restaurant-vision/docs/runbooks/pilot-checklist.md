# Runbook: pilot checklist

A pilot is an experiment: measure before and after on the same kind of evenings, publish the
accuracy, and keep staff metrics out. The research's biggest open question is whether the
existing cameras actually see the tables, so that is checked in week 0, before any promise is
made.

Roles: **pilot lead** (vendor), **restaurant owner / GM**, **installer**. Plan about 6 weeks:
week 0 checks and setup, week 1 baseline, weeks 2 to 5 live, week 6 review.

## Week -2 to 0: paperwork (start first, it has lead time)

- [ ] DPA signed with the right country rider (`docs/compliance/dpa-outline-en.md`).
- [ ] DPIA started with the camera list (`dpia-template-en.md`); non-identification statement
      attached.
- [ ] **NSW / ACT:** 14-day written notice delivered to every employee at least 14 days before
      the start date; ACT consultation held (`staff-notice-en.md`, Part 2). The start date
      below must respect this.
- [ ] **Israel:** written policy issued; signed acknowledgements collected before go-live; the
      workers' committee consulted if there is one (`staff-notice-he.md`, Part 1).
- [ ] **US:** CT/NY/DE monitoring notices where applicable (Part 3).
- [ ] Signs printed for every entrance (`signage-*.md`), NYC variant if in New York.
- [ ] Website privacy notice updated (`privacy-notice-*.md`).

## Week 0: camera coverage check (go / no-go)

Do this on site, during a service if possible.

- [ ] List every camera and NVR channel: model, mounting height and angle, substream
      resolution and fps, RTSP reachable from the edge PC (`rv-edge discover`, then the setup
      wizard's snapshot).
- [ ] For each table, record which camera sees it **with the seats visible** (not hidden by
      pillars, plants, the bar or other guests), and mark one camera as primary.
- [ ] Entrance: does one camera see the queue area and the door line?
- [ ] Staff area: is there a pass or service station where staff tracks start?
- [ ] Coverage page in the wizard: list uncovered tables.
- [ ] Decision:
  - **Go**: at least 70% of tables covered and the entrance visible.
  - **Go with a camera**: quote one or two ceiling cameras (2 to 4 m, above the table area) for
    the uncovered section; do not promise "no new cameras".
  - **No-go**: the camera angles cannot see tables (typical for cameras aimed only at the till
    and the door).
- [ ] `rv-edge check` on the chosen PC: capacity at 5 fps is at least the number of cameras.

## Setup and calibration (end of week 0)

- [ ] Install and pair (`install-edge.md`); service survives a reboot.
- [ ] Tables, queue zone, entrance line (arrow inward), staff zone drawn; labels match the
      floor plan in the dashboard.
- [ ] Privacy masks: restrooms, staff room, changing area, kitchen workstations, windows to the
      street, screens. Screenshot for the DPIA.
- [ ] Uniform calibration with a staff member in uniform; repeat if uniforms change by shift.
- [ ] Thresholds reviewed with the GM (dashboard → Settings → Thresholds): first visit
      (default 180 s), check-in (900 s), bussing (300 s), long queue (8 people or 600 s).
- [ ] Walk-through test: sit at three tables, stand in the queue, walk out without being seated;
      the live view and the alerts follow.
- [ ] Waiter phones: PWA installed, push permission granted, offline page bookmarked
      (`http://<edge-ip>:8787/local-alerts`), tested with the internet unplugged.

## Staff briefing (before alerts go live)

15 minutes before a shift, with the GM. Cover:

- What it does: table alerts ("table 7 has been waiting 3 minutes for a first visit"), the
  queue, clearing reminders. The "On it" button tells colleagues a table is taken.
- What it does not do: no faces, no recording, no sound, nothing per person. The "On it" button
  does not record who pressed it. There are no per-waiter reports and the data is not used for
  evaluation or discipline. (Israel: point to the signed policy. NSW/ACT: point to the notice.)
- Privacy masks: restrooms and the staff room are blacked out in the software.
- How to give feedback on wrong alerts: [CHANNEL]. False alerts are the pilot's problem to fix,
  not the staff's.
- Answer questions; note concerns in the DPIA consultation section.

## Week 1: baseline (alerts off)

The engine runs and records, but waiter alerts are not sent (or are muted on phones). This week
is the "before".

- [ ] Same days and hours as the comparison weeks will use (e.g. Thursday to Saturday dinner).
- [ ] Record per service: covers (from the POS), peak queue, walk-aways, first-visit delay p50 and
      p90, bussing delay p50, table turnover.
- [ ] Spot-check accuracy on two evenings: an observer logs 20 table events (seated, first
      visit, left, cleared) and 10 door events by hand; compare with the dashboard. Target
      before enabling alerts: no more than 1 false `waiter_needed` per 10 alerts; seated and
      cleared detected within 60 s.
- [ ] Fix zones, masks or thresholds; repeat the spot check if more than 20% of events differ.

The cloud uses the first 7 days after install as the response-time baseline in the ROI
report (architecture 7.4), so do not change thresholds after week 1 without noting it.

## Weeks 2 to 5: live

- [ ] Alerts on. Daily during week 2: review false and missed alerts with the GM.
- [ ] Weekly: device health (online, cameras OK, outbox near 0), shift reports exported.
- [ ] Keep the same comparison days and hours as the baseline.
- [ ] Log anything that changes the numbers: staffing changes, menu changes, events, weather,
      holidays.

## ROI measurement plan

| Metric | Source | Baseline vs live | Notes |
|---|---|---|---|
| First-visit delay (`waiter_needed` raised → resolved), p50 / p90 | Shift report | Week 1 vs weeks 2-5 | Primary operational metric |
| Bussing delay p50 | Shift report | Same | Faster table reset |
| Walk-aways per peak service | Queue module | Same | × party size × average check = lost revenue estimate |
| Table turnover in hours with a queue | Tables + queue | Same | Extra covers only count when demand exceeds capacity (queue non-empty) |
| Covers per peak service | POS | Same | Ground truth for revenue |
| Average check | POS | Same | Sanity check that faster service did not shrink checks |

Report every number as an estimate with its comparison window, the number of services and the
known confounders. Publish the measured accuracy alongside the ROI.

## Week 6: review

- [ ] Before/after table above, accuracy summary, staff feedback (anonymous).
- [ ] DPIA residual-risk column completed and signed; next review date set.
- [ ] Decision: continue, extend with ceiling cameras, or stop (uninstall and revoke the
      device in the dashboard; delete data per the DPA).
