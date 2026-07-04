// GameFlow: the Genesis Flow state machine (M1) and the steady-state
// rivalry loop (plan.md §3).
//
//   BOOT ─▶ TUTORIAL ─▶ APPROACH ─▶ FIRST_BLOOD ─▶ FORCED_ESCAPE ─▶ FREE_ROAM ◀─▶ ENCOUNTER
//                (skip if rival exists: AC-1.1.5)                        ▲    aftermath │
//                                                                        └──────────────┘
//
// Tests that exercise systems in isolation set `flow.enabled = false`;
// then the flow neither moves fighters nor gates combat.

import { WaypointWalker } from '../world/navigation.js';

const FIRST_BLOOD = {
  attackMult: 3,        // AC-1.2.1: damage x3 player baseline
  hpMult: 2,            //           HP x2
  skillFloor: 0.9,
  escapeFrac: 0.15,     // AC-1.3.1: either fighter at 15% triggers escape
  clampHp: 12,          // AC-1.3.5: death impossible during First Blood
};

const TUTORIAL_STEPS = [
  { key: 'move', main: 'MOVE', sub: 'W A S D' },
  { key: 'lock', main: 'LOCK ON', sub: 'face the training dummy · press TAB' },
  { key: 'light', main: 'LIGHT ATTACK', sub: 'J / left click — strike the dummy' },
  { key: 'heavy', main: 'HEAVY ATTACK', sub: 'K / middle click — strike the dummy' },
  { key: 'block', main: 'BLOCK', sub: 'hold B / right mouse for a moment' },
  { key: 'dodge', main: 'DODGE', sub: 'SHIFT' },
];

export class GameFlow {
  constructor(ctx) {
    // ctx: { player, dummy, rival, dummyBrain, rivalAgent, manager, hud,
    //        prompts, zone, nav, resolver, rig, loop, bootMode }
    this.ctx = ctx;
    this.enabled = true;
    this.state = 'boot';
    this.sessionLog = [];
    this.tutorial = { step: 0, moved: 0, blockHeld: 0 };
    this.walker = new WaypointWalker(ctx.nav, ctx.rival);
    this.escapeBranch = null;      // 'player' | 'rival'
    this._fbSaved = null;          // rival stats to restore after First Blood
    this._aftermathT = 0;
    this._freeRoamT = 0;

    // observe player actions without stealing the profiler's hook
    const prev = ctx.player.onAction;
    ctx.player.onAction = (a) => { prev?.(a); this._onPlayerAction(a); };
    ctx.resolver.on(e => this._onCombatEvent(e));
  }

  log(evt) { this.sessionLog.push({ t: this.ctx.loop.simTime, evt }); }

  // when disabled (tests), combat is always live and the flow is inert
  get combatEnabled() {
    if (!this.enabled) return true;
    return ['tutorial', 'approach', 'firstBlood', 'encounter'].includes(this.state);
  }

  boot() {
    this.enter(this.ctx.bootMode === 'restored' ? 'freeRoam' : 'tutorial');
  }

  goto(state) { this.enter(state); }   // test hook

  enter(state) {
    const c = this.ctx;
    this.state = state;
    this.log('state:' + state);

    switch (state) {
      case 'tutorial': {
        const p = c.zone.locations.tutorialPocket;
        c.player.revive({ x: p.x, z: p.z });
        c.dummy.revive({ x: p.x + 2.5, z: p.z - 3 });
        c.dummy.hp = c.dummy.maxHp = 4000;      // a dummy doesn't die in class
        c.rival.revive({ x: 0, z: 3 });          // waits in the arena
        c.rivalAgent.enabled = false;
        c.dummyBrain.mode = 'idle';
        c.zone.setGateOpen(true);
        c.hud.hideFoe();
        this.tutorial = { step: 0, moved: 0, blockHeld: 0 };
        this._showTutorialPrompt();
        break;
      }
      case 'approach': {
        c.prompts.show('THE PIT CALLS', 'follow the lit path — enter the arena', false);
        c.zone.setGateOpen(true);
        break;
      }
      case 'firstBlood': {
        // an unwinnable duel, by design (FR-1.2)
        const s = c.rival.stats;
        this._fbSaved = { attack: s.attack, maxHp: c.rival.maxHp };
        s.attack = (c.manager.doc.stats.attack ?? 1) * FIRST_BLOOD.attackMult;
        c.rival.maxHp = Math.round(100 * FIRST_BLOOD.hpMult);
        c.rival.hp = c.rival.maxHp;
        c.rivalAgent.skillFloor = FIRST_BLOOD.skillFloor;
        c.rivalAgent.enabled = true;
        c.zone.setGateOpen(false);               // AC-1.2.3: inescapable
        c.prompts.hide();
        c.hud.showFoe(c.manager.doc.name);
        c.hud.announce(`${c.manager.doc.name} — ???`, 2500);   // AC-1.2.2 name card
        if (!c.rig.lockTarget) c.rig.lockTarget = c.rival;
        break;
      }
      case 'forcedEscape': {
        c.rivalAgent.enabled = false;
        c.rival.intent.move.x = 0; c.rival.intent.move.z = 0;
        c.zone.setGateOpen(true);
        if (this.escapeBranch === 'player') {
          c.prompts.show('YOU CANNOT WIN — RUN', 'escape through the north gate', true);
        } else {
          c.prompts.show('IT FLEES', 'your rival runs from you — remember this', true);
          this.walker.setDestination('rivalBase');
        }
        break;
      }
      case 'freeRoam': {
        c.rivalAgent.enabled = false;
        c.rivalAgent.skillFloor = 0;
        c.prompts.hide();
        c.hud.hideFoe();
        this._freeRoamT = 0;
        // the rival returns to its ground (P6 replaces this with macro-GOAP)
        if (c.rival.alive) this.walker.setDestination('rivalBase');
        break;
      }
      case 'encounter': {
        c.manager.applyToFighter(c.rival);
        c.rivalAgent.enabled = true;
        this.walker.stop();
        c.hud.showFoe(c.manager.doc.name);
        c.hud.announce(`${c.manager.doc.name} — LVL ${c.manager.doc.level}`, 2000);
        break;
      }
      case 'aftermath': {
        this._aftermathT = 2.0;
        c.rivalAgent.enabled = false;
        break;
      }
    }
  }

  // ---------- observation hooks ----------
  _onPlayerAction(a) {
    if (!this.enabled || this.state !== 'tutorial') return;
    const step = TUTORIAL_STEPS[this.tutorial.step];
    if (step?.key === 'dodge' && a === 'dodge') this._advanceTutorial();
  }

  _onCombatEvent(e) {
    if (!this.enabled || this.state !== 'tutorial') return;
    const step = TUTORIAL_STEPS[this.tutorial.step];
    if (!step) return;
    if (e.type === 'hit' && e.att === this.ctx.player && e.def === this.ctx.dummy) {
      if (step.key === 'light' && e.kind === 'light') this._advanceTutorial();
      if (step.key === 'heavy' && e.kind === 'heavy') this._advanceTutorial();
    }
  }

  _showTutorialPrompt() {
    const i = this.tutorial.step;
    const s = TUTORIAL_STEPS[i];
    if (s) this.ctx.prompts.show(`TRAINING ${i + 1}/${TUTORIAL_STEPS.length} — ${s.main}`, s.sub);
  }

  _advanceTutorial() {
    this.tutorial.step++;
    if (this.tutorial.step >= TUTORIAL_STEPS.length) {
      this.log('tutorial_complete');            // AC-1.1.3
      this.enter('approach');
    } else {
      this._showTutorialPrompt();
    }
  }

  // ---------- per-tick ----------
  update(dt) {
    if (!this.enabled) return;
    const c = this.ctx;

    switch (this.state) {
      case 'tutorial': {
        const step = TUTORIAL_STEPS[this.tutorial.step];
        if (!step) break;
        if (step.key === 'move') {
          const d = c.player.pos.distanceTo(c.player.prevPos);
          this.tutorial.moved += d;
          if (this.tutorial.moved >= 3) this._advanceTutorial();
        } else if (step.key === 'lock') {
          if (c.rig.lockTarget) this._advanceTutorial();
        } else if (step.key === 'block') {
          if (c.player.blocking) {
            this.tutorial.blockHeld += dt;
            if (this.tutorial.blockHeld >= 0.4) this._advanceTutorial();
          }
        }
        break;
      }
      case 'approach': {
        const a = c.zone.locations.arena;
        if (Math.hypot(c.player.pos.x - a.x, c.player.pos.z - a.z) < 9) {
          this.enter('firstBlood');
        }
        break;
      }
      case 'firstBlood': {
        // AC-1.3.5: clamp both fighters above death until the escape resolves
        c.player.hp = Math.max(c.player.hp, FIRST_BLOOD.clampHp);
        c.rival.hp = Math.max(c.rival.hp, FIRST_BLOOD.clampHp);
        if (c.player.hp <= c.player.maxHp * FIRST_BLOOD.escapeFrac) {
          this.escapeBranch = 'player';
          this.enter('forcedEscape');
        } else if (c.rival.hp <= c.rival.maxHp * FIRST_BLOOD.escapeFrac) {
          this.escapeBranch = 'rival';            // AC-1.3.3
          this.enter('forcedEscape');
        }
        break;
      }
      case 'forcedEscape': {
        // keep both above death while frozen
        c.player.hp = Math.max(c.player.hp, 1);
        if (this.escapeBranch === 'player') {
          if (c.player.pos.z < -15) this._resolveGenesis('player');
        } else {
          const arrived = this.walker.update();
          if (arrived || c.player.distanceTo(c.rival) > 22) this._resolveGenesis('rival');
        }
        break;
      }
      case 'freeRoam': {
        this._freeRoamT += dt;
        this.walker.update();
        if (this._freeRoamT > 2 && c.player.alive && c.rival.alive &&
            c.player.distanceTo(c.rival) < 8) {
          this.enter('encounter');
        }
        break;
      }
      case 'encounter': {
        if (!c.player.alive) this._endEncounter('rivalWin');
        else if (!c.rival.alive) this._endEncounter('playerWin');
        else if (c.player.distanceTo(c.rival) > 25) this._endEncounter('escape');
        break;
      }
      case 'aftermath': {
        this._aftermathT -= dt;
        if (this._aftermathT <= 0) {
          const gate = this.ctx.zone.locations.arenaGate;
          const base = this.ctx.zone.locations.rivalBase;
          if (!c.player.alive) c.player.revive({ x: gate.x, z: gate.z });
          if (!c.rival.alive) {
            c.rival.revive({ x: base.x, z: base.z });
            c.manager.applyToFighter(c.rival);   // fresh stats/tags for next time
            c.rival.hp = c.rival.maxHp;
          }
          this.enter('freeRoam');
        }
        break;
      }
    }
  }

  _resolveGenesis(branch) {
    const c = this.ctx, m = c.manager;
    if (branch === 'player') {
      m.record('player_fled_first_duel', 'Player cowardice: Fled the initial duel.');
      m.doc.record.wins++;                       // the rival's first win
      m.doc.record.escapes++;
      c.hud.announce('THE RIVALRY IS BORN', 2500);
    } else {
      m.record('rival_fled_first_duel', 'Humiliation: fled its first duel against the player.');
      m.doc.record.losses++;
      m.refreshTags();
      c.hud.announce('IT WILL REMEMBER THIS', 2500);
    }
    m.doc.rivalryStarted = true;
    // restore the rival to its real stats
    if (this._fbSaved) {
      c.rival.stats.attack = this._fbSaved.attack;
      c.rival.maxHp = this._fbSaved.maxHp;
      c.rival.hp = Math.min(c.rival.hp, c.rival.maxHp);
      this._fbSaved = null;
    }
    c.rivalAgent.skillFloor = 0;
    m.save();
    this.log('genesis:' + branch);
    this.enter('freeRoam');
  }

  _endEncounter(outcome) {
    const c = this.ctx, m = c.manager;
    if (outcome === 'rivalWin') {
      m.onDuelEnd({ playerHp: 0, rivalHp: Math.max(0, c.rival.hp) });
      c.hud.announce('YOU DIED', 2200);
    } else if (outcome === 'playerWin') {
      m.onDuelEnd({ playerHp: Math.max(0, c.player.hp), rivalHp: 0 });
      c.hud.announce('NEMESIS DEFEATED — IT WILL REMEMBER', 2200);
    } else {
      m.record('player_escaped_duel', 'Player broke away from the duel.');
      m.doc.record.escapes++;
      m.save();
      c.hud.announce('YOU FLED', 1600);
      this.walker.setDestination('rivalBase');
    }
    this.log('encounter:' + outcome);
    this.enter(outcome === 'escape' ? 'freeRoam' : 'aftermath');
  }
}
