// Jev decision brain (FR-9.1): TypeSafe System One integration.
//
// The contract, per the typesafe-ai skill: send STATE (observed facts,
// named JSON fields) and QUESTIONS (typed judgments — Choice/Noul with
// instructions + criteria) as SEPARATE fields of one request; receive
// typed answers with probabilities. Independent questions batch into one
// request and cannot see one another's answers. Question IDs are for
// code; the full meaning lives in each question's text.
//
// ⚠ WIRE-FORMAT ASSUMPTION (AC-9.3.2): TypeSafe's live docs are
// unreachable from this build environment, so the exact HTTP shape below
// is an assumption, kept in ONE place (JevBackend.send + _normalize) and
// verified against a mock, not the live service. If the real contract
// differs, fix it here and in tools/jev-proxy.mjs only.

// ---- the tactical vocabulary (Choice options are bounded; the model ----
// ---- cannot pick a move we omit, so cover the whole kit)            ----
export const MOVES = [
  'press_attack', 'route_uppercut', 'charge_blast', 'headbutt_rush',
  'ki_pressure', 'special_beam', 'guard', 'evade', 'take_flight',
  'close_distance', 'back_off',
];

// canned voice lines — Jev SELECTS, it never generates (FR-9.1). The
// no-match outcome 'stay_silent' keeps silence available.
export const VOICE_LINES = {
  stay_silent: null,
  respect: 'You have grown. Good — so have I.',
  contempt: 'That was your best? My rival deserves better.',
  pain: 'A worthy cut. I will repay it doubled.',
  charge_warn: 'Watch closely. This one ends the argument.',
  blast_gloat: 'Fly. The wall will catch you.',
  low_hp_defiant: 'Still standing. Still coming for you.',
  hunt_answer: 'You hunted me? I was waiting.',
  finish: 'Remember this moment. I will make you relive it.',
};

// ---- STATE (AC-9.1.1): observed facts only, named fields, no prose ----
export function buildFightState(g) {
  const me = g.player, foe = g.rival;
  const dist = me.distanceTo(foe);
  const nearWall = Math.min(
    12.5 - Math.abs(foe.pos.x - 0), 12.5 - Math.abs(foe.pos.z - 0)
  ) < 3.5 && Math.abs(foe.pos.x) < 14 && Math.abs(foe.pos.z) < 14;
  return {
    me: {
      hp: Math.round(me.hp), maxHp: me.maxHp,
      energy: Math.round(me.energy),
      surgeMeter: Math.round(me.surgeMeter), transformed: me.surge,
      flying: me.flying, canFly: me.canFly,
      state: me.state, powerLevel: me.power,
      chargeReady: me.state === 'idle' || me.state === 'block',
    },
    foe: {
      name: g.manager.doc.name, level: g.manager.doc.level,
      hp: Math.round(foe.hp), maxHp: foe.maxHp,
      state: foe.state, phase: foe.phase,          // wind-up ≠ recover ≠ stagger
      blocking: foe.blocking, charging: foe.state === 'charge',
      transformed: foe.surge, flying: foe.flying,
      distanceMeters: +dist.toFixed(1),
      altitudeGapMeters: +(foe.pos.y - me.pos.y).toFixed(1),
      nearWall,
    },
    duel: {
      phase: g.flow.state,
      myComboHits: me.combo, foeComboHits: foe.combo,
    },
    recent: g.jev?.recent?.slice(-4) ?? [],        // short observed events
    rivalry: {
      record: g.manager.doc.record,
      foeHate: g.manager.doc.emotionalState,
      lastTauntHeard: g.jev?.lastTauntHeard ?? null,
      macroThreat: g.macroAgent?.current ?? null,
    },
    lastDirective: g.jev?.lastDirective ?? null,   // {move, outcome}
  };
}

// ---- QUESTIONS (AC-9.1.2): static bank, instructions vs criteria ----
const PERSONA =
  'You are the fight instinct of JEV, a proud awakened warrior locked in a ' +
  'lifelong rivalry with the fighter described in `foe`. JEV fights to win ' +
  'and to look magnificent doing it: aggressive, opportunistic, never ' +
  'wasteful. All facts about this instant are in the state fields.';

export const QUESTIONS = [
  {
    id: 'next_move',
    type: 'choice',
    instructions: PERSONA +
      ' Choose the single best next move for JEV (`me`) against `foe` ' +
      'right now, judging from `foe.state`, `foe.phase`, ' +
      '`foe.distanceMeters`, `me.energy`, and the momentum in `recent`.',
    criteria: {
      press_attack: 'In melee range (under ~2.5m) with no immediate threat: throw the fast jab-cross string and keep the pressure on.',
      route_uppercut: 'In melee range and `foe` is passive, blocking-shy, or mid-recovery: commit to the full combo route ending in the rising uppercut that launches them airborne.',
      charge_blast: '`foe` is staggered, knocked down, getting up, or otherwise unable to act for close to a second: wind up a charged heavy — at full charge it becomes a BLAST that hurls them away, devastating when `foe.nearWall` is true.',
      headbutt_rush: 'Far away (over ~4m) with energy to spend: ki-dash in and convert the momentum into a headbutt on arrival.',
      ki_pressure: 'Mid range with decent energy while `foe` is grounded or predictable: chip and annoy with rapid ki blasts.',
      special_beam: '`me.energy` is at or near full and there is a clear line at range: fire the beam for massive damage.',
      guard: '`foe` is winding up an attack in melee range and JEV cannot safely strike first: block it (a perfectly timed release parries).',
      evade: 'An attack or projectile is about to land: vanish through it with a dodge.',
      take_flight: '`me.canFly` and `foe` is airborne (large positive `foe.altitudeGapMeters`) or JEV needs to reposition dramatically: take to the air.',
      close_distance: 'Too far to strike, low energy for a dash: simply run in.',
      back_off: '`me.hp` is critical and the exchange is losing: make space to recover energy and composure.',
    },
  },
  {
    id: 'commit_full_charge',
    type: 'noul',
    instructions: PERSONA +
      ' Speculative premise: assume JEV begins charging a heavy attack ' +
      'THIS instant, which roots JEV in place for 0.9 seconds and is ' +
      'cancelled if JEV is hit. Judge: will the hold reach FULL charge ' +
      'and land on `foe` unpunished, given `foe.state`, `foe.phase`, and ' +
      '`foe.distanceMeters`?',
    criteria: 'Yes means `foe` cannot reach and interrupt JEV within the hold, and will still be hittable at release. No means the hold gets stuffed or whiffs.',
  },
  {
    id: 'danger_now',
    type: 'noul',
    instructions: PERSONA +
      ' Judge: must JEV act defensively within the next half second? ' +
      'Consider `foe.state` and `foe.phase` (a wind-up in melee range or ' +
      'a charging foe is imminent danger; a staggered foe is none).',
    criteria: 'Yes means an attack, blast, or charge release is about to reach JEV. No means JEV is free to act offensively.',
  },
  {
    id: 'voice',
    type: 'choice',
    instructions: PERSONA +
      ' If this exact moment deserves words, pick the one line JEV would ' +
      'say, judging from `rivalry` (the record, `foeHate`, ' +
      '`lastTauntHeard`) and the swing of `recent`. Most moments deserve ' +
      'silence.',
    criteria: {
      stay_silent: 'The default: nothing notable just happened, or JEV spoke moments ago.',
      respect: 'The rival just did something genuinely impressive.',
      contempt: 'The rival is losing badly or fighting beneath its level.',
      pain: 'JEV just took a heavy or humiliating hit.',
      charge_warn: 'JEV is about to attempt a full charged blast.',
      blast_gloat: 'JEV just sent the rival flying with a blast.',
      low_hp_defiant: '`me.hp` is critical but JEV fights on.',
      hunt_answer: 'The duel began from the rival\'s hunt or ambush (`rivalry.macroThreat`).',
      finish: 'The duel is about to be decided.',
    },
  },
];

// ---- the one place the wire format lives (AC-9.3.2) ----
export class JevBackend {
  constructor() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('nemesis.jev.cfg') || '{}'); } catch { /* defaults */ }
    this.url = cfg.url || 'http://localhost:8765/decide';
    this.apiKey = cfg.apiKey || '';               // dev-only path; prefer the proxy
    this.model = cfg.model || 'jev';
    this.timeoutMs = 2500;
  }

  saveConfig({ url, apiKey, model }) {
    if (url != null) this.url = url;
    if (apiKey != null) this.apiKey = apiKey;
    if (model != null) this.model = model;
    try {
      localStorage.setItem('nemesis.jev.cfg',
        JSON.stringify({ url: this.url, apiKey: this.apiKey, model: this.model }));
    } catch { /* private mode: config lives for the session only */ }
  }

  // state and questions are SEPARATE request fields — the contract's core
  async send(state, questions) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.model, state, questions }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`jev http ${res.status}`);
      return this._normalize(await res.json());
    } finally {
      clearTimeout(timer);
    }
  }

  // Defensive normalization to {id: {answer, p, distribution}} — accepts
  // an answers map or array, probability under several plausible names.
  _normalize(body) {
    const raw = body?.answers ?? body?.results ?? body;
    const out = {};
    const takeOne = (id, a) => {
      if (a == null) return;
      if (typeof a !== 'object') { out[id] = { answer: a, p: 1 }; return; }
      const answer = a.answer ?? a.value ?? a.choice ?? a.label;
      const p = a.probability ?? a.p ?? a.confidence ?? null;
      const distribution = a.distribution ?? a.probabilities ?? null;
      out[id] = { answer, p, distribution };
    };
    if (Array.isArray(raw)) for (const a of raw) takeOne(a.id ?? a.question_id, a);
    else if (raw && typeof raw === 'object') for (const [id, a] of Object.entries(raw)) takeOne(id, a);
    return out;
  }
}
