// DATA ONLY (NFR-4, AC-4.2.3): the single attack table that drives both
// player and rival, plus defense/combo/feel constants. Times in seconds,
// distances in meters, damage in HP.

export const ATTACKS = {
  light1: {
    kind: 'light', dmg: 6, windup: 0.13, active: 0.09, recover: 0.20,
    range: 1.9, arcDeg: 90, knock: 1.2, lunge: 0.6, track: 1.05,   // rad/s ~60°/s
    energyGain: 14, chain: 'light2', cancelRecover: ['dodge', 'block'],
  },
  light2: {
    kind: 'light', dmg: 7, windup: 0.11, active: 0.09, recover: 0.20,
    range: 1.9, arcDeg: 90, knock: 1.2, lunge: 0.6, track: 1.05,
    energyGain: 14, chain: 'light3', cancelRecover: ['dodge', 'block'],
  },
  light3: {   // string finisher: bigger hit, longer tail
    kind: 'light', dmg: 10, windup: 0.14, active: 0.10, recover: 0.28,
    range: 2.0, arcDeg: 90, knock: 2.4, lunge: 0.8, track: 1.05,
    energyGain: 16, chain: null, cancelRecover: ['dodge', 'block'],
  },
  heavy: {    // commit-only: no cancels during windup/active (AC-4.6.2)
    kind: 'heavy', dmg: 14, windup: 0.33, active: 0.11, recover: 0.34,
    range: 2.2, arcDeg: 90, knock: 3.0, lunge: 1.0, track: 1.05,
    energyGain: 18, chain: null, cancelRecover: ['block'],
    blockBreak: true,
  },
  special: {  // P3: fires a projectile at windup end (FR-4.4)
    kind: 'special', dmg: 18, windup: 0.48, active: 0.06, recover: 0.28,
    range: 0, arcDeg: 0, knock: 4.2, lunge: 0, track: 0.7,
    energyGain: 0, chain: null, cancelRecover: [],
    projectile: { speed: 26, radius: 0.35 },
  },
};

export const DEFENSE = {
  blockReduce: { light: 0.85, heavy: 0.55, special: 0.50 },  // AC-4.3.1
  parryWindow: 0.15,          // block age at impact that parries (AC-4.3.2)
  parryWhiffRecover: 0.40,    // released a parry attempt into thin air
  parryAttackerStagger: 0.60, // guaranteed punish window
  blockedHeavyStagger: 0.40,  // heavy breaks block (AC-4.2.2)
  blockMoveMult: 0.5,
  flinch: 0.15,               // light hit reaction (AC-4.6.5)
  heavyStagger: 0.40,         // heavy hit reaction
};

export const COMBO = {
  window: 1.6,                // s between clean hits (AC-4.5.1)
  dmgPerStep: 0.08,
  dmgCap: 0.48,
  slowmoAt: 5,                // hits (AC-4.5.2)
  slowmoMs: 260,
  slowmoFactor: 0.35,
};

export const ENERGY = {
  max: 100, passivePerS: 3, onHitLanded: 14, onHitTaken: 8, specialCost: 60,
};

export const FEEL = {
  hitstopMs: { light: 40, heavy: 80, special: 80, blocked: 20, parried: 60 },
  shake: { light: 0.06, heavy: 0.16, special: 0.2, blocked: 0.03, parried: 0.1 },
  impulse: 0.35,              // camera kick on heavy+ hits (AC-4.6.4)
};
