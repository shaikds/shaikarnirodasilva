// DATA: macro-layer GOAP (FR-3.2). Same planner as combat (ai/goap.js),
// different altitude: between encounters the rival plans how to ADVANCE THE
// RIVALRY. World atoms come from MacroAgent.buildState():
//   hate (0..1), recentLossToPlayer, routePredictable, playerNear,
//   advanced (plan-effect atom, starts false)
//
// Biases (AC-3.2.3) live in the costs: high hate makes Hunt cheap, a recent
// loss makes Train cheap, a predictable player route makes Ambush cheap.

export const MACRO_ACTIONS = [
  {
    name: 'Hunt',
    pre: () => true,
    effect: s => { s.advanced = true; },
    cost: s => 1.5 - s.hate * 1.1 - (s.playerNear ? 0.2 : 0),
  },
  {
    name: 'Train',
    pre: () => true,
    effect: s => { s.advanced = true; },
    cost: s => 1.2 + s.hate * 0.5 - (s.recentLossToPlayer ? 0.9 : 0),
  },
  {
    name: 'Ambush',
    pre: () => true,
    effect: s => { s.advanced = true; },
    cost: s => 1.35 - (s.routePredictable ? 0.9 : 0) - s.hate * 0.25,
  },
];

export const MACRO_GOAL = {
  name: 'AdvanceRivalry',
  satisfied: s => s.advanced,
};

export const MACRO = {
  replanS: 6,            // deliberate cadence between macro decisions
  trainXpPerS: 2,        // AC-3.2.1: Train passively accrues XP at the base
  ambushSpringRange: 6,  // m: the trap snaps shut
  huntChaseRange: 10,    // m: within this, Hunt steers directly at the player
  routeWindow: 10,       // samples of node-visit history considered
  routeThreshold: 0.5,   // top node share that counts as "predictable"
};
