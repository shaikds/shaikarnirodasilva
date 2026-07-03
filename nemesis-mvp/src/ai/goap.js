// Generic GOAP planner (FR-3.2 layer 1 + FR-3.4 layer 2 share this).
// A* over action sequences. World state is a flat object of atoms
// (booleans/numbers). Actions are data:
//   { name, pre(state) -> bool, effect(state) -> void (mutates a copy),
//     cost(state, profile) -> number }
// Goals: { name, satisfied(state) -> bool }
//
// The mirror lives in cost(): actions the player favors return lower costs
// (AC-3.3.2). The skill model lives in the options: maxDepth (a weak
// nemesis literally cannot think far ahead) and costNoise (a weak nemesis
// mis-judges its options) — AC-3.3.4.

export function plan(state, goal, actions, {
  maxDepth = 3, costNoise = 0, profile = null, rng = Math.random,
} = {}) {
  if (goal.satisfied(state)) return [];

  // frontier of partial plans, cheapest first
  const frontier = [{ state, seq: [], cost: 0 }];
  let best = null;

  while (frontier.length) {
    // pop cheapest
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].cost < frontier[bi].cost) bi = i;
    }
    const node = frontier.splice(bi, 1)[0];
    if (best && node.cost >= best.cost) continue;

    for (const a of actions) {
      if (!a.pre(node.state)) continue;
      const s2 = { ...node.state };
      a.effect(s2);
      const c = node.cost + a.cost(node.state, profile) + rng() * costNoise;
      const seq = [...node.seq, a.name];
      if (goal.satisfied(s2)) {
        if (!best || c < best.cost) best = { seq, cost: c };
      } else if (seq.length < maxDepth) {
        frontier.push({ state: s2, seq, cost: c });
      }
    }
  }
  return best ? best.seq : null;
}
