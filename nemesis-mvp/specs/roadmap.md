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

## `[x]` P10 — Martial arts & blast momentum (M8, developer-requested)
**Closes:** FR-8.1..8.5 · **Modules:** `combat/fighter.js` (limb rig, pose system, charge/flyaway/getUp states, vanish), `combat/attacks.js` (poses, uppercut/headbutt, chainHeavy route, CHARGE/FLYAWAY tuning), `combat/resolver.js` (charge damage scale, blast → fly-away, per-attack launch height), `combat/controller.js` (hold-to-charge, route/headbutt dispatch), `ai/rivalAgent.js` (safe-hold charging), `fx/vfx.js` + `fx/sfx.js` (afterimages, blast/slam), `ui/keymap.js` (boot overlay)

- Articulated arms/legs/head replace the sword; every attack poses the body
  (jab/cross/roundhouse/haymaker/rising-kick/headbutt) and walking swings
  the limbs. Dodges VANISH through their i-frames with afterimage ghosts.
- Hold heavy to charge: tap ×1 → full ×2.2; ≥50% charge turns the hit into
  a BLAST that sends the victim FLYING — tumbling, wall slams for extra
  damage, a get-up recovery with rise i-frames. Getting hit cancels a charge.
- Combo routes: light-light-HEAVY branches into an uppercut launcher; heavy
  pressed mid-ki-dash converts momentum into a headbutt.
- Key-map overlay on boot (H reopens): every control, charge explained.

**Exit criteria:** all FR-8 ACs pass; S-3 band holds; earlier suites green.
**Verification:** `tests/p10_martial.spec.mjs` 16/16; full p0–p10 regression
green; p8 band ×3 after the rival-charge retune (see 2026-07-08 log).

---

## `[x]` P11 — Jev plays the player (M9, developer-requested; TypeSafe System One)
**Closes:** FR-9.1..9.3 · **Modules:** `ai/jev.js` (state builder, question bank, wire adapter), `ai/jevPlayer.js` (executor driver, cadence, fallback), `ui/jevPanel.js` (toggle + backend config), `tools/jev-proxy.mjs` (credential-safe local proxy)

- Jev, TypeSafe's System One model, can drive the player fighter. State and
  questions stay strictly separate per the typesafe-ai skill's contract:
  `buildFightState` returns only named, observed facts (self, foe — state
  AND phase, duel, recent combat events, rivalry memory, last directive's
  outcome); a static 4-question bank (Choice `next_move` over the whole
  tactical vocabulary, speculative Noul `commit_full_charge`, Noul
  `danger_now`, Choice `voice` with a `stay_silent` no-match outcome) is
  the only place judgment logic lives. Code owns the workflow: a
  deterministic executor turns the chosen move into the same Fighter API
  a human drives; the rivalry systems (profiler, sync, zenkai) cannot tell
  Jev from a person.
- Living memory: recent combat events and the previous directive's outcome
  feed back into the NEXT state, and the rival's last taunt is remembered
  — the loop the developer asked for.
- Liveness: a fresh judgment on directive completion, staleness (~1.4s),
  or a salient event; the current directive keeps executing while a
  request is in flight; any failure (no backend, timeout, bad response)
  falls back to a heuristic bot so the duel never stalls, with the HUD
  showing `JEV · OFFLINE`.
- Credentials: the key defaults to a local proxy (`tools/jev-proxy.mjs`)
  that holds it server-side; a direct browser-side key is available in the
  panel as a marked dev-only path, stored in localStorage only, never in
  the repo or the bundle.
- **Documented limitation:** TypeSafe's live docs (docs.typesafe.ai) were
  unreachable from the build environment (network egress policy), so the
  wire format was corroborated against convergent independent public
  SDKs (2026-09-18) rather than read directly, confined to one adapter
  (`JevBackend.send`/`_normalize`). That corroboration missed two
  structural details, each caught via a live 422 from the developer's
  own proxy and fixed the same day (2026-09-20): `questions` must be a
  dictionary keyed by ID, not an array; and a Noul question's `criteria`
  must be an object (`{yes, no}`), not a bare string. See both logs.

**Exit criteria:** all FR-9 ACs pass; earlier suites keep passing; no key
ever appears in the repo or the published bundle.
**Verification:** `tests/p11_jev.spec.mjs` 34/34 (state shape, question
bank, typed-answer consumption incl. charge-commit gating, cadence +
in-flight persistence + freshness, living memory, offline fallback
liveness, runtime toggle, profiler blindness to driver identity, wire
contract via a mocked `fetch`); full p0–p11 regression green; p8 band ×2.

---

## `[x]` P12 — Jev as the nemesis (M10, developer-requested follow-up to M9)
**Closes:** FR-10.1..10.3 · **Modules:** `ai/jev.js` (question bank extracted to a reusable `buildQuestions(persona)`; `JevBackend` gets a namespaced `storageKey`), `ai/jevNemesis.js` (nemesis-eyed state + persona), `ai/jevNemesisDriver.js` (executor, falls back to `RivalAgent`), `ui/jevPanel.js` (generalized to a reusable, positionable component), `main.js` (rival-brain driver selection)

- The developer's actual intent for M9 was Jev AS the nemesis, not the
  player's own controller. Both are kept (zero regression risk to the
  already-tested M9 work; "Jev fights Jev" is a legitimate option too),
  but `JevNemesisDriver` is the one that matters for the game's core
  hypothesis — the autonomous, memory-driven rival, now literally
  model-driven instead of only GOAP-driven.
- One rulebook, two framings: the exact same tactical vocabulary and
  Choice/Noul questions from M9 are reused via `buildQuestions(persona)`
  — only the persona text and which Fighter is `me` vs `foe` change.
  State is built from the rival's own point of view: its in-world
  name/level/power, its OWN hate (not the foe's), the win/loss record,
  and its most recent ledger memories verbatim — richer than the
  player-side state, because the nemesis is the one who has lived this
  rivalry.
- The executor drives `rival` through the identical Fighter API; the
  gate for "a real duel is happening" is `RivalAgent.enabled` (the
  existing flow/macro-owned source of truth), and on ANY failure the
  fallback is `RivalAgent.update()` itself — the already balance-tested
  GOAP brain, not a generic bot — so the S-3 fairness band holds by
  construction whenever Jev is offline.
- Independent activation: "JEV IS THE NEMESIS" is a separate toggle from
  "LET JEV PLAY", each with its own namespaced backend config (separate
  localStorage key, independently a different TypeSafe account/key);
  both, either, or neither may be active.
- **Real bug found in testing:** the driver hands off to the fallback
  brain for any tick where its own directive is still null (e.g. the
  very first tick, before the first answer arrives) — by design, so the
  fighter is never idle. But with `RivalAgent`'s plan cleared to empty by
  a test, GOAP's own "nothing to do → replan now" rule (documented at
  P3) fires unconditionally and can commit the rival to an attack that
  then blocks Jev's own directive until it naturally finishes. Not a
  driver defect — the same interim-fallback design M9 already shipped —
  but it meant two probes needed a wider tick budget / a cleared
  `plannedDefense`, the same isolation convention `p3_rival` already
  uses for `RivalAgent`.

**Exit criteria:** all FR-10 ACs pass; S-3 band holds (structurally
guaranteed — offline Jev IS the GOAP brain); earlier suites keep passing.
**Verification:** `tests/p12_jev_nemesis.spec.mjs` 21/21 (shared
vocabulary + nemesis-framed state, executor parity, GOAP fallback both
mocked and unmocked-safe, cadence/freshness parity, canonical-channel
voice, independent toggling + config isolation); full p0–p12 regression
green; p8 band ×2.

---

## `[x]` P13 — Mobile: touch controls & responsive layout (M11, developer-requested)
**Closes:** FR-11.1..11.3 · **Modules:** `core/device.js` (detection), `core/input.js` (`press`/`release`, `touchAxes`), `ui/touchControls.js` (joystick, camera drag-zone, action buttons), `ui/hud.js`/`ui/jevPanel.js`/`ui/keymap.js`/`index.html` (responsive CSS + mobile content), `core/tuning.js` (`TOUCH`), `main.js` (detection wiring)

- One detection (`isMobile()`: touch-capable AND phone-sized — a
  touchscreen laptop stays on the desktop experience) sets a
  `body.mobile` class every UI module's CSS keys off. HUD bars move to
  the top corners, the two Jev panels move to the top-left, the fps
  readout hides — nothing overlaps the touch controls.
- Touch controls drive the EXACT same `Input` state keyboard/mouse
  already write — `Input.press(action)`/`release(action)` mirror
  keydown/keyup, and a joystick's continuous `Input.touchAxes` is read
  by `moveAxes()` ahead of the WASD-derived vector. `PlayerController`
  needed zero changes: one input abstraction, two producers (the same
  discipline as the rival's GOAP-vs-Jev drivers). A joystick (movement),
  a full-screen drag zone (camera orbit, feeding the same `mouseDX`/
  `mouseDY` mouselook already uses), and on-screen buttons for the whole
  action set — including heavy's hold-to-charge, which needed no special
  handling since press/release already IS what `startCharge`/
  `releaseCharge` are gated on.
- Page-level gestures that would fight a game (pinch-zoom, pull-to-
  refresh, double-tap-zoom) are suppressed on the game surface.
- The key-map overlay shows touch-instruction rows instead of keyboard
  rows on mobile, with a small always-visible `?` button replacing the
  `H` key (no keyboard to press it from).

**Exit criteria:** all FR-11 ACs pass; a desktop context is proven
byte-identical to every earlier suite (no touch DOM, no mobile class,
`touchControls === null`); earlier suites keep passing.
**Verification:** `tests/p13_mobile.spec.mjs` 19/19 — real `TouchEvent`
dispatch (not just internal method calls) driving joystick movement,
hold-to-charge through the actual button, tap-attack, camera-drag look,
responsive HUD position, and mobile key-map content, PLUS an explicit
desktop-context regression check in the same run; full p0–p13 regression
green; p8 band ×2.

---

## After MVP

Post-MVP items in spec §9 (LLM taunts, Unity port, asset pipeline, climbing,
more zones) get their own roadmap revision *after* the P8 acceptance review —
not before.
