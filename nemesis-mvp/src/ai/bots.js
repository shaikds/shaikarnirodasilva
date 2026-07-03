// Player-bot test doubles (roadmap P3): drive the player Fighter exactly
// like a human would (intents + action calls), so the Profiler observes
// them identically. Used by the automated duels; never active in real play.

import { AI } from '../core/tuning.js';
import { ENERGY } from '../combat/attacks.js';

export class PlayerBot {
  constructor(fighter, target, style = 'aggressive') {
    this.f = fighter;
    this.target = target;
    this.style = style;
    this._t = 0;
    this._defT = null;
  }

  update(dt) {
    const f = this.f, t = this.target;
    if (!f.alive || !t.alive) return;
    const dist = f.distanceTo(t);
    const dirX = (t.pos.x - f.pos.x) / (dist || 1);
    const dirZ = (t.pos.z - f.pos.z) / (dist || 1);
    f.intent.face = f.yawTo(t);
    f.intent.move.x = 0; f.intent.move.z = 0;
    this._t -= dt;

    // shared reactive defense (aggressive style only)
    if (this.style === 'aggressive') {
      const threat = t.state === 'attack' && t.phase === 'windup' && dist < 3.0;
      if (threat && this._defT == null && Math.random() < 0.45) this._defT = 0.2;
      if (this._defT != null) {
        this._defT -= dt;
        if (this._defT <= 0) {
          this._defT = null;
          if (!f.busy) f.startDodge(f.pos.x - t.pos.x, f.pos.z - t.pos.z);
          return;
        }
      }
    }
    if (f.busy) return;

    if (this.style === 'turtle') {
      // hold block in range; poke occasionally after releasing
      if (dist > AI.meleeRange) {
        if (f.blocking) { f.blockT = 1; f.stopBlock(); }
        f.intent.move.x = dirX; f.intent.move.z = dirZ;
      } else if (!f.blocking) {
        if (this._t <= 0 && Math.random() < 0.25 && f.canStart('light')) {
          f.startAttack('light');
          this._t = 0.8;
        } else if (f.canStart('block')) {
          f.startBlock();
        }
      }
      return;
    }

    if (this.style === 'heavyOnly') {
      if (dist > AI.meleeRange * 1.05) {
        f.intent.move.x = dirX; f.intent.move.z = dirZ;
      } else if (this._t <= 0 && f.canStart('heavy')) {
        f.startAttack('heavy');
        this._t = 0.25;
      }
      return;
    }

    // aggressive (default)
    if (f.blocking) { f.blockT = 1; f.stopBlock(); return; }
    if (f.energy >= ENERGY.specialCost && dist > 5 && Math.random() < 0.35 &&
        f.canStart('special')) {
      f.startAttack('special');
      this._t = 0.4;
      return;
    }
    if (dist > AI.meleeRange * 1.05) {
      f.intent.move.x = dirX; f.intent.move.z = dirZ;
      return;
    }
    if (this._t <= 0) {
      const r = Math.random();
      if (r < 0.55 && f.canStart('light')) f.startAttack('light');
      else if (r < 0.8 && f.canStart('heavy')) f.startAttack('heavy');
      else f.startDodge(-dirZ, dirX);            // reposition
      this._t = 0.15 + Math.random() * 0.25;
    }
  }
}
