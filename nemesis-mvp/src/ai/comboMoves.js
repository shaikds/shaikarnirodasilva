// FR-9.2/FR-10.2: shared executor for the route_uppercut move, used by
// BOTH Jev drivers (their case bodies were byte-identical duplicates
// before this). Progresses light1 -> light2 -> heavy(uppercut) — the
// existing combo route (FR-8.4) — since AI-controlled fighters execute
// named moves rather than raw input and otherwise couldn't reach it (see
// inRouteUppercutChainWindow below).
export function driveRouteUppercut(f, dist, meleeRange, advance) {
  if (dist > meleeRange * 1.1) { advance(); return; }
  if (f.state === 'attack' && f.attackType === 'light2' && f.canStart('heavy')) { f.startAttack('heavy'); return; }
  if (f.canStart('light')) f.startAttack('light');
}

// A chain link (light1->light2, light2->heavy/uppercut) is only legal
// DURING the recover phase of the attack that opened it — which is also
// when Fighter.busy is still true. The drivers' generic "busy? bail"
// gate would otherwise never let route_uppercut's executor see that
// window at all (a latent bug this fixes, independent of any new combat
// route — see logs/2026-09-20.md), so callers check this first to let
// the gate through specifically for it (every other move keeps the
// plain busy gate untouched).
export function inRouteUppercutChainWindow(f) {
  return f.state === 'attack' && f.phase === 'recover' &&
    (f.canStart('light') || f.canStart('heavy'));
}
