// JevPlayerDriver (FR-9.2): drives the player Fighter from Jev's typed
// judgments. Code owns the workflow — Jev supplies the reads (which move,
// how committed, how alert, which words); this executor supplies the
// hands through the exact Fighter API a human drives, at tick rate.
// While a judgment is in flight the last directive keeps executing, and
// with no backend at all the heuristic fallback fights on (AC-9.2.3).

import { buildFightState, QUESTIONS, VOICE_LINES, JevBackend, noulYesProbability } from './jev.js';
import { PlayerBot } from './bots.js';
import { CHARGE, ENERGY } from '../combat/attacks.js';
import { AI } from '../core/tuning.js';

const STALE_S = 1.4;          // max directive age before a fresh judgment
const DIRECTIVE_MAX_S = 1.8;  // hard cap per directive execution
const VOICE_COOLDOWN_S = 6;

export class JevPlayerDriver {
  constructor(ctx) {
    // ctx: {player, rival, manager, flow, macroAgent, hud, rig, loop, resolver}
    this.ctx = ctx;
    ctx.jev = this;                       // buildFightState reads ctx.jev.*
    this.f = ctx.player;
    this.target = ctx.rival;
    this.backend = new JevBackend();
    this.fallback = new PlayerBot(ctx.player, ctx.rival, 'aggressive');

    this.directive = null;                // {move, t, seq, hits, taken}
    this.pending = false;
    this.seq = 0;
    this.offline = false;                 // last request failed / no backend
    this._retryT = 0;
    this.alert = 0;                       // danger_now probability
    this.commitCharge = 0;                // commit_full_charge probability
    this.recent = [];                     // short observed strings for state
    this.lastDirective = null;            // {move, outcome} — fed back
    this.lastTauntHeard = null;
    this._voiceT = -99;
    this._sinceDecision = 99;             // ask immediately on first tick
    this._salient = false;

    ctx.resolver.on(e => this._observe(e));
  }

  _observe(e) {
    const foe = this.ctx.manager.doc.name;
    const d = this.directive;
    if (e.att === this.f && e.type === 'hit') {
      this.recent.push(`JEV hit ${foe} for ${Math.round(e.amount)} (${e.kind})`);
      if (d) d.hits++;
    } else if (e.def === this.f && e.type === 'hit') {
      this.recent.push(`${foe} hit JEV for ${Math.round(e.amount)} (${e.kind})`);
      if (d) d.taken++;
    } else if (e.def === this.f && e.type === 'blast') {
      this.recent.push(`${foe}'s charged blast sent JEV flying`);
      this._salient = true;
    } else if (e.att === this.f && e.type === 'blast') {
      this.recent.push(`JEV's charged blast sent ${foe} flying`);
      this._say('blast_gloat');
      this._salient = true;
    } else if (e.def === this.f && e.type === 'parried') {
      this.recent.push(`${foe} parried JEV`);
    } else if (e.att === this.f && e.type === 'blocked') {
      this.recent.push(`${foe} blocked JEV's ${e.kind}`);
    }
    if (this.recent.length > 8) this.recent.shift();
    // a foe suddenly helpless is THE moment worth a fresh read
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
    this.ctx.hud.subtitle('JEV', line, 2600);
  }

  // ---- decision lifecycle (AC-9.2.2) ----
  _maybeAsk() {
    if (this.pending) return;
    const done = !this.directive || this.directive.t > DIRECTIVE_MAX_S;
    if (!done && this._sinceDecision < STALE_S && !this._salient) return;
    this._salient = false;
    this._sinceDecision = 0;
    // finalize the OUTGOING directive's outcome before building state, so
    // this request's `lastDirective` reflects it (the living-memory loop);
    // the directive itself keeps executing — only cleared when a new one
    // is applied — so it doesn't stall while this request is in flight
    this._finishDirective();
    const seq = ++this.seq;
    this.pending = true;
    const state = buildFightState(this.ctx);
    this.backend.send(state, QUESTIONS).then(ans => {
      this.pending = false;
      if (seq !== this.seq) return;       // freshness: superseded request
      this.offline = false;
      this._apply(ans);
    }).catch(() => {
      this.pending = false;
      this.offline = true;                // fallback fights on (AC-9.2.3)
      this._retryT = 5;
    });
  }

  _finishDirective() {
    const d = this.directive;
    if (!d) return;
    this.lastDirective = {
      move: d.move,
      outcome: d.taken > 0 ? 'JEV took damage during it'
        : d.hits > 0 ? 'it landed'
        : d.interrupted ? 'it was interrupted'
        : 'nothing came of it',
    };
  }

  // ---- typed consumption (AC-9.1.4) ----
  _apply(ans) {
    this.alert = noulYesProbability(ans.danger_now);
    this.commitCharge = noulYesProbability(ans.commit_full_charge);
    const move = ans.next_move?.answer;
    if (typeof move === 'string' && move.length) {
      this.directive = { move, t: 0, hits: 0, taken: 0 };
    }
    const v = ans.voice?.answer;
    if (v && v !== 'stay_silent') this._say(v);
  }

  // ---- per-tick drive ----
  update(dt) {
    const f = this.f, t = this.target, ctx = this.ctx;
    if (!f.alive) return;
    this._sinceDecision += dt;

    // outside a duel: seek the rivalry (and stop spending judgments)
    if (ctx.flow.enabled !== false && ctx.flow.state !== 'encounter') {
      this.fallback.update(dt);
      return;
    }
    if (!t.alive) return;

    if (this.offline) {
      this._retryT -= dt;
      if (this._retryT <= 0) { this._retryT = 5; this._maybeAsk(); }
      this.fallback.update(dt);
      return;
    }
    this._maybeAsk();
    if (!this.directive) { this.fallback.update(dt); return; }

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

    // Jev-armed defensive reflex: the model sets alertness, code times it
    if (this.alert > 0.6 && !f.busy &&
        t.state === 'attack' && t.phase === 'windup' && dist < 3.2) {
      this.alert = 0;
      f.startDodge(-dirZ, dirX);
      return;
    }
    if (f.state === 'charge') return;      // committed: autoRelease owns it
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
        // light, light, then the heavy ROUTE; canStart gates each link
        if (f.state === 'attack' && f.attackType === 'light2' && f.canStart('heavy')) f.startAttack('heavy');
        else if (f.canStart('light')) f.startAttack('light');
        break;
      case 'charge_blast': {
        if (dist > 2.4) { advance(); break; }
        // commit_full_charge gates the hold (AC-9.1.4): confident yes →
        // full-charge BLAST; doubtful → a safe sub-blast release
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
        else { f.intent.move.x = -dirZ; f.intent.move.z = dirX; }   // strafe
        f.fireKi();
        break;
      case 'special_beam':
        if (f.energy >= ENERGY.specialCost && f.canStart('special')) { f.startAttack('special'); finish(); }
        else finish();                     // premise gone: energy spent
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
        finish();                          // unknown option: never stall
    }
  }
}
