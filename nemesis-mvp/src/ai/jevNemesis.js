// Jev-as-nemesis state (FR-10.1): the SAME state/questions contract as
// jev.js, but from the rival's own point of view — richer rivalry memory
// (it owns the ledger, the hate, the name), because this IS the nemesis.
//
// This module deliberately imports the tactical vocabulary and question
// SHAPE from jev.js rather than duplicating it: the two fighters share one
// rulebook, so Jev's judgments should share one bank. Only the framing
// (persona) and which Fighter is "me" vs "foe" differ.

import { buildQuestions, VOICE_LINES } from './jev.js';

export { VOICE_LINES };

const PERSONA =
  'You are JEV, the undying nemesis of the fighter described in `foe` — ' +
  'you remember every duel between you. You fight to win, to make them ' +
  'fear the rematch, and to settle the record in `rivalry`. Aggressive, ' +
  'opportunistic, never wasteful. All facts about this instant are in ' +
  'the state fields.';

export const NEMESIS_QUESTIONS = buildQuestions(PERSONA);

// ---- STATE: named fields, observed facts, the nemesis's own memory ----
export function buildNemesisState(ctx) {
  const me = ctx.rival, foe = ctx.player;
  const dist = me.distanceTo(foe);
  const nearWall = Math.min(
    12.5 - Math.abs(me.pos.x - 0), 12.5 - Math.abs(me.pos.z - 0)
  ) < 3.5 && Math.abs(me.pos.x) < 14 && Math.abs(me.pos.z) < 14;
  return {
    me: {
      name: ctx.manager.doc.name, level: ctx.manager.doc.level,
      hp: Math.round(me.hp), maxHp: me.maxHp,
      energy: Math.round(me.energy),
      surgeMeter: Math.round(me.surgeMeter), transformed: me.surge,
      flying: me.flying, canFly: me.canFly,
      state: me.state, powerLevel: me.power,
      chargeReady: me.state === 'idle' || me.state === 'block',
    },
    foe: {
      hp: Math.round(foe.hp), maxHp: foe.maxHp,
      state: foe.state, phase: foe.phase,          // wind-up ≠ recover ≠ stagger
      blocking: foe.blocking, charging: foe.state === 'charge',
      transformed: foe.surge, flying: foe.flying,
      distanceMeters: +dist.toFixed(1),
      altitudeGapMeters: +(foe.pos.y - me.pos.y).toFixed(1),
      nearWall,
    },
    duel: {
      phase: ctx.flow.state,
      myComboHits: me.combo, foeComboHits: foe.combo,
    },
    recent: ctx.jev?.recent?.slice(-4) ?? [],        // short observed events
    rivalry: {
      record: ctx.manager.doc.record,               // {wins, losses, escapes} — MY record
      myHate: ctx.manager.doc.emotionalState,        // it's MY OWN grudge, not the foe's
      grudges: ctx.manager.ledger?.last(3).map(e => e.label) ?? [],
      macroGoal: ctx.macroAgent?.current ?? null,    // why this duel started
    },
    lastDirective: ctx.jev?.lastDirective ?? null,
  };
}
