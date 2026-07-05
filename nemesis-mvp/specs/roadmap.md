# NEMESIS MVP — Roadmap (roadmap.md)

Companion to `spec.md` (what) and `plan.md` (how). Eight phases, each a
meaningful, verifiable step. A phase is **closed** only when its exit
criteria pass, its verification ran, and the standing rules below were done.

## Standing rules (every phase, no exceptions)

1. **Spec sync** — before closing a phase, reconcile all three documents with
   what was actually built: update the phase's status marker below, tick the
   FR/AC status table in `spec.md` §11, and amend `plan.md` if the
   architecture drifted (the docs describe reality, or the phase isn't done).
2. **Dated work log** — every working session appends to
   `nemesis-mvp/logs/YYYY-MM-DD.md`: what was done, decisions made (with the
   why), AC/test results, open issues carried forward. Phase closure is
   recorded in that day's log with the verification output.
3. **Verification is scripted** — each phase ships its Playwright spec in
   `tests/pN_*.spec.mjs`; earlier phases' tests keep passing (regression).
4. **Tuning stays in data** — if a phase needs a new number, it lands in a
   data module (NFR-4), never inline.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` closed.

---

## `[x]` P0 — Scaffold & first light
**Closes:** NFR-1, NFR-2 (foundations) · **Modules:** `index.html`, `core/loop.js`, `core/store.js`, `vendor/three/`

- Repo layout per `plan.md` §2; vendor a pinned Three.js build.
- Import-map `index.html`; fixed-timestep loop with interpolated render;
  freeze (hitstop) and slow-mo channels stubbed into the loop from day one.
- Port the guarded `store` helper; create `logs/` with the kickoff entry.
- A lit blockout box floor + capsule placeholder renders at 60 fps.

**Exit criteria:** page opens from `file://` and a local server with zero
network requests; loop stats (fps, sim ticks) visible in a corner readout.
**Verification:** `tests/p0_boot.spec.mjs` — page loads headless, no console
errors, `window.__game.ticks` advances, screenshot captured.

## `[x]` P1 — Move, camera, lock-on
**Closes:** FR-4.1 (AC-4.1.1–4.1.5) · **Modules:** `combat/controller.js`, `world/camera.js`, `world/zone.js` (arena slice), `core/input.js` (base)

- Capsule character controller (WASD camera-relative, jump, gravity,
  dodge-roll with i-frame timer) against arena collision.
- Orbit camera with collision probe; lock-on to a static target dummy:
  framing, strafe-relative movement, break/re-acquire rules.
- Arena slice of the zone (floor, walls, dummy) from `zone.js` named data.

**Exit criteria:** all five AC-4.1.x pass; movement feels responsive at
120 Hz sim (no input latency complaints in manual pass).
**Verification:** `tests/p1_movement.spec.mjs` — scripted inputs assert
position deltas, dodge i-frame window, lock-on state transitions; video
capture for manual feel review.

## `[x]` P2 — Combat core vs. training dummy
**Closes:** FR-4.2, FR-4.3, FR-4.5, FR-4.6 (all ACs except AC-4.6.6 final check) · **Modules:** `combat/fighter.js`, `attacks.js`, `resolver.js`, `ui/hud.js` (bars, damage numbers, combo counter)

- Fighter state machine consuming intents; attack table with light string,
  heavy, block/parry windows, stagger; resolver with frontal-arc hit tests.
- Input buffering + cancel table; hitstop; camera impulse; combo scaling
  with damage numbers and slow-mo beat.
- Dummy can be set to idle / hold-block / attack-on-timer (test scaffolding
  that P3's bot tests reuse).

**Exit criteria:** a human can perform: 3-hit light string, buffered
dodge-cancel, timed parry → guaranteed punish, block-broken-by-heavy — each
demonstrably per its AC numbers.
**Verification:** `tests/p2_combat.spec.mjs` — frame-accurate assertions on
parry window, buffer executes with 0 idle frames, combo scaling math,
hitstop durations read from the loop's freeze channel.

## `[x]` P3 — The rival fights: profile, sync, micro-GOAP
**Closes:** FR-3.3, FR-3.4, FR-4.4 (special) · **Modules:** `ai/goap.js`, `microActions.js`, `rivalAgent.js`, `playerProfile.js`, `syncEngine.js`, `combat/projectiles.js`

- Port PlayerProfile + SyncEngine; wire profiling into the resolver events.
- Generic GOAP planner; micro action/goal set; skill-scaled plan depth,
  cost noise, replan interval; profile-derived costs (the mirror).
- Energy meter + special projectile for both fighters.
- Player-bot test doubles: `aggressiveBot`, `turtleBot`, `heavyOnlyBot`.

**Exit criteria:** AC-3.4.4 (BreakGuard vs. turtleBot ≥ 70%), AC-3.3.2
(mirror shift ≥ 20 pts vs. heavyOnlyBot), and a first S-3 band run (10 duels
vs. `aggressiveBot`, neither side > 70% wins).
**Verification:** `tests/p3_rival.spec.mjs` — the three checks above,
automated; duel video captured for feel review.

## `[x]` P4 — Rivalry Manager: memory that persists
**Closes:** FR-2.1, FR-2.2, FR-2.3, FR-6.1, FR-6.2 · **Modules:** `rivalry/rivalManager.js`, `ledger.js`, `ui/debug.js`

- Rival profile lifecycle (create/generate name/persist/restore); ledger with
  cap + genesis-entry protection; XP, level-ups, style-relative growth table;
  appearance tags → material variations.
- Debug panel with live JSON, ledger view, forced states, reset.

**Exit criteria:** reload mid-rivalry restores everything (AC-6.1.2); ledger
records duel outcomes + one style observation per duel (AC-2.2.2); tag
appears on rival body after a player win (AC-2.1.3).
**Verification:** `tests/p4_persistence.spec.mjs` — duel → reload → assert
restored state deep-equals; debug-panel toggles asserted via DOM.

## `[x]` P5 — Genesis Flow in the zone
**Closes:** FR-1.1, FR-1.2, FR-1.3, FR-5.1 · **Modules:** `core/states.js`, `ui/prompts.js`, `world/zone.js` (full), `world/navigation.js` (base)

- Full zone blockout (all six named locations, connected); collision soak.
- State machine: tutorial (gated steps, dummy hits), First Blood (stat
  overrides, inescapable arena, name card), forced escape both directions
  (freeze, prompt, route highlight, ledger genesis entries, hate changes),
  returning-player skip.

**Exit criteria:** the PRD's flow runs uninterrupted: boot → tutorial →
First Blood → forced escape → free roam, and the symmetric rival-flees branch
is reachable with debug HP forcing.
**Verification:** `tests/p5_genesis.spec.mjs` — full scripted playthrough of
both branches; zone-bounds soak (AC-5.1.3); tutorial-skip on second boot.

## `[x]` P6 — The nemesis lives: macro-GOAP + taunts
**Closes:** FR-3.1, FR-3.2 · **Modules:** `ai/macroActions.js`, `world/navigation.js` (full), `rivalry/taunts.js`, `tauntFragments.js`, subtitle UI

- Macro goals Hunt/Train/Ambush over the waypoint graph; encounter start/end
  transitions anywhere in the zone; Train XP accrual; Ambush first-strike.
- Taunt engine: fragment pools per trigger × hate band, shuffle-bag
  no-repeat, significance-ranked memory rendering, canonical re-encounter
  line; subtitle rendering.

**Exit criteria:** AC-3.1.2 (re-encounter taunt references the flight),
AC-3.2.3 (each macro bias demonstrable via debug forcing), macro goal visible
in debug panel.
**Verification:** `tests/p6_nemesis.spec.mjs` — taunt content assertions per
band/trigger; forced-state macro-goal assertions; a scripted "player uses the
same route 3×" run ends with the rival choosing Ambush.

## `[x]` P7 — Best-of-the-best pass
**Closes:** remaining feel ACs, S-4 · **Modules:** touch-ups across `combat/*`, `world/camera.js`, `core/tuning.js`

- Tuning playtest loop: attack timings, parry window, dodge distance, camera
  impulse strength, combo cap — adjusted in data only, with each change and
  its reason logged in the day's work log.
- Degraded-mode auto particle scaling (NFR-5); frame-budget audit.
- HUD micro goal hint toggle (AC-3.4.5) final wording.

**Exit criteria:** S-4 checklist green; 60 fps sustained through a full duel
with debug panel closed; no regression in P1–P6 suites.
**Verification:** `tests/p7_feel.spec.mjs` — fps sampling during scripted
duel, degraded-mode trigger test; manual feel session logged.

## `[x]` P8 — Integration playtest & MVP acceptance
**Closes:** S-1, S-2, S-3 (final), spec §1.1 as a whole

- The PRD §5 week-4 script, end to end: enter game → learn movement → get
  beaten → forced escape → escape → re-encounter → the rival mocks the
  flight → full duel with all systems on.
- Final S-3 band run (10 duels); success-criteria review written to the log;
  every FR's status finalized in `spec.md` §11.

**Exit criteria:** all four S-criteria pass; all P0–P7 suites green; the
three specs and the status table describe the shipped reality.
**Verification:** `tests/p8_acceptance.spec.mjs` — the full-journey script;
gameplay video recorded and attached to the closing log entry.

## `[x]` P9 — Saiyan combat (M7, post-acceptance expansion)
**Closes:** FR-7.1..7.4 · **Modules:** `combat/fighter.js` (flight/dash/ki/surge/aura), `combat/attacks.js` (ki def + SAIYAN tuning), `combat/resolver.js` (3D reach, surge mult, surge gains), `ai/rivalAgent.js` + `microActions.js` (aerial pursuit, dragonDash, kiBarrage, pride), `rivalry/rivalManager.js` (zenkai), `core/states.js` (flight awakening, per-duel escalation reset), `ui/hud.js` (power level)

- Flight (F) with 3D movement, ceiling + bounds clamps, awakened at genesis;
  ki dash (hold Q) rushes the lock-on in 3D; ki blasts (I) through the shared
  rulebook; surge transformation (auto at full meter: gold aura, x1.25 dmg,
  x1.15 speed) with the rival's pride acceleration; zenkai power persistence.

**Exit criteria:** all FR-7 ACs pass; earlier suites keep passing.
**Verification:** `tests/p9_saiyan.spec.mjs` 13/13 ×2; full p0–p9 regression
green; aerial-battle video captured.

---

## After MVP

Post-MVP items in spec §9 (LLM taunts, Unity port, asset pipeline, climbing,
more zones) get their own roadmap revision *after* the P8 acceptance review —
not before.
