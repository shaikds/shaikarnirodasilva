// JevNemesisDriver (FR-10.2): Jev plays the RIVAL — the nemesis itself.
// Mirrors JevPlayerDriver's contract exactly (state/questions separated,
// code executes through the shared Fighter API, cadence + freshness +
// liveness), but the fallback on any failure is the EXISTING, balance-
// tested GOAP brain (RivalAgent) rather than a generic bot: Jev augments
// the nemesis's tactics, it doesn't replace the fairness work already
// done for it. The gate for "is a real duel happening" is RivalAgent's
// own `.enabled` flag — the single existing source of truth the whole
// project already uses for that (flow/macroAgent own it).

import { buildNemesisState, NEMESIS_QUESTIONS, VOICE_LINES } from './jevNemesis.js';
import { CHARGE, ENERGY } from '../combat/attacks.js';
import { AI } from '../core/tuning.js';
import { JevBackend } from './jev.js';

const STALE_S = 1.4;
const DIRECTIVE_MAX_S = 1.8;
const VOICE_COOLDOWN_S = 6;

export class JevNemesisDriver {
  constructor(ctx) {
    // ctx: {rival, player, manager, flow, macroAgent, hud, rig, loop,
    //       resolver, rivalAgent}
    this.ctx = ctx;
    ctx.jev = this;                       // buildNemesisState reads ctx.jev.*
    this.f = ctx.rival;
    this.target = ctx.player;
    // its own namespaced backend config (FR-10.2): independent from the
    // player-side driver's, potentially a different account/key
    this.backend = new JevBackend('nemesis.jevNemesis.cfg');

    this.directive = null;
    this.pending = false;
    this.seq = 0;
    this.offline = false;
    this._retryT = 0;
    this.alert = 0;
    this.commitCharge = 0;
    this.recent = [];
    this.lastDirective = null;
    this._voiceT = -99;
    this._sinceDecision = 99;
    this._salient = false;

    ctx.resolver.on(e => this._observe(e));
  }

  _observe(e) {
    const d = this.directive;
    if (e.att === this.f && e.type === 'hit') {
      this.recent.push(`I hit the challenger for ${Math.round(e.amount)} (${e.kind})`);
      if (d) d.hits++;
    } else if (e.def === this.f && e.type === 'hit') {
      this.recent.push(`The challenger hit me for ${Math.round(e.amount)} (${e.kind})`);
      if (d) d.taken++;
    } else if (e.def === this.f && e.type === 'blast') {
      this.recent.push('A charged blast sent me flying');
      this._salient = true;
    } else if (e.att === this.f && e.type === 'blast') {
      this.recent.push('My charged blast sent the challenger flying');
      this._say('blast_gloat');
      this._salient = true;
    } else if (e.def === this.f && e.type === 'parried') {
      this.recent.push('The challenger parried me');
    } else if (e.att === this.f && e.type === 'blocked') {
      this.recent.push(`The challenger blocked my ${e.kind}`);
    }
    if (this.recent.length > 8) this.recent.shift();
    if (e.att === this.f && e.type === 'hit' && this.target.state === 'stagger') {
      this._salient = true;
    }
  }

  _say(key) {
    const line = VOICE_LINES[key];
    if (!line) return;
    const now = this.ctx.loop.simTime;
    if (now - this._voiceT < VOICE_COOLDOWN_S) return;
    this._voiceT = now;
    // the nemesis speaks under its OWN in-world name (FR-10.1: Jev IS the
    // rival now, not a separate voice) — the same channel the canonical
    // taunt engine already uses
    this.ctx.hud.subtitle(this.ctx.manager.doc.name, line, 2600);
  }

  _maybeAsk() {
    if (this.pending) return;
    const done = !this.directive || this.directive.t > DIRECTIVE_MAX_S;
    if (!done && this._sinceDecision < STALE_S && !this._salient) return;
    this._salient = false;
    this._sinceDecision = 0;
    this._finishDirective();
    const seq = ++this.seq;
    this.pending = true;
    const state = buildNemesisState(this.ctx);
    this.backend.send(state, NEMESIS_QUESTIONS).then(ans => {
      this.pending = false;
      if (seq !== this.seq) return;
      this.offline = false;
      this._apply(ans);
    }).catch(() => {
      this.pending = false;
      this.offline = true;
      this._retryT = 5;
    });
  }

  _finishDirective() {
    const d = this.directive;
    if (!d) return;
    this.lastDirective = {
      move: d.move,
      outcome: d.taken > 0 ? 'I took damage during it'
        : d.hits > 0 ? 'it landed'
        : d.interrupted ? 'it was interrupted'
        : 'nothing came of it',
    };
  }

  _apply(ans) {
    this.alert = this._noulP(ans.danger_now);
    this.commitCharge = this._noulP(ans.commit_full_charge);
    const move = ans.next_move?.answer;
    if (typeof move === 'string' && move.length) {
      this.directive = { move, t: 0, hits: 0, taken: 0 };
    }
    const v = ans.voice?.answer;
    if (v && v !== 'stay_silent') this._say(v);
  }

  _noulP(a) {
    if (!a) return 0;
    if (typeof a.p === 'number') {
      const yes = a.answer === false || a.answer === 'no' ? 1 - a.p : a.p;
      return Math.max(0, Math.min(1, yes));
    }
    return a.answer === true || a.answer === 'yes' ? 0.8 : 0.2;
  }

  // ---- per-tick drive ----
  // Signature matches RivalAgent.update(dt, nowS) so main.js's call site
  // is a plain driver swap, and this driver can call the GOAP fallback
  // with the exact same arguments it was given.
  update(dt, nowS) {
    const f = this.f, t = this.target, ctx = this.ctx;
    this._sinceDecision += dt;

    // RivalAgent.enabled is the ONE existing gate for "a real duel is
    // happening" (flow/macroAgent own it) — respect it as-is rather than
    // re-deriving that logic here
    if (!ctx.rivalAgent.enabled || !f.alive || !t.alive) return;

    if (this.offline) {
      this._retryT -= dt;
      if (this._retryT <= 0) { this._retryT = 5; this._maybeAsk(); }
      ctx.rivalAgent.update(dt, nowS);         // the tuned GOAP brain
      return;
    }
    this._maybeAsk();
    if (!this.directive) { ctx.rivalAgent.update(dt, nowS); return; }

    const d = this.directive;
    d.t += dt;
    const dist = f.distanceTo(t);
    const dirX = (t.pos.x - f.pos.x) / (dist || 1);
    const dirZ = (t.pos.z - f.pos.z) / (dist || 1);
    f.intent.face = f.yawTo(t);
    f.intent.move.x = 0; f.intent.move.z = 0;
    f.intent.dash = false;
    f.dashTarget = t;
    f.intent.rise = f.flying ? (Math.abs(t.pos.y - f.pos.y) > 0.6 ? Math.sign(t.pos.y - f.pos.y) : 0) : 0;

    if (this.alert > 0.6 && !f.busy &&
        t.state === 'attack' && t.phase === 'windup' && dist < 3.2) {
      this.alert = 0;
      f.startDodge(-dirZ, dirX);
      return;
    }
    if (f.state === 'charge') return;
    if (f.busy) { if (f.state === 'stagger' || f.state === 'hitstun') d.interrupted = true; return; }

    const advance = () => { f.intent.move.x = dirX; f.intent.move.z = dirZ; };
    const finish = () => { d.t = DIRECTIVE_MAX_S + 1; };

    switch (d.move) {
      case 'press_attack':
        if (dist > AI.meleeRange * 1.1) { advance(); break; }
        if (f.canStart('light')) f.startAttack('light');
        break;
      case 'route_uppercut':
        if (dist > AI.meleeRange * 1.1) { advance(); break; }
        if (f.state === 'attack' && f.attackType === 'light2' && f.canStart('heavy')) f.startAttack('heavy');
        else if (f.canStart('light')) f.startAttack('light');
        break;
      case 'charge_blast': {
        if (dist > 2.4) { advance(); break; }
        const hold = this.commitCharge > 0.55
          ? CHARGE.maxS + 0.05
          : CHARGE.maxS * CHARGE.blastAt * 0.8;
        if (f.startCharge(hold)) {
          if (this.commitCharge > 0.55) this._say('charge_warn');
          finish();
        }
        break;
      }
      case 'headbutt_rush':
        if (dist > 2.4) { f.intent.dash = true; break; }
        if (f.canStart('heavy')) { f.startAttack('headbutt'); finish(); }
        break;
      case 'ki_pressure':
        if (dist < 3) { f.intent.move.x = -dirX; f.intent.move.z = -dirZ; }
        else { f.intent.move.x = -dirZ; f.intent.move.z = dirX; }
        f.fireKi();
        break;
      case 'special_beam':
        if (f.energy >= ENERGY.specialCost && f.canStart('special')) { f.startAttack('special'); finish(); }
        else finish();
        break;
      case 'guard':
        if (!f.blocking && f.canStart('block')) f.startBlock();
        if (d.t > 0.6 && f.blocking) { f.blockT = 1; f.stopBlock(); finish(); }
        break;
      case 'evade':
        f.startDodge(-dirZ, dirX);
        finish();
        break;
      case 'take_flight':
        if (!f.flying && f.canFly) f.toggleFlight();
        advance();
        break;
      case 'close_distance':
        if (dist <= AI.meleeRange) { finish(); break; }
        advance();
        break;
      case 'back_off':
        f.intent.move.x = -dirX; f.intent.move.z = -dirZ;
        break;
      default:
        finish();
    }
  }
}
