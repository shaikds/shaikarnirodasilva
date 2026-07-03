// Central tuning aggregation (NFR-4). Logic modules import ONLY from here
// (or from the data modules this file re-exports). If a playtest wants a
// different number, it changes here — never inline in logic.

export const MOVE = {
  speed: 6.0,            // m/s ground
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
