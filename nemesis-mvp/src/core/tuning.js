// Central tuning aggregation (NFR-4). Logic modules import ONLY from here
// (or from the data modules this file re-exports). If a playtest wants a
// different number, it changes here — never inline in logic.

export const MOVE = {
  speed: 7.0,            // m/s ground (raised 2026-07-06: free-roam tempo)
  airCtl: 0.85,          // air control multiplier
  gravity: 22,
  jumpV: 8.5,            // ~1.6 m apex
  turnRate: 12,          // rad/s facing smoothing (AC-4.1.3)
  dodge: {
    dur: 0.30,           // s (AC-4.1.4)
    iframes: 0.20,
    dist: 3.5,           // m
    cooldown: 0.50,
  },
  radius: 0.45,          // capsule radius
  height: 1.8,
};

export const CAMERA = {
  dist: 5.4,
  heightOffset: 1.6,     // orbit pivot above feet
  minPitch: -0.15,
  maxPitch: 1.1,
  orbitSpeed: 2.6,       // rad/s for key orbit
  mouseSens: 0.0028,
  lockRange: 25,         // m (AC-4.1.2)
  reacquireWindow: 2.0,  // s
  followLerp: 10,        // position smoothing
};

export const INPUT = {
  bufferMs: 150,         // AC-4.6.1
};

// Skill scaling (AC-3.3.4): [at skill 0, at skill 1], lerped by sync skill.
export const AI = {
  reactionMs: [420, 130],
  planDepth: [2, 4],
  replanS: [0.5, 0.15],
  costNoise: [0.6, 0.05],
  mistakeRate: [0.30, 0.04],
  defendScale: [0.6, 1.15],
  rubberBand: 0.25,      // in-round skill drift vs hp difference
  meleeRange: 1.9,       // "inRange" atom threshold (m)
  midRange: 6.0,
  pressureHits: 3,       // hits taken within pressureWindow => underPressure
  pressureWindow: 2.0,
};
