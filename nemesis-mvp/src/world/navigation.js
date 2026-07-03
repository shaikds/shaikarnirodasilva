// Waypoint graph over the zone (FR-3.2 movement substrate). Hand-authored
// nodes/edges — a navmesh is overkill for six locations (plan.md §8).

const NODES = {
  tutorial: [-38, -2],
  tutorialExit: [-27, -2],
  arenaGate: [0, -14],
  arena: [0, 0],
  openGround: [0, -30],
  chokeN: [-28, -16],
  chokeS: [-28, -42],
  openEast: [16, -32],
  rivalBase: [30, -42],
};
const EDGES = [
  ['tutorial', 'tutorialExit'],
  ['tutorialExit', 'openGround'],
  ['tutorialExit', 'chokeN'],
  ['chokeN', 'chokeS'],
  ['chokeS', 'openGround'],
  ['openGround', 'arenaGate'],
  ['arenaGate', 'arena'],
  ['openGround', 'openEast'],
  ['openEast', 'rivalBase'],
];

export class Navigation {
  constructor() {
    this.nodes = NODES;
    this.adj = {};
    for (const n of Object.keys(NODES)) this.adj[n] = [];
    for (const [a, b] of EDGES) { this.adj[a].push(b); this.adj[b].push(a); }
  }

  nearestNode(pos) {
    let best = null, bd = Infinity;
    for (const [name, [x, z]] of Object.entries(this.nodes)) {
      const d = Math.hypot(pos.x - x, pos.z - z);
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }

  // BFS: fine at this scale, edges are near-uniform length
  path(fromName, toName) {
    if (fromName === toName) return [toName];
    const prev = { [fromName]: null };
    const q = [fromName];
    while (q.length) {
      const n = q.shift();
      for (const m of this.adj[n]) {
        if (m in prev) continue;
        prev[m] = n;
        if (m === toName) {
          const out = [m];
          let c = n;
          while (c) { out.unshift(c); c = prev[c]; }
          return out;
        }
        q.push(m);
      }
    }
    return null;
  }

  nodePos(name) { const [x, z] = this.nodes[name]; return { x, z }; }
}

// steers a Fighter along the graph; used by the fleeing rival (P5) and the
// macro-GOAP agent (P6)
export class WaypointWalker {
  constructor(nav, fighter) {
    this.nav = nav;
    this.f = fighter;
    this.route = null;
    this.i = 0;
  }

  setDestination(nodeName) {
    this.route = this.nav.path(this.nav.nearestNode(this.f.pos), nodeName);
    this.i = 0;
  }
  get active() { return this.route != null; }
  stop() { this.route = null; }

  // returns true when arrived
  update() {
    if (!this.route) return true;
    const [x, z] = this.nav.nodes[this.route[this.i]];
    const dx = x - this.f.pos.x, dz = z - this.f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.3) {
      this.i++;
      if (this.i >= this.route.length) {
        this.route = null;
        this.f.intent.move.x = 0; this.f.intent.move.z = 0;
        return true;
      }
      return false;
    }
    this.f.intent.move.x = dx / d;
    this.f.intent.move.z = dz / d;
    this.f.intent.face = Math.atan2(dx, dz);
    return false;
  }
}
