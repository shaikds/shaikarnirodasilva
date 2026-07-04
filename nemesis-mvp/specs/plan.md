# NEMESIS MVP — Technical Plan (plan.md)

Companion to `spec.md` (requirements) and `roadmap.md` (phases). This
document decides **how** the spec is built: stack, module boundaries, data
schemas, and the traceability from every module to the FRs it implements.

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Engine/render | **Three.js**, vendored copy in `vendor/three/` | NFR-1: no CDN — must run on GitHub Pages, `file://`, sandboxed iframes |
| Language | Vanilla JS ES modules + import map in `index.html` | NFR-2: zero build step |
| Physics | **Custom kinematic** (capsule vs. AABB/planes) | Duel combat needs determinism and tiny scope; a physics engine adds bulk and jank |
| Persistence | `localStorage` behind the guarded `store` helper (pattern proven in `nemesis-arena/game.js:49`) | AC-6.1.1 |
| Verification | Playwright scripts in `tests/`, driving real keyboard events against exposed state (`window.__game`) | NFR-3; same harness style already used to test/record the 2D game |
| Audio | None in MVP | Spec §2.2 |

## 2. Folder layout

```
nemesis-mvp/
  index.html              # import map, canvas, HUD roots, debug root
  specs/                  # spec.md, plan.md, roadmap.md (this trio)
  vendor/three/           # three.module.js (pinned version, committed)
  src/
    core/
      loop.js             # fixed-timestep update + rAF render, slow-mo channel
      states.js           # game-state machine (see §3)
      input.js            # action-mapped input w/ buffer queue (AC-4.6.1)
      store.js            # guarded localStorage (ported)
      tuning.js           # ALL tuning tables re-exported from one place (NFR-4)
    combat/
      fighter.js          # shared Fighter: HP/energy/state/stagger (player & rival)
      attacks.js          # DATA: the attack table (AC-4.2.3)
      resolver.js         # hit arcs, blocks, parry timing, combo scaling, hitstop
      controller.js       # player character controller (move/jump/dodge)
      projectiles.js      # special-attack bolts
    ai/
      goap.js             # generic planner: atoms, actions, A* (both layers)
      microActions.js     # DATA: combat action defs (AC-3.4.2)
      macroActions.js     # DATA: Hunt/Train/Ambush defs (AC-3.2.1)
      rivalAgent.js       # glues planner to Fighter + navigation; skill scaling
      playerProfile.js    # style metrics (ported from nemesis-arena PlayerProfile)
      syncEngine.js       # ELO rating -> skill (ported from nemesis-arena SyncEngine)
    rivalry/
      rivalManager.js     # profile lifecycle, progression, appearance tags
      ledger.js           # append-only log, cap rules (AC-2.2.4)
      taunts.js           # TauntEngine: generateTaunt(context) (AC-3.1.1)
      tauntFragments.js   # DATA: fragment pools per trigger x hate band
    world/
      zone.js             # blockout geometry + named locations + collision data
      navigation.js       # waypoint graph over the zone for macro movement
      camera.js           # third-person rig, lock-on framing, impulse/shake
    ui/
      hud.js              # bars, meters, combo counter, damage numbers, subtitles
      prompts.js          # tutorial + escape prompts (M1)
      debug.js            # the ` panel (FR-6.2)
  tests/
    helpers.js            # boot page, expose state, key-event bot utilities
    p1_movement.spec.mjs  # one spec file per roadmap phase, named by phase
    ...
```

Rule: **`DATA:` files contain no logic; logic files contain no tuning
constants.** Everything numeric imports from `core/tuning.js` (which
aggregates the data modules) — this is NFR-4 made structural.

## 3. Game-state machine (`core/states.js`)

Implements the Genesis Flow (M1) and steady-state loop as explicit states:

```
BOOT ─▶ TUTORIAL ─▶ FIRST_BLOOD ─▶ FORCED_ESCAPE ─▶ FREE_ROAM ◀─▶ ENCOUNTER
              (skip if rival exists: AC-1.1.5)          ▲              │
                                                        └── duel ends ─┘
```

- Each state owns enter/exit/update; transitions log to the session log.
- `FORCED_ESCAPE` freezes combat (AC-1.3.1) and arms the exit trigger;
  its resolve path writes the genesis ledger entries (AC-1.3.2/3).
- `FREE_ROAM` runs the macro-GOAP agent; `ENCOUNTER` runs micro-GOAP.
  Encounter entry is proximity + rival intent (AC-5.1.4).

## 4. Combat architecture (M4)

- **Fighter** is one class for both combatants: HP, energy, poise/stagger
  timers, state (idle/attack/block/parry/dodge/stagger/hitstun), current
  attack phase. It consumes *intents* (`{move, attack:'light'|'heavy'|'special',
  block, dodge, jump}`) — the player controller and the rival agent both
  produce intents, so there is exactly one combat rulebook (AC-4.4.3 fairness).
- **Attack table** (`combat/attacks.js`): per attack — windup/active/recover,
  damage, range, arc, knockback, energy gain, cancel flags, chain links
  (light 3-hit string), track rate. Direct 3D adaptation of the proven
  `ATTACKS` table in `nemesis-arena/game.js:32`.
- **Resolver** applies: frontal-arc range test on active frames (AC-4.2.5),
  block/parry windows (150 ms pre-impact parry, AC-4.3.2), combo scaling
  (AC-4.5.1), hitstop by writing to the loop's freeze channel (AC-4.6.3),
  camera impulse via `world/camera.js`.
- **Input buffering** lives in `core/input.js` as a 150 ms action queue the
  Fighter drains at phase boundaries (AC-4.6.1); cancel legality comes from
  the attack table's cancel flags (AC-4.6.2).
- **Fixed timestep** (120 Hz sim, interpolated render) keeps parry windows
  and i-frames deterministic for tests.

## 5. GOAP (M3) — one planner, two layers

`ai/goap.js` is generic:

```js
planner.plan(worldState, goal, actions, { maxDepth, costNoise }) -> [action...]
```

- **World state**: flat object of booleans/numbers; actions declare
  `pre(state)`, `effect(state)`, `cost(state, profile)`.
- **Search**: A* over action sequences; `maxDepth` and `costNoise` come from
  the sync-engine skill (AC-3.3.4) — a weak nemesis literally plans worse.
- **Costs are the mirror**: `cost()` receives the player styleProfile;
  actions the player favors get cheaper for the rival (AC-3.3.2). This is
  the architectural continuation of the 2D game's mirroring, upgraded from
  dice weights to plan preference.

**Layer 1 (macro, FREE_ROAM)** — goals scored from hate, record, ledger
patterns (AC-3.2.3); plans move the rival across `world/navigation.js`
waypoints. Train accrues XP; Ambush arms a first-strike bonus at the
chokepoint.

**Layer 2 (micro, ENCOUNTER)** — goals per AC-3.4.1, replan on state-change
triggers with skill-scaled interval (AC-3.4.3). The selected goal is exported
for the HUD hint and debug panel (AC-3.4.5).

## 6. Rivalry data (M2)

Schemas exactly as spec AC-2.1.1 / AC-2.2.1. Additional decisions:

- **Single storage key** `nemesis-rival-v1` holding `{profile, ledger}`;
  version suffix for future migrations. Player record under
  `nemesis-player-v1`.
- **Progression growth table** (AC-2.3.3), data in `rivalry/rivalManager.js`:

  | Player dominant style (from styleProfile) | Rival level-up invests in |
  |---|---|
  | blocking / defenseRate high | attack (break through) |
  | aggression high | hp (outlast) |
  | special usage high | speed (close distance) |
  | balanced | even split |

- **Appearance tags** append on player wins: `Scarred` (1st loss),
  `OneEye` (3rd), plus hate-driven `Burning` at hate ≥ 90. Tags map to
  emissive material variations on the rival's blockout body (AC-2.1.3).

## 7. Taunt engine (FR-3.1)

Template grammar over fragment pools:

```
line = opener(hateBand) + memory(ledgerEvent) + closer(trigger)
```

- Pools keyed by `trigger × hateBand`, with a no-immediate-repeat shuffle bag
  (AC-3.1.3). `memory()` renders the most recent *significant* ledger entry
  (significance ranking: genesis events > duel outcomes > observations).
- The canonical AC-3.1.2 case ships as a dedicated pool so the first
  re-encounter is always a written, high-quality line — the PRD's pre-baked
  quality principle, applied to text.
- Backend interface (`generateTaunt(context)`) is async-capable so an LLM
  can replace it without touching callers (spec §9.1).

## 8. World & camera (M5)

- **Zone**: hand-placed primitives (boxes/cylinders/ramps) with named
  locations (`tutorialPocket`, `arena`, `escapeRoute`, `rivalBase`,
  `chokepoint`, `openGround`). Collision = static AABB/plane list resolved
  against the fighters' capsules. No navmesh — a small hand-authored
  waypoint graph (`navigation.js`) is enough for macro movement.
- **Camera** (`world/camera.js`): orbit rig with collision probe (pull-in on
  obstruction), lock-on framing that keeps both fighters in view
  (AC-4.1.2), impulse/shake budget (AC-4.6.4), and the slow-mo-aware update
  order: sim → camera → render.

## 9. Traceability

| Module | Implements |
|---|---|
| `core/states.js`, `ui/prompts.js` | FR-1.1, FR-1.2, FR-1.3 |
| `rivalry/rivalManager.js`, `ledger.js` | FR-2.1, FR-2.2, FR-2.3 |
| `rivalry/taunts.js`, `tauntFragments.js` | FR-3.1 |
| `ai/goap.js`, `macroActions.js`, `rivalAgent.js`, `world/navigation.js` | FR-3.2 |
| `ai/playerProfile.js`, `syncEngine.js` | FR-3.3 |
| `ai/microActions.js`, `rivalAgent.js` | FR-3.4 |
| `combat/*`, `core/input.js`, `world/camera.js` | FR-4.1 – FR-4.6 |
| `world/zone.js` | FR-5.1 |
| `core/store.js` | FR-6.1 |
| `ui/debug.js` | FR-6.2 |
| `fx/vfx.js`, `fx/textures.js`, `world/landmarks.js`, `ui/hud.js` (reticle/plate/flash) | FR-4.7 (enhancement) |

Reverse direction: `roadmap.md` names, per phase, the FR/ACs it closes.

## 10. Ported code (do not rewrite what is proven)

From `nemesis-arena/game.js`:
- `PlayerProfile` (metrics + EMA pattern) → `ai/playerProfile.js`, extended
  with 3D metrics (engagement distance in meters, lock-on usage).
- `SyncEngine` (rating→skill mapping, roundEnd update) → `ai/syncEngine.js`
  nearly verbatim.
- `store` guarded-localStorage helper → `core/store.js` verbatim.
- The `ATTACKS` data-table pattern and combo/energy constants as the starting
  tuning values for `combat/attacks.js`.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Third-person camera feels bad (the classic 3D killer) | Camera is P1, before any combat — it gets the longest bake time; lock-on-first design reduces free-camera pressure |
| 3D melee readability (whiffs feel unfair) | Generous frontal arcs, soft target tracking (AC-4.2.4), damage numbers + hitstop for unambiguous feedback |
| GOAP plans look identical to reflex AI (wasted complexity) | Goal HUD hint (AC-3.4.5) + BreakGuard/Ambush behaviors that reflex AI cannot produce; AC-3.4.4 proves it |
| Sync engine fails in 3D (fights runaway) | S-3 automated 10-duel band test runs from P3 onward, not just at the end |
| Perf on integrated GPU paths | NFR-5 degraded mode; particle budgets in tuning.js |
| Scope creep toward the 2D game's features (climbing etc.) | Spec §2.2 is contractual; roadmap has no climbing phase |
| Fixed-timestep loop silently loses time under slow rendering (found via FR-4.7's shadow pass making headless software rendering run ~180ms/frame) | `core/loop.js`'s per-frame clamp raised 100ms→300ms with a matching catch-up guard, so a genuinely slow renderer still advances game time correctly instead of discarding it — protects real users on weak hardware, not just this test environment |
| Wall-clock-timed tests are fragile once frame times are large/variable | Standing convention (started in P2, now applied project-wide): anything asserting a sub-~300ms window drives `loop._frame`/`loop.updateFn` with synthetic step counts instead of real `setTimeout` waits |

## 12. Document governance & work logs

Per `spec.md` §11: spec leads, code follows. This plan is amended whenever the
built architecture drifts from it — at the latest at phase closure. Every
working session appends a dated log to `nemesis-mvp/logs/YYYY-MM-DD.md`
(what/decisions/why/results/carry-overs); phase closures include verification
output in that day's entry. The logs are the project's memory — fitting, for
this project in particular.
