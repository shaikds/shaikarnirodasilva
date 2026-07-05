// DATA: micro-combat GOAP actions & goals (FR-3.4, AC-3.4.1/3.4.2).
// State atoms produced by RivalAgent.buildState():
//   inRange, midRange, playerBlocking, playerAttacking, energyFull,
//   underPressure, playerRetreating, playerLowHp, myLowHp,
//   damaged/guardBroken/avoided/spaced (plan-effect atoms, start false)
//
// Costs receive the PlayerProfile: the player's own habits make the same
// tools cheaper for the rival — the mirror, upgraded from dice to plans.

export const MICRO_ACTIONS = [
  {
    name: 'approach',
    pre: s => !s.inRange,
    effect: s => { s.inRange = true; s.midRange = false; },
    cost: (s, p) => 0.9 + (p ? (1 - p.aggression) * 0.4 : 0.2),
  },
  {
    name: 'retreat',
    pre: s => true,
    effect: s => { s.inRange = false; s.midRange = true; s.underPressure = false; s.avoided = true; },
    cost: (s, p) => 1.1 + (p ? p.aggression * 0.5 : 0.25),
  },
  {
    name: 'strafe',
    pre: s => true,
    effect: s => { s.spaced = true; },
    cost: () => 0.8,
  },
  {
    name: 'lightAttack',
    pre: s => s.inRange,
    effect: s => { s.damaged = true; },
    // blocked lights are nearly free damage for the defender — costlier
    cost: (s, p) => (1 / (0.45 + (p ? p.lightShare : 0.65))) + (s.playerBlocking ? 1.2 : 0),
  },
  {
    name: 'heavyAttack',
    pre: s => s.inRange,
    effect: s => { s.damaged = true; s.guardBroken = true; },
    cost: (s, p) => (1 / (0.45 + (p ? p.heavyPref : 0.35))) - (s.playerBlocking ? 0.35 : 0),
  },
  {
    name: 'fireSpecial',
    pre: s => s.energyFull,
    effect: s => { s.damaged = true; s.energyFull = false; },
    cost: (s, p) => 1 / (0.25 + (p ? p.specialPref * 2.5 : 0.2)),
  },
  {
    name: 'dodge',
    pre: s => s.playerAttacking,
    effect: s => { s.avoided = true; },
    cost: (s, p) => 1 / (0.4 + (p ? p.dodgePref : 0.5)),
  },
  {
    name: 'block',
    pre: s => s.playerAttacking,
    effect: s => { s.avoided = true; },
    cost: (s, p) => 1 / (0.4 + (p ? 1 - p.dodgePref : 0.5)),
  },
  {
    name: 'keepDistance',
    pre: s => !s.energyFull,
    effect: s => { s.energyFull = true; s.inRange = false; s.midRange = true; },
    cost: (s, p) => 1.4 - (p ? (1 - p.aggression) * 0.5 : 0.2),
  },
  // M7 (FR-7.2/7.3): the rush and the barrage
  {
    name: 'dragonDash',
    pre: s => !s.inRange && s.canDash,
    effect: s => { s.inRange = true; s.midRange = false; },
    cost: (s, p) => 0.55 + (p ? (1 - p.aggression) * 0.4 : 0.2),   // faster than walking
  },
  {
    name: 'kiBarrage',
    pre: s => !s.inRange,
    effect: s => { s.damaged = true; },
    cost: (s, p) => 1 / (0.35 + (p ? p.specialPref * 2 : 0.2)),
  },
];

// Goal selection: highest priority wins; ties go to the earlier entry.
export const MICRO_GOALS = [
  {
    name: 'BreakGuard',
    satisfied: s => s.guardBroken,
    priority: s => (s.playerBlocking ? 3.0 : 0),
    hud: 'BREAKING YOUR GUARD',
  },
  {
    name: 'EscapePressure',
    satisfied: s => s.avoided,
    priority: s => (s.underPressure ? 2.6 : 0) + (s.myLowHp && s.inRange ? 0.6 : 0),
    hud: 'RESETTING',
  },
  {
    name: 'PunishRetreat',
    satisfied: s => s.damaged,
    priority: s => (s.playerRetreating && s.playerLowHp ? 2.4 : 0),
    hud: 'NO ESCAPE',
  },
  {
    name: 'ChargeSpecial',
    satisfied: s => s.energyFull,
    priority: (s, p) => (!s.energyFull && !s.inRange && (p?.specialPref ?? 0) > 0.05 ? 1.4 : 0),
    hud: 'GATHERING POWER',
  },
  {
    name: 'DamagePlayer',
    satisfied: s => s.damaged,
    priority: () => 1.0,
    hud: 'ATTACKING',
  },
];
