// RivalAgent: the rival's in-combat brain (FR-3.4 micro-GOAP + FR-3.3
// mirroring + AC-3.3.4 skill scaling). Produces Fighter intents — the same
// API the human player drives through PlayerController, so both obey the
// exact same combat rulebook.

import { plan } from './goap.js';
import { MICRO_ACTIONS, MICRO_GOALS } from './microActions.js';
import { AI } from '../core/tuning.js';
import { ENERGY, SAIYAN } from '../combat/attacks.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const scaled = ([lo, hi], t) => lerp(lo, hi, t);

export class RivalAgent {
  constructor({ fighter, target, profile, sync, resolver }) {
    this.f = fighter;
    this.target = target;
    this.profile = profile;
    this.sync = sync;
    this.enabled = false;
    this.replanT = 0;
    this.currentGoal = null;      // exposed for HUD/debug (AC-3.4.5)
    this.currentPlan = [];
    this.currentAction = null;
    this.actionT = 0;
    this.plannedDefense = null;   // {inS, move}
    this.blockHoldT = 0;
    this._recentHits = [];        // timestamps of hits taken (pressure)
    this._strafeSign = 1;
    this._lastPlayerBlocking = false;

    this._nowS = 0;
    resolver.on(e => {
      if (e.def === this.f && e.type === 'hit') {
        this._recentHits.push(this._nowS);
        this.replanT = 0;         // getting hit is a replan trigger
      }
      // press the advantage as hard as the PLAYER does (comboFollowup mirror)
      if (e.att === this.f && e.type === 'hit' && this.enabled &&
          Math.random() < this.profile.comboFollowup) {
        this.currentPlan.unshift('lightAttack');
        this.currentAction = null;
      }
    });
  }

  // effective skill with in-round rubber band: winning big -> eases off.
  // skillFloor overrides the floor during First Blood (AC-1.2.1) — the
  // newborn rival is meant to be overwhelming regardless of rating.
  get skill() {
    const hpDiff = (this.f.hp - this.target.hp) / 100;
    const s = clamp(this.sync.skill - hpDiff * AI.rubberBand, 0.05, 1);
    return Math.max(s, this.skillFloor ?? 0);
  }

  buildState(nowS) {
    const f = this.f, t = this.target, dist = f.distanceTo(t);
    const cutoff = nowS - AI.pressureWindow;
    this._recentHits = this._recentHits.filter(ts => ts > cutoff);
    const retreating = (() => {
      const m = t.intent.move;
      if (Math.hypot(m.x, m.z) < 0.1) return false;
      // moving away from the rival?
      const away = (t.pos.x - f.pos.x) * m.x + (t.pos.z - f.pos.z) * m.z;
      return away > 0.3;
    })();
    return {
      inRange: dist <= AI.meleeRange,
      midRange: dist > AI.meleeRange && dist <= AI.midRange,
      playerBlocking: t.blocking,
      playerAttacking: t.state === 'attack' && t.phase === 'windup',
      energyFull: f.energy >= ENERGY.specialCost,
      underPressure: this._recentHits.length >= AI.pressureHits,
      playerRetreating: retreating,
      playerLowHp: t.hp <= 30,
      myLowHp: f.hp <= 30,
      canDash: f.energy > 30,
      damaged: false, guardBroken: false, avoided: false, spaced: false,
    };
  }

  _selectGoal(state) {
    let best = null, bestP = -1;
    for (const g of MICRO_GOALS) {
      const p = g.priority(state, this.profile);
      if (p > bestP) { best = g; bestP = p; }
    }
    return best;
  }

  update(dt, nowS) {
    const f = this.f, t = this.target;
    this._nowS = nowS;
    if (!this.enabled || !f.alive || !t.alive) return;
    const skill = this.skill;

    // always face the player (lock-on equivalent)
    f.intent.face = f.yawTo(t);
    f.intent.move.x = 0; f.intent.move.z = 0;
    f.intent.dash = false;
    f.dashTarget = t;

    // ---- M7 aerial pursuit (FR-7.1): match the player's altitude game ----
    const dy = t.pos.y - f.pos.y;
    if (!f.flying && (t.flying || dy > 2.5) && !f.busy) f.toggleFlight();
    if (f.flying) {
      f.intent.rise = Math.abs(dy) > 0.6 ? Math.sign(dy) : 0;
      if (!t.flying && t.grounded && f.pos.y < 1.2) f.toggleFlight();   // land with them
    } else {
      f.intent.rise = 0;
    }
    // pride (AC-7.4.2): being outshone by a transformed player burns
    if (t.surge && !f.surge) f.gainSurge(SAIYAN.surge.prideGainPerS * dt);

    // --- reactive defense: mirrors the player's own defense rate/reaction ---
    const threat = t.state === 'attack' && t.phase === 'windup' &&
                   f.distanceTo(t) < 3.2 && !f.busy;
    if (threat && !this.plannedDefense) {
      if (Math.random() < this.profile.defenseRate * scaled(AI.defendScale, skill)) {
        this.plannedDefense = {
          inS: (this.profile.reaction / 1000) * lerp(1.4, 0.55, skill) * (0.8 + Math.random() * 0.4),
          move: Math.random() < this.profile.dodgePref ? 'dodge' : 'block',
        };
      }
    }
    if (this.plannedDefense) {
      this.plannedDefense.inS -= dt;
      if (this.plannedDefense.inS <= 0) {
        const m = this.plannedDefense.move;
        this.plannedDefense = null;
        if (m === 'dodge') {
          const dx = f.pos.x - t.pos.x, dz = f.pos.z - t.pos.z;
          f.startDodge(dx, dz);
        } else if (f.canStart('block')) {
          f.startBlock();
          this.blockHoldT = 0.3 + Math.random() * 0.35;
        }
        return;
      }
    }
    if (f.blocking) {
      this.blockHoldT -= dt;
      if (this.blockHoldT <= 0) { f.blockT = 1; f.stopBlock(); }
      else return;
    }
    if (f.busy) return;

    // --- deliberate layer: plan on a skill-scaled clock + triggers ---
    const state = this.buildState(nowS);
    if (state.playerBlocking !== this._lastPlayerBlocking) this.replanT = 0;
    this._lastPlayerBlocking = state.playerBlocking;
    this.replanT -= dt;
    this.actionT -= dt;

    // idle with nothing to do = replan NOW; replanT is a max staleness, not
    // a gate — dead time between plans was just free damage for the player
    if (this.replanT <= 0 || (!this.currentPlan.length && !this.currentAction)) {
      this.replanT = scaled(AI.replanS, skill) * (0.8 + Math.random() * 0.4);
      const goal = this._selectGoal(state);
      const seq = plan(state, goal, MICRO_ACTIONS, {
        maxDepth: Math.round(scaled(AI.planDepth, skill)),
        costNoise: scaled(AI.costNoise, skill),
        profile: this.profile,
      });
      this.currentGoal = goal;
      this.currentPlan = seq ? [...seq] : [];
      this.currentAction = null;

      // the mistakes model: sometimes execute nonsense instead (AC-3.3.4)
      if (Math.random() < scaled(AI.mistakeRate, skill)) {
        const junk = ['strafe', 'approach', 'retreat', 'lightAttack'];
        this.currentPlan = [junk[(Math.random() * junk.length) | 0]];
      }
    }

    if (!this.currentAction && this.currentPlan.length) {
      this.currentAction = this.currentPlan.shift();
      this.actionT = 0.6;                        // max time per movement action
      this._strafeSign = Math.random() < 0.5 ? 1 : -1;
    }
    if (!this.currentAction) return;

    // --- execute the current plan step ---
    const dist = f.distanceTo(t);
    const dirX = (t.pos.x - f.pos.x) / (dist || 1);
    const dirZ = (t.pos.z - f.pos.z) / (dist || 1);
    const done = () => { this.currentAction = null; };

    switch (this.currentAction) {
      case 'approach':
        if (dist <= AI.meleeRange * 0.9) { done(); break; }
        f.intent.move.x = dirX; f.intent.move.z = dirZ;
        if (this.actionT <= 0) done();
        break;
      case 'retreat':
      case 'keepDistance':
        if (dist >= AI.midRange * 0.8) { done(); break; }
        f.intent.move.x = -dirX; f.intent.move.z = -dirZ;
        if (this.actionT <= 0) done();
        break;
      case 'strafe':
        f.intent.move.x = -dirZ * this._strafeSign;
        f.intent.move.z = dirX * this._strafeSign;
        if (this.actionT <= -0.2) done();
        break;
      case 'lightAttack':
        if (dist > AI.meleeRange * 1.15) { f.intent.move.x = dirX; f.intent.move.z = dirZ; break; }
        if (f.canStart('light')) f.startAttack('light');
        done();
        break;
      case 'heavyAttack':
        if (dist > AI.meleeRange * 1.15) { f.intent.move.x = dirX; f.intent.move.z = dirZ; break; }
        if (f.canStart('heavy')) {
          // FR-8.3: the rival charges its heavies too — but ONLY when the
          // target can't punish the hold (charge cancels on hit, so charging
          // into a live opponent is free damage for them; the first tuning
          // pass held 0.08-0.33s always and lost the S-3 band 18/20)
          const safe = t.busy && t.state !== 'attack';
          if (safe) f.startCharge(0.5 + Math.random() * 0.4);
          else f.startAttack('heavy');
        }
        done();
        break;
      case 'fireSpecial':
        if (f.canStart('special')) f.startAttack('special');
        done();
        break;
      case 'dragonDash':
        // rush the player in 3D until melee range or energy dries (FR-7.2)
        if (dist <= SAIYAN.dash.stopRange * 1.2 || f.energy <= SAIYAN.dash.minEnergy) { done(); break; }
        f.intent.dash = true;
        if (this.actionT <= -0.6) done();
        break;
      case 'kiBarrage': {
        // a few quick blasts, then move on (FR-7.3)
        this._kiShots = (this._kiShots ?? 3);
        if (f.fireKi()) this._kiShots--;
        if (this._kiShots <= 0 || f.energy < 10) { this._kiShots = null; done(); }
        break;
      }
      case 'dodge': {
        const away = Math.random() < 0.5 ? 1 : -1;
        f.startDodge(-dirZ * away, dirX * away);
        done();
        break;
      }
      case 'block':
        if (f.canStart('block')) { f.startBlock(); this.blockHoldT = 0.35; }
        done();
        break;
      default:
        done();
    }
  }
}
