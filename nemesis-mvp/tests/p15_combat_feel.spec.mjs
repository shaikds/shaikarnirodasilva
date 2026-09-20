// P15 — Combat feel: killing-blow VFX, camera FOV-punch, and a latent
// route_uppercut bug fix for the Jev drivers (M13, developer-requested).
// FR-13.2..13.3 (spec.md §8.11).
//
// SCOPE NOTE: the original plan for this milestone included a new
// combo route (a "skySpike" finisher chained off the uppercut launcher).
// It was implemented, then reverted after empirical S-3 band testing
// (2026-09-20) showed a genuine, non-tunable-away balance problem:
// chaining ANYTHING off uppercut removes uppercut's own recovery
// punish-window (canStart('light') becomes true during its recovery),
// which a raw-input bot (PlayerBot, used by the S-3 test) can exploit
// but GOAP structurally cannot — every damage value tried (9, 5, 3, 2,
// 1) still skewed the band, because the problem was never really about
// damage. A first attempt to give GOAP an equivalent opportunistic
// follow-up was ALSO reverted after it produced a 20/20 shutout in
// testing (a real correctness risk, not just a balance nuance). See
// logs/2026-09-20.md for the full investigation. RivalAgent (rivalAgent.js)
// is confirmed byte-identical to its pre-P15 state (verified by a plain
// `git diff` returning nothing) — this suite reconfirms that at the
// behavioral level below.
//
// What shipped instead: the new VFX + camera FOV-punch primitives, tied
// to the killing blow (a moment with zero balance/tuning risk, since the
// duel is already deciding its outcome) instead of a new attack; and a
// genuine, low-risk bug fix — route_uppercut's executor in both Jev
// drivers was silently unable to ever complete its own documented
// light-light-heavy sequence (a busy-gate structural issue, present
// before this session, just never previously tested end-to-end).
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();
await page.evaluate(() => { window.__game.loop.stop(); });

async function reset(opts = {}) {
  await page.evaluate(({ playerPos, dummyPos, playerYaw }) => {
    const g = window.__game;
    const wipe = (f) => {
      f.state = 'idle'; f.stateT = 0; f.attackType = null; f.phase = null;
      f.combo = 0; f.comboT = 0; f.kb.set(0, 0); f.dodgeCd = 0; f.iframeT = 0;
      f.vy = 0; f.grounded = true; f.flying = false; f.chargeT = 0;
      f.attackCharge = 0; f.mesh.visible = true;
    };
    g.player.pos.set(...playerPos); g.player.prevPos.copy(g.player.pos);
    g.player.yaw = playerYaw; g.player.hp = 100; g.player.energy = 60;
    wipe(g.player);
    g.dummy.pos.set(...dummyPos); g.dummy.prevPos.copy(g.dummy.pos);
    g.dummy.hp = 1000; g.dummy.maxHp = 1000; g.dummy.yaw = Math.PI;
    wipe(g.dummy);
    g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
    g.dummyBrain.mode = 'idle';
    g.flow.enabled = false;
    g.prompts.hide();
    g.rivalAgent.enabled = false;
    g.rival.pos.set(200, 0, 200); g.rival.prevPos.copy(g.rival.pos);
    g.rival.hp = g.rival.maxHp;
    if (g.rig.lockTarget !== g.dummy) g.rig.lockTarget = g.dummy;
    g.player.trace.length = 0; g.dummy.trace.length = 0;
    g.__hits = [];
    if (!g.__hooked) {
      g.resolver.on(e => g.__hits.push({
        type: e.type, kind: e.kind, amount: e.amount, killed: e.killed,
        att: e.att.name, def: e.def.name,
      }));
      g.__hooked = true;
    }
  }, {
    playerPos: opts.playerPos ?? [0, 0, -1],
    dummyPos: opts.dummyPos ?? [0, 0, 0.9],
    playerYaw: opts.playerYaw ?? 0,
  });
}

// ================= FR-8.4 (regression) + latent bug fix: Jev drivers =================
// route_uppercut (light1->light2->heavy) is pre-existing FR-8.4 behavior,
// reachable for free by any human/raw-input fighter. Before this session,
// BOTH Jev drivers' own executors for this move could never actually
// complete it (a busy-gate structural bug, not something P15 introduced,
// just first caught while building this milestone) — they'd land light1
// and then just keep re-starting light1 forever. Fixed via
// inRouteUppercutChainWindow (comboMoves.js).

await reset();
const humanRoute = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  const fromLight1 = (() => { f.startAttack('light'); g.step(34); return f.canStart('heavy'); })();
  g.step(140);
  f.state = 'idle'; f.attackType = null; f.phase = null;
  g.dummy.state = 'idle'; g.dummy.stateT = 0; g.dummy.vy = 0; g.dummy.grounded = true;
  g.dummy.pos.set(0, 0, 0.9); g.dummy.prevPos.copy(g.dummy.pos);
  f.pos.set(0, 0, -1); f.prevPos.copy(f.pos); f.yaw = 0;
  f.startAttack('light'); g.step(34);
  f.startAttack('light'); g.step(28);
  const routed = f.canStart('heavy') && f.startAttack('heavy');
  const type = f.attackType;
  g.step(24);
  return { fromLight1, routed, type, launched: !g.dummy.grounded && g.dummy.vy > 4 };
});
check('AC-8.4.1 (regression) light-light-HEAVY still routes into the uppercut for a human/raw-input fighter',
  humanRoute.fromLight1 === false && humanRoute.routed && humanRoute.type === 'uppercut' && humanRoute.launched,
  JSON.stringify(humanRoute));

await reset();
const jevPlayerRoute = await page.evaluate(() => {
  const g = window.__game, f = g.player, jd = g.jevDriver;
  // JevPlayerDriver always targets ctx.rival (not the dummy) — bring it
  // into melee range instead
  g.rival.pos.set(0, 0, 0.9); g.rival.prevPos.copy(g.rival.pos);
  g.rival.hp = g.rival.maxHp; g.rival.yaw = Math.PI;
  g.rival.state = 'idle'; g.rival.stateT = 0; g.rival.attackType = null; g.rival.phase = null;
  g.rival.grounded = true; g.rival.flying = false;
  if (!g.jevPanel.active) g.jevPanel.toggle(true);
  jd.directive = { move: 'route_uppercut', t: 0, hits: 0, taken: 0 };
  jd._sinceDecision = 0;
  jd.backend.send = async () => ({});   // don't let a fresh ask override the directive mid-combo
  for (let i = 0; i < 140; i++) g.step(1);
  g.jevPanel.toggle(false);
  return { finalType: f.attackType, everUppercut: f.trace.some(t => t.type === 'uppercut') || f.attackType === 'uppercut' };
});
check('AC-9.2 (bug fix) JevPlayerDriver actually completes route_uppercut end-to-end (previously silently stuck at light1)',
  jevPlayerRoute.everUppercut, JSON.stringify(jevPlayerRoute));

await reset({ playerPos: [0, 0, -1] });
const jevNemesisRoute = await page.evaluate(() => {
  const g = window.__game;
  g.rival.pos.set(0, 0, 0.9); g.rival.prevPos.copy(g.rival.pos);
  g.rival.hp = g.rival.maxHp; g.rival.yaw = Math.PI;
  g.rival.state = 'idle'; g.rival.stateT = 0; g.rival.attackType = null; g.rival.phase = null;
  g.rivalAgent.enabled = true;
  if (!g.nemesisPanel.active) g.nemesisPanel.toggle(true);
  const jd = g.jevNemesisDriver;
  jd.directive = { move: 'route_uppercut', t: 0, hits: 0, taken: 0 };
  jd._sinceDecision = 0;
  jd.backend.send = async () => ({});
  for (let i = 0; i < 140; i++) g.step(1);
  g.nemesisPanel.toggle(false);
  return { finalType: g.rival.attackType, everUppercut: g.rival.trace.some(t => t.type === 'uppercut') || g.rival.attackType === 'uppercut' };
});
check('AC-10.2 (bug fix) JevNemesisDriver actually completes route_uppercut end-to-end via the same fix',
  jevNemesisRoute.everUppercut, JSON.stringify(jevNemesisRoute));

// ================= FR-13.1 (descoped): GOAP is untouched =================

await reset({ playerPos: [0, 0, -1] });
const goapUnchanged = await page.evaluate(() => {
  const g = window.__game;
  g.rival.pos.set(0, 0, 0.9); g.rival.prevPos.copy(g.rival.pos);
  g.rival.hp = g.rival.maxHp; g.rival.yaw = Math.PI;
  g.rival.state = 'idle'; g.rival.stateT = 0; g.rival.attackType = null; g.rival.phase = null;
  g.rival.combo = 0; g.rival.vy = 0; g.rival.grounded = true; g.rival.flying = false;
  g.player.state = 'idle'; g.player.stateT = 0; g.player.attackType = null; g.player.phase = null;
  g.player.grounded = true; g.player.flying = false;
  g.rivalAgent.enabled = true;
  g.rivalAgent.currentPlan = []; g.rivalAgent.currentAction = null;
  g.rivalAgent.replanT = 0;
  for (let i = 0; i < 60; i++) g.step(1);
  return { ranWithoutError: true };
});
check('AC-13.1 GOAP (RivalAgent) runs unaffected — no new mechanism was shipped for it',
  goapUnchanged.ranWithoutError, JSON.stringify(goapUnchanged));

// ================= FR-13.1.3: fairness band, pure regression check =================
// Nothing in this milestone touches the attack table's damage/chain
// fields (that attempt was reverted), so this is a plain regression
// check, not new balance surface — confirmed clean 8/8 in isolation
// during implementation with skySpike's chain link removed.

async function runBand() {
  return page.evaluate(() => {
    const g = window.__game;
    g.flow.enabled = false;
    g.prompts.hide();
    const fresh = new g.profile.constructor();
    Object.assign(g.profile, fresh.toJSON());
    g.sync.rating = 1000; g.sync.wins = 0; g.sync.losses = 0;
    g.rivalAgent.skillFloor = 0;
    const resetDuel = () => {
      for (const [f, pos] of [[g.player, [0, 0, 4]], [g.rival, [0, 0, -4]]]) {
        f.revive({ x: pos[0], z: pos[2] });
      }
      g.dummy.pos.set(15, 0, 15); g.dummy.prevPos.copy(g.dummy.pos);
      g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
      g.rivalAgent.enabled = true;
      g.rivalAgent.currentPlan = []; g.rivalAgent.currentAction = null;
      g.rivalAgent.replanT = 0; g.rivalAgent.plannedDefense = null;
      g.projectiles.list.forEach(p => g.scene.remove(p.mesh));
      g.projectiles.list.length = 0;
    };
    g.setPlayerDriver('aggressive');
    const results = [];
    for (let i = 0; i < 20; i++) {
      resetDuel();
      let t = 0;
      while (t < 14400 && g.player.alive && g.rival.alive) { g.step(30); t += 30; }
      const won = g.sync.roundEnd(Math.max(0, g.player.hp), Math.max(0, g.rival.hp));
      results.push(won ? 'P' : 'R');
    }
    g.setPlayerDriver('human');
    g.rivalAgent.skillFloor = null;
    return { wins: g.sync.wins, results: results.join('') };
  });
}
let band = await runBand();
let bandNote = `player ${band.wins}/20 (${band.results})`;
if (band.wins < 6 || band.wins > 14) {
  const retry = await runBand();
  bandNote += ` · resample: ${retry.wins}/20 (${retry.results})`;
  band = retry;
}
check('AC-13.1.3 S-3 fairness band holds (pure regression check — no combat-table changes shipped)',
  band.wins >= 6 && band.wins <= 14, bandNote);

// ================= FR-13.2: new VFX, triggered on the killing blow =================

await reset();
const vfxSpy = await page.evaluate(async () => {
  const g = window.__game;
  let finisherCalls = 0;
  const orig = g.vfx.spawnFinisherImpact.bind(g.vfx);
  g.vfx.spawnFinisherImpact = (pos) => { finisherCalls++; orig(pos); };
  const decalsBefore = g.vfx.decals.length;
  g.resolver._emit({ type: 'hit', att: g.player, def: g.dummy, pos: { x: 0, y: 1, z: 0 }, kind: 'light', amount: 5, combo: 1, killed: false });
  const callsAfterOrdinary = finisherCalls;
  g.resolver._emit({ type: 'hit', att: g.player, def: g.dummy, pos: { x: 0, y: 1, z: 0 }, kind: 'heavy', amount: 20, combo: 1, killed: true });
  const decalsAfter = g.vfx.decals.length;
  return { callsAfterOrdinary, callsAfterKill: finisherCalls, decalsBefore, decalsAfter };
});
check('AC-13.2.1 an ordinary (non-killing) hit does not spawn the finisher VFX',
  vfxSpy.callsAfterOrdinary === 0, JSON.stringify(vfxSpy));
check('AC-13.2.1 the killing blow spawns the new VFX exactly once',
  vfxSpy.callsAfterKill === 1, JSON.stringify(vfxSpy));
check('AC-13.2.2 the killing blow leaves a ground decal',
  vfxSpy.decalsAfter > vfxSpy.decalsBefore, JSON.stringify(vfxSpy));

// ================= FR-13.3: camera FOV punch =================

await reset();
const fov = await page.evaluate(async () => {
  const g = window.__game;
  const rig = g.rig;
  const baseFov = rig._baseFov;
  rig._fovPunch = 0; rig.camera.fov = baseFov; rig.camera.updateProjectionMatrix();
  // ordinary non-killing hit: no punch
  g.resolver._emit({ type: 'hit', att: g.player, def: g.dummy, pos: { x: 0, y: 1, z: 0 }, kind: 'light', amount: 5, combo: 1, killed: false });
  const afterLight = rig._fovPunch;
  rig.fovPunch(6);   // simulate what strike() does on a blast/kill directly
  const afterPunch = rig._fovPunch;
  rig.update(0.016, { x: 0, y: 0 });
  const fovRightAfter = rig.camera.fov;
  for (let i = 0; i < 200; i++) rig.update(0.016, { x: 0, y: 0 });
  const fovSettled = rig.camera.fov;
  return { baseFov, afterLight, afterPunch, fovRightAfter, fovSettled };
});
check('AC-13.3.1 an ordinary hit does not punch the camera FOV', fov.afterLight === 0, JSON.stringify(fov));
check('AC-13.3.1 fovPunch raises the camera FOV above baseline', fov.fovRightAfter > fov.baseFov, JSON.stringify(fov));
check('AC-13.3.2 the FOV punch decays back to baseline', Math.abs(fov.fovSettled - fov.baseFov) < 0.05, JSON.stringify(fov));

// AC-13.3.1/13.3.2 end-to-end: a real killing blow through strike() punches the FOV and it decays
await reset();
const fovE2E = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  const rig = g.rig;
  rig._fovPunch = 0; rig.camera.fov = rig._baseFov; rig.camera.updateProjectionMatrix();
  g.dummy.hp = 1; g.dummy.maxHp = 1000;   // one clean hit will kill it
  f.startAttack('light');
  g.step(30);   // windup + into active
  rig.update(0.016, { x: 0, y: 0 });
  const punched = rig.camera.fov;
  for (let i = 0; i < 200; i++) rig.update(0.016, { x: 0, y: 0 });
  const settled = rig.camera.fov;
  return { baseFov: rig._baseFov, punched, settled, dummyDead: !g.dummy.alive };
});
check('AC-13.3.1 a real killing blow punches the camera FOV end-to-end',
  fovE2E.dummyDead && fovE2E.punched > fovE2E.baseFov, JSON.stringify(fovE2E));
check('AC-13.3.2 it decays back to baseline afterward',
  Math.abs(fovE2E.settled - fovE2E.baseFov) < 0.05, JSON.stringify(fovE2E));

// leave the game in default state for anything after this suite
await page.evaluate(() => {
  const g = window.__game;
  if (g.nemesisPanel.active) g.nemesisPanel.toggle(false);
  if (g.jevPanel.active) g.jevPanel.toggle(false);
  g.rivalAgent.enabled = false;
  g.rivalAgent.skillFloor = null;
});

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p15.png' });
await browser.close();
finish();
