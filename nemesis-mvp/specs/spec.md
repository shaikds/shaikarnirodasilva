# NEMESIS MVP — Requirements Specification (spec.md)

| | |
|---|---|
| **Version** | 1.0 (derived from PRD "Project Nemesis" v1.1, Hebrew, 2026-04-18) |
| **Status** | Draft for approval |
| **Platform** | Web browser (desktop), Three.js, keyboard + mouse |
| **Repo home** | `nemesis-mvp/` on branch `claude/adaptive-combat-nemesis-843f57` |
| **Companion docs** | `plan.md` (architecture), `roadmap.md` (phases) |

Every functional requirement (FR) below has numbered acceptance criteria (AC).
An FR is **done** only when all of its ACs pass. ACs are written to be
verifiable either by a scripted headless run (Playwright driving the game) or
by a short manual check the developer can perform in under a minute.

---

## 1. Goal and hypothesis

**MVP hypothesis:** interacting with an autonomous rival that evolves in
parallel with the player, remembers the player's actions, and behaves
vengefully produces a fun experience.

Anything that does not directly test this hypothesis is out of scope
(advanced graphics, large world, linear story, generated art/audio assets).

### 1.1 Success criteria (from PRD §6, made measurable)

- **S-1 Genesis works:** a first-time player completes the tutorial, loses
  the First Blood fight, and successfully escapes — understanding from the
  flow alone (no external explanation) that the rival is now their nemesis.
- **S-2 Emotional reactivity:** on re-encounter, the rival's taunt refers
  specifically to a real past event from the ledger (e.g. the escape), and
  the rivalry state (hate, level, record) is visibly different from the
  first encounter.
- **S-3 Fair fights forever:** across 10 consecutive post-genesis duels
  against a same-skill scripted player bot, neither side's win rate exceeds
  70% (the sync engine keeps fights contested).
- **S-4 Fun-first combat:** combat implements every game-feel requirement in
  M4 (buffering, cancels, hitstop, lock-on) and holds 60 fps during a duel.

## 2. Scope

### 2.1 In scope
- Third-person 3D combat in a small single zone (blockout geometry).
- The Genesis Flow: tutorial → unwinnable First Blood fight → forced escape.
- Persistent rival: profile, interaction ledger, progression, appearance tags.
- Two-layer GOAP rival AI (macro world behavior + micro combat tactics) fed
  by adaptive player-style profiling (ported from `nemesis-arena/`).
- Template-based taunt engine (text on screen; no audio).
- Persistence via guarded localStorage; debug panel.

### 2.2 Out of scope (MVP)
- Unity 6 port, Meshy/Mootion/ComfyUI asset generation, ElevenLabs VO,
  Suno music — all deferred to the post-MVP pipeline (§9).
- Local/remote LLM inference (taunt engine has an LLM-shaped interface so an
  LLM can replace templates later; see FR-3.1).
- Wall/ceiling climbing (signature of the 2D prototype; post-MVP here).
- Multiplayer, saves beyond one rival slot, gamepad support, mobile.
- Visual polish beyond what M4 defines as combat-feel requirements.

## 3. Definitions

| Term | Meaning |
|---|---|
| **Rival / Nemesis** | The single persistent AI opponent. |
| **Encounter** | Any period where player and rival are engaged in combat. |
| **Round** | One encounter from first hit until a fighter dies or escapes. |
| **Ledger** | Append-only log of notable events between player and rival. |
| **Sync engine** | ELO-style rating that maps player performance to rival skill (0..1). |
| **Profile (player)** | Live statistical model of the player's fighting style. |
| **GOAP** | Goal-Oriented Action Planning: A* search over world-state atoms through actions with preconditions/effects/costs. |
| **Hitstop** | Sub-100ms global freeze on impact that sells contact. |

---

## 4. M1 — Genesis Flow

### FR-1.1 Tutorial primer
A short scripted sequence in a closed pocket of the zone teaching movement,
camera/lock-on, light/heavy attack, block, and dodge — each gated on the
player actually performing it.

- **AC-1.1.1** Tutorial presents exactly these steps in order: move, camera +
  lock-on, light attack, heavy attack, block, dodge. Each step's prompt stays
  on screen until the action is performed at least once.
- **AC-1.1.2** A training dummy is present; attack steps require landing the
  hit on the dummy (a whiff does not advance the step).
- **AC-1.1.3** Completing the last step opens the path to the arena (visible
  gate/barrier change) and logs `tutorial_complete` to the session log.
- **AC-1.1.4** Total tutorial time for a competent player ≤ 90 seconds.
- **AC-1.1.5** A returning player (rival already exists in storage) skips the
  tutorial entirely and spawns in the zone.

### FR-1.2 First Blood fight
Immediately after the tutorial the player meets the newborn rival, who is
disproportionately strong. The fight is designed to be lost.

- **AC-1.2.1** The rival's First Blood stats make it effectively unbeatable
  by a new player: rival damage ×3 player baseline, rival HP ×2 player
  baseline, sync-engine skill floor 0.9 for this fight only.
- **AC-1.2.2** The rival is visually distinct (silhouette + color) and is
  introduced with a name card ("<Name> — ???") before the fight starts.
- **AC-1.2.3** The fight arena is inescapable until FR-1.3 triggers (invisible
  walls or closed gates; leaving attempts are blocked).
- **AC-1.2.4** The profiling system (FR-3.3) is already recording during this
  fight — the rival's first lesson about the player comes from it.

### FR-1.3 Forced escape
When either fighter reaches 15% HP the fight pauses and an escape becomes the
way out. Escaping creates the rivalry.

- **AC-1.3.1** At player HP ≤ 15%: combat freezes (both fighters), a prominent
  prompt appears showing the escape control and the (now open) escape route is
  highlighted. The rival does not deal damage during the frozen prompt.
- **AC-1.3.2** Player escape: reaching the escape route's exit trigger ends the
  encounter, writes ledger entry
  `{ event: "player_fled_first_duel", label: "Player cowardice: Fled the initial duel." }`,
  sets the rival's record to 1 win / 0 losses, raises `EmotionalState`
  (hate) by +25, and marks the rivalry as officially started.
- **AC-1.3.3** Symmetric branch — rival at 15% first (exceptionally skilled
  player): the rival disengages and flees along its own route; ledger entry
  `rival_fled_first_duel` is written, the player takes the first win, and the
  rival's hate rises even more (+40, humiliation).
- **AC-1.3.4** After either escape, the game transitions to the open-zone state
  (M5) with the rival removed to its macro-AI start location.
- **AC-1.3.5** Death is impossible during First Blood: HP clamps at the 15%
  trigger until the escape resolves (the prompt cannot be skipped by dying).

---

## 5. M2 — Rivalry Manager

### FR-2.1 Persistent rival profile
One JSON document describing the rival, surviving page reloads.

- **AC-2.1.1** Schema (all fields required):
  ```json
  {
    "name": "string",
    "level": 1,
    "stats": { "hp": 100, "attack": 10, "speed": 1.0 },
    "appearanceTags": ["string"],
    "emotionalState": 0,
    "record": { "wins": 0, "losses": 0, "escapes": 0 },
    "styleProfile": { },
    "rating": 1000,
    "createdAt": "ISO-8601"
  }
  ```
  `styleProfile` is the FR-3.3 player-style mirror; `rating` feeds the sync
  engine. `emotionalState` is the 0–100 hate scale.
- **AC-2.1.2** The profile is created at First Blood start with a generated
  name and persists via the guarded storage helper (M6); reloading the page
  restores it byte-identical (minus in-round transients).
- **AC-2.1.3** `appearanceTags` affect rendering: each tag maps to a visible
  variation on the rival's blockout body (e.g. `"Scarred"` → emissive scar
  stripe). At least 2 tags are implemented; a tag is added when the player
  wins a duel (the rival carries the mark of every defeat).
- **AC-2.1.4** `emotionalState` moves on events (escape +25, rival humiliated
  +40, rival win −10 floor 0, taunt ignored +5) and is clamped 0–100.

### FR-2.2 Interaction ledger
Append-only memory of every notable interaction.

- **AC-2.2.1** Entry schema:
  `{ "ts": epoch_ms, "event": "machine_key", "label": "human sentence", "data": {} }`.
- **AC-2.2.2** At minimum these events are recorded when they occur:
  `player_fled_first_duel`, `rival_fled_first_duel`, `duel_won`, `duel_lost`,
  `player_escaped_duel`, `ambush_sprung`, `rival_trained`, plus one
  style observation per completed duel (e.g. `"Player hid behind block 62% of the fight"`),
  derived from the FR-3.3 profile.
- **AC-2.2.3** The ledger persists with the profile and is readable in the
  debug panel (FR-6.2) in reverse chronological order.
- **AC-2.2.4** The ledger caps at 100 entries; on overflow the oldest
  non-genesis entries are dropped (the first-duel entry is never dropped —
  a nemesis never forgets how it was born).

### FR-2.3 Progression algorithm
After every round the rival grows in relation to the player's choices and
the outcome — always tracking the player's level.

- **AC-2.3.1** The sync-engine rating updates after every duel from win/loss
  plus HP margin (port of `SyncEngine.roundEnd` in `nemesis-arena/game.js`),
  and rival skill = `clamp((rating - 700) / 700, 0.05, 1)`.
- **AC-2.3.2** The rival gains XP per round (win or lose); each level-up
  (thresholds: 100·level XP) raises `stats` by a documented growth table and
  is announced on next encounter ("It has grown stronger").
- **AC-2.3.3** Stat growth is style-relative: the rival invests its level-up
  in countering the player's dominant style (e.g. player blocks a lot →
  attack growth; player is aggressive → hp growth). The mapping table lives
  in `plan.md` §Rivalry and is data, not code branches.
- **AC-2.3.4** Verified by S-3: 10 bot-vs-rival duels stay within the 70%
  win-rate band.

---

## 6. M3 — AI & Behavior

### FR-3.1 Taunt engine (dialogue)
Rule-based generator composing rival speech from the ledger, emotional state,
and appearance tags. Interface is LLM-shaped for the post-MVP swap.

- **AC-3.1.1** API: `generateTaunt(context) -> string` where `context`
  contains the rival profile, the last N ledger entries, and the trigger
  (`encounter_start`, `player_low_hp`, `rival_low_hp`, `duel_end`,
  `ambush_sprung`). The same signature must accept an LLM backend later
  without caller changes.
- **AC-3.1.2** On the first re-encounter after Genesis, the taunt explicitly
  references the flight (e.g. contains a coward/fled fragment tied to
  `player_fled_first_duel`). This is the PRD's canonical moment and is
  covered by an automated test.
- **AC-3.1.3** Taunts vary: the same trigger fired 5 times in a row produces
  at least 3 distinct lines (fragment pools with no immediate repeats).
- **AC-3.1.4** Emotional state changes tone: hate < 34 uses measured
  fragments, 34–66 contemptuous, ≥ 67 furious. At least one automated check
  per band.
- **AC-3.1.5** Taunts render as timed subtitle text with the rival's name;
  no audio in MVP.

### FR-3.2 Macro decisions — GOAP layer 1 (world)
Outside encounters the rival is an autonomous agent in the zone choosing
among macro behaviors.

- **AC-3.2.1** Macro goals implemented: **Hunt** (seek and engage the player),
  **Train** (hold at the rival base; passively gains bonus XP per second
  trained), **Ambush** (move to the chokepoint and wait hidden; engages with
  a first-strike bonus when the player passes).
- **AC-3.2.2** Goal selection is a GOAP plan over world-state atoms (at
  minimum: `hateLevel`, `hpAdvantage`, `playerNearChokepoint`,
  `recentLossToPlayer`, `energyFull`) — not a hardcoded if/else chain. The
  planner is the same engine as FR-3.4 layer 2.
- **AC-3.2.3** High hate biases Hunt, recent loss biases Train, player
  predictability (repeatedly using the same route, from the ledger) biases
  Ambush. Each bias is demonstrable by forcing the state in the debug panel.
- **AC-3.2.4** The current macro goal is visible in the debug panel and
  (when the rival is on-screen) as a subtle behavior tell — hunting rivals
  move directly at the player; ambushing rivals are stationary off-path.

### FR-3.3 Adaptive style mirroring
Port of the 2D game's `PlayerProfile`: the rival learns and mirrors how the
player fights, at the player's level.

- **AC-3.3.1** Tracked per player, EMA/counter based (3D adaptation of
  `nemesis-arena/game.js` `PlayerProfile`): aggression, light/heavy
  preference, special usage rate, block-vs-dodge preference, defense rate,
  reaction time to windups, preferred engagement distance, jump/air usage,
  combo follow-up rate.
- **AC-3.3.2** These metrics drive micro-GOAP action costs (FR-3.4) so the
  rival *prefers the player's own tools*. Test: a bot that only heavy-attacks
  for 3 duels must raise the rival's heavy-attack usage share by ≥ 20
  percentage points versus its baseline.
- **AC-3.3.3** The profile is stored inside the rival JSON (`styleProfile`)
  and survives reload.
- **AC-3.3.4** Skill scaling (sync engine) modulates the rival's reaction
  delay (420→130 ms), plan depth (2→4 actions), replan interval and cost
  noise — the "mistakes" model. Values in a single tuning table.

### FR-3.4 Combat tactics — GOAP layer 2 (micro)
In-encounter decisions are plans, not reflexes.

- **AC-3.4.1** Micro goals implemented: `DamagePlayer` (default),
  `BreakGuard` (player blocking a lot right now), `EscapePressure` (rival
  is being comboed / low stamina), `ChargeSpecial` (energy low, player far),
  `PunishRetreat` (player runs away at low HP).
- **AC-3.4.2** Action library (min): approach, retreat, strafe, lightAttack,
  heavyAttack (effect: breaks guard), dodge, block, fireSpecial
  (precondition: energyFull), keepDistance. Each defined as data:
  preconditions, effects, base cost.
- **AC-3.4.3** Replanning triggers on world-state change (player starts
  blocking, energy fills, HP thresholds), at most every `replanInterval`
  (skill-scaled per AC-3.3.4).
- **AC-3.4.4** Demonstrable emergent chain: versus a bot that holds block,
  the rival must select a plan containing heavyAttack before light attacks
  ≥ 70% of the time (automated test).
- **AC-3.4.5** The rival's current micro goal is exposed in the debug panel
  and optionally as a HUD hint ("NEMESIS: BREAKING YOUR GUARD") — toggleable,
  on by default in MVP for the nemesis-brain fantasy.

---

## 7. M4 — Combat System (fun-first core)

Third-person melee duel combat. This module is the quality bar: every AC here
is a **feel** requirement, and cheap-but-critical game-feel elements are
requirements, not effects.

### FR-4.1 Movement & camera
- **AC-4.1.1** Controls: WASD move (camera-relative), mouse orbits camera,
  Space jump, Shift dodge-roll, mouse-wheel or Tab toggles lock-on.
- **AC-4.1.2** Lock-on: camera frames both fighters; movement becomes
  strafe-relative to the target; lock breaks automatically beyond 25 m or on
  target death; soft re-acquire on re-entry within 2 s.
- **AC-4.1.3** Character turns toward movement direction (out of lock-on)
  with smoothed rotation; no instant snapping except attack tracking below.
- **AC-4.1.4** Dodge-roll: 300 ms, i-frames on the first 200 ms, moves 3.5 m
  in the input direction (backstep if neutral), 500 ms cooldown.
- **AC-4.1.5** Jump exists and is combat-neutral (no aerial attacks in MVP);
  landing has no recovery lag under 2 m fall height.

### FR-4.2 Attacks
- **AC-4.2.1** Light attack: ~0.4 s total (windup/active/recover ≈
  130/90/200 ms), low damage, chains into itself into a 3-hit string with
  distinct final hit.
- **AC-4.2.2** Heavy attack: ~0.8 s total (330/110/340 ms), high damage,
  **breaks block** (blocked heavy still deals 45% and staggers the blocker).
- **AC-4.2.3** All attack numbers (timings, damage, range, knockback, energy
  gain) live in one data table (`attacks.js` or JSON) — no magic numbers in
  logic. Same table drives player and rival.
- **AC-4.2.4** Attacks softly track the locked target during windup (max
  60°/s turn), then commit on active frames.
- **AC-4.2.5** Melee hit test: target within range and within a 90° frontal
  arc during active frames; one hit max per swing per target.

### FR-4.3 Defense
- **AC-4.3.1** Block (hold): reduces light damage by 85%, heavy by 55%
  (then AC-4.2.2 stagger), special by 50%; blocking halves movement speed.
- **AC-4.3.2** Timed parry: a block initiated within 150 ms before impact
  negates all damage, plays a distinct flash, and staggers the attacker for
  600 ms (guaranteed punish window). Parry has a 400 ms whiff recovery so it
  is a read, not a mash.
- **AC-4.3.3** Dodge i-frames beat everything including specials (AC-4.1.4).

### FR-4.4 Special attack
- **AC-4.4.1** Energy meter 0–100: +3/s passive, +14 landing a hit, +8
  taking a hit. Special costs 60. Meter and readiness shown on HUD.
- **AC-4.4.2** Special: 480 ms windup then a fast aimed projectile
  (homing-aimed at fire time, not tracking) dealing ~1.3× heavy damage with
  large knockback. Blockable per AC-4.3.1, dodgeable per AC-4.3.3.
- **AC-4.4.3** The rival's special is visually distinct (color) but
  mechanically identical — mirror-matched fairness.

### FR-4.5 Combo & damage rules
- **AC-4.5.1** Consecutive clean hits within 1.6 s chain a combo counter;
  damage scales +8% per combo step, capped at +48%; being hit or blocked
  resets the counter.
- **AC-4.5.2** Combo count ≥ 2 shows an on-screen counter; ≥ 5 triggers a
  brief slow-motion beat (single channel — cannot stack/retrigger during
  itself).
- **AC-4.5.3** Damage numbers appear at impact point (world-anchored,
  floating). This is combat readability, not decoration.

### FR-4.6 Game feel (hard requirements)
- **AC-4.6.1** Input buffering: attack/dodge inputs during the last 150 ms of
  any recovery are queued and fire on the first possible frame. Test: buffered
  input executes with 0 idle frames between actions.
- **AC-4.6.2** Cancel rules: light recovery cancels into dodge; anything
  cancels into parry attempt; heavy is commit-only. Table-driven.
- **AC-4.6.3** Hitstop: 40 ms (light) / 80 ms (heavy/special) global freeze
  on landed hits; blocked hits 20 ms.
- **AC-4.6.4** Camera impulse: small directional kick on landing/receiving
  heavy+ hits; screen shake budgeted (never during aiming a special).
- **AC-4.6.5** Stagger/hit reactions: light hits flinch (150 ms), heavy hits
  stagger (400 ms), knockback respects attack table values.
- **AC-4.6.6** 60 fps sustained during a duel with all systems on (M2 Pro,
  Chrome). Frame budget checked in the P8 playtest.

---

## 8. M5 — World & M6 — Persistence

### FR-5.1 The zone
- **AC-5.1.1** One contiguous zone of blockout geometry (primitives +
  flat/emissive materials) containing, connected and walkable: tutorial
  pocket, main arena, escape route (gated until FR-1.3), rival base, one
  chokepoint (Ambush spot), open ground between them.
- **AC-5.1.2** Traversal of the full zone takes 30–60 s on foot; nothing is
  more than one wrong turn from recognizable.
- **AC-5.1.3** Zone collision: the player can never leave the zone or fall
  through geometry (Playwright soak: 60 s of random inputs ends with the
  player inside bounds).
- **AC-5.1.4** Encounters can begin anywhere in the zone (macro-AI driven),
  not only in the arena.

### FR-6.1 Persistence
- **AC-6.1.1** All persistent state (rival profile incl. styleProfile +
  ledger, plus a small player record) is stored through the guarded `store`
  helper pattern from `nemesis-arena/game.js` — storage-denied environments
  degrade to session-only play without errors.
- **AC-6.1.2** A full reload mid-rivalry restores: rival level/stats/tags,
  hate, record, ledger, rating, and macro-AI state (goal re-planned from
  restored state, not persisted mid-plan).

### FR-6.2 Debug panel
- **AC-6.2.1** A toggleable overlay (` \` ` key) shows: rival JSON (live),
  ledger (reverse-chron), current macro & micro GOAP goal + plan, sync
  rating/skill, player styleProfile, and fps.
- **AC-6.2.2** Debug actions: reset rivalry (wipe storage), force hate value,
  force macro goal, grant energy, set both HP — enough to reproduce every AC
  in this spec manually.

---

## 9. Post-MVP (explicitly deferred, kept from PRD)

Order is a suggestion; nothing here blocks MVP acceptance.

1. **LLM taunts** — swap TauntEngine backend (same `generateTaunt` interface)
   to a local model (PRD: LLMUnity + Llama-3-8B GGUF) or API.
2. **Unity 6 port** — the PRD's target stack; spec/plan/roadmap remain the
   source of truth, C# mirrors `src/` module boundaries
   (`RivalBrain.cs`, `InteractionLedger.cs`, `CombatSystem.cs`, managers).
3. **Asset pipeline 2026** — Meshy/Hunyuan3D models, Mootion/Mixamo
   animations, ComfyUI UI art, ElevenLabs VO (pre-baked WAV insults),
   Suno v5 adaptive music, AI SFX.
4. **Wall/ceiling climbing** — reintroduce the 2D prototype's traversal in 3D.
5. **Multiple zones & richer macro-AI** (patrol routes, resource goals).

## 10. Non-functional requirements

- **NFR-1** No runtime network dependency: Three.js vendored into the repo;
  the game runs from any static file server (`python3 -m http.server`),
  GitHub Pages, and sandboxed iframes. Plain `file://` additionally works in
  browsers that permit module loading from disk (Chromium needs
  `--allow-file-access-from-files`; the test harness uses it). *(Amended at
  P0 close — browsers block ES modules over bare `file://`.)*
- **NFR-2** No build step: ES modules + import map; `index.html` opens as-is.
- **NFR-3** Headless-testable: every "automated test" AC runs via a
  Playwright script under `nemesis-mvp/tests/` against exposed game state
  (same technique already used for `nemesis-arena`).
- **NFR-4** All tuning values (combat table, GOAP costs, progression growth,
  skill scaling) centralized in data modules — playtest tuning must never
  require touching logic.
- **NFR-5** 60 fps target per AC-4.6.6; degraded-mode floor of 30 fps with
  particle counts halved (auto, based on frame-time EMA).

---

## 11. Status & document governance

**Sync rule:** the three specs are living documents and must describe reality
at every phase boundary. Closing a roadmap phase requires: (1) updating this
status table, (2) updating the phase marker in `roadmap.md`, (3) amending
`plan.md` on any architecture drift, and (4) a dated entry in
`nemesis-mvp/logs/YYYY-MM-DD.md` recording work done, decisions + rationale,
and verification results. If a requirement changes mid-phase, the change is
edited here first (with a note in the day's log), then implemented — spec
leads, code follows.

| Requirement | Phase | Status |
|---|---|---|
| FR-1.1 Tutorial primer | P5 | not started |
| FR-1.2 First Blood fight | P5 | not started |
| FR-1.3 Forced escape | P5 | not started |
| FR-2.1 Persistent rival profile | P4 | **done** (p4_persistence) |
| FR-2.2 Interaction ledger | P4 | **done** (p4: cap + genesis protection) |
| FR-2.3 Progression algorithm | P4 | **done** (p4: XP/level/style-relative growth; S-3 band at P3/P8) |
| FR-3.1 Taunt engine | P6 | not started |
| FR-3.2 Macro GOAP (Hunt/Train/Ambush) | P6 | not started |
| FR-3.3 Adaptive style mirroring | P3 | **done** (p3: learning + mirroring split; AC-3.3.2 verified as two checks) |
| FR-3.4 Micro GOAP (combat tactics) | P3 | **done** (p3: BreakGuard 70%+, goal exposure) |
| FR-4.1 Movement & camera | P1 | **done** (p1_movement 14/14) |
| FR-4.2 Attacks | P2 | **done** (p2_combat) |
| FR-4.3 Defense (block/parry) | P2 | **done** (p2_combat) |
| FR-4.4 Special attack | P3 | **done** (p3: clean 18 / blocked 9 / cost) |
| FR-4.5 Combo & damage rules | P2 | **done** (p2_combat) |
| FR-4.6 Game feel | P2/P7 | P2 part done (buffering/cancels/hitstop/reactions); fps+polish at P7 |
| FR-5.1 The zone | P5 | not started |
| FR-6.1 Persistence | P4 | **done** (p4: reload restore) |
| FR-6.2 Debug panel | P4 | **done** (p4: live state + forcing buttons) |
| NFR-1..5 | P0/P7 | P0 foundations done (NFR-1 amended, NFR-2 met, NFR-3 harness live) |
| S-1..S-4 success criteria | P8 | not started |
