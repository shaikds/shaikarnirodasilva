// MacroAgent (FR-3.2): the rival's between-encounters mind. Chooses
// Hunt / Train / Ambush via the shared GOAP planner and executes the
// choice over the waypoint graph. Active only while the GameFlow is in
// FREE_ROAM (the flow drives update()).

import { plan } from './goap.js';
import { MACRO_ACTIONS, MACRO_GOAL, MACRO } from './macroActions.js';
import { WaypointWalker } from '../world/navigation.js';

export class MacroAgent {
  constructor({ rival, player, manager, nav, zone }) {
    this.rival = rival;
    this.player = player;
    this.manager = manager;
    this.nav = nav;
    this.zone = zone;
    this.walker = new WaypointWalker(nav, rival);
    this.current = null;          // 'Hunt' | 'Train' | 'Ambush'
    this.forced = null;           // debug override (AC-3.2.3 demonstration)
    this.armed = false;           // Ambush: lying in wait at the chokepoint
    this._replanT = 0;
    this._routeSamples = [];      // recent player nearest-node history
    this._routeSampleT = 0;
    this._trainTell = 0;
  }

  force(goal) {
    this.forced = goal;
    this._replanT = 0;
  }

  buildState() {
    const hate = this.manager.doc.emotionalState / 100;
    // "recent loss": the latest duel outcome in the ledger is a rival loss
    const lastDuel = [...this.manager.ledger.entries].reverse()
      .find(e => e.event === 'duel_won' || e.event === 'duel_lost');
    // route predictability from sampled player positions (AC-3.2.3)
    const counts = {};
    for (const n of this._routeSamples) counts[n] = (counts[n] ?? 0) + 1;
    const top = Math.max(0, ...Object.values(counts));
    const routePredictable =
      this._routeSamples.length >= MACRO.routeWindow / 2 &&
      top / this._routeSamples.length >= MACRO.routeThreshold;
    return {
      hate,
      recentLossToPlayer: lastDuel?.event === 'duel_lost',
      routePredictable,
      playerNear: this.rival.distanceTo(this.player) < 20,
      advanced: false,
    };
  }

  replan() {
    if (this.forced) {
      this._setGoal(this.forced);
      return this.current;
    }
    const seq = plan(this.buildState(), MACRO_GOAL, MACRO_ACTIONS, {
      maxDepth: 1, costNoise: 0.15,
    });
    this._setGoal(seq?.[0] ?? 'Train');
    return this.current;
  }

  _setGoal(goal) {
    if (this.current !== goal) {
      this.current = goal;
      this.armed = false;
      this.walker.stop();
      if (goal === 'Train') this.walker.setDestination('rivalBase');
      if (goal === 'Ambush') this.walker.setDestination('chokeN');
    }
  }

  // returns 'spring' when an armed ambush snaps shut; the flow handles it
  update(dt, simT) {
    const r = this.rival, p = this.player;
    if (!r.alive) return null;

    // sample the player's route for predictability learning
    this._routeSampleT -= dt;
    if (this._routeSampleT <= 0) {
      this._routeSampleT = 2.5;
      this._routeSamples.push(this.nav.nearestNode(p.pos));
      if (this._routeSamples.length > MACRO.routeWindow) this._routeSamples.shift();
    }

    this._replanT -= dt;
    if (this._replanT <= 0 || !this.current) {
      this._replanT = MACRO.replanS * (0.8 + Math.random() * 0.4);
      this.replan();
    }

    r.intent.move.x = 0; r.intent.move.z = 0;

    switch (this.current) {
      case 'Hunt': {
        const dist = r.distanceTo(p);
        if (dist < MACRO.huntChaseRange) {
          // a hunting rival moves DIRECTLY at the player (AC-3.2.4 tell)
          const dx = p.pos.x - r.pos.x, dz = p.pos.z - r.pos.z;
          r.intent.move.x = dx / dist; r.intent.move.z = dz / dist;
          r.intent.face = r.yawTo(p);
          this.walker.stop();
        } else {
          if (!this.walker.active) this.walker.setDestination(this.nav.nearestNode(p.pos));
          if (this.walker.update()) this.walker.setDestination(this.nav.nearestNode(p.pos));
        }
        break;
      }
      case 'Train': {
        const base = this.zone.locations.rivalBase;
        const atBase = Math.hypot(r.pos.x - base.x, r.pos.z - base.z) < 4;
        if (!atBase) {
          if (!this.walker.active) this.walker.setDestination('rivalBase');
          this.walker.update();
        } else {
          // AC-3.2.1: training passively accrues XP (rival grows off-screen)
          this.manager.doc.xp += MACRO.trainXpPerS * dt;
          // training tell: shadow-swings at the air
          this._trainTell -= dt;
          if (this._trainTell <= 0 && r.canStart('light')) {
            r.startAttack('light');
            this._trainTell = 1.2 + Math.random();
          }
        }
        break;
      }
      case 'Ambush': {
        if (!this.armed) {
          if (!this.walker.active && !this._ambushPlaced) {
            this.walker.setDestination('chokeN');
            this._ambushPlaced = true;
          }
          if (this.walker.update()) { this.armed = true; this._ambushPlaced = false; }
        } else {
          // stationary, off the path, waiting (AC-3.2.4 tell)
          if (r.distanceTo(p) < MACRO.ambushSpringRange) {
            this.armed = false;
            return 'spring';
          }
        }
        break;
      }
    }
    return null;
  }
}
