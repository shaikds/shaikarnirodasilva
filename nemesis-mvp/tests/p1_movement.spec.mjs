// P1 — movement, camera, lock-on (FR-4.1: AC-4.1.1 .. 4.1.5)
import { boot, check, finish, hold } from './helpers.js';

const { browser, page, errors } = await boot();
const evalG = (fn) => page.evaluate(fn);

// This suite tests player movement/camera/lock-on in isolation. The rival
// is a real, always-on fighter in the scene (P3+) — neutralize it so it
// can't wander into the player mid-test and pollute state assertions.
await evalG(() => {
  const g = window.__game;
  g.rivalAgent.enabled = false;
  g.rival.pos.set(200, 0, 200); g.rival.prevPos.copy(g.rival.pos);
});

// -- AC-4.1.1: WASD camera-relative movement --
const p0 = await evalG(() => ({ ...window.__game.player.pos }));
await hold(page, 'w', 500);
const p1 = await evalG(() => ({ ...window.__game.player.pos }));
const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('W moves the player', moved > 1.5, `moved ${moved.toFixed(2)}m`);
// camera starts behind looking -z, so W should reduce z
check('movement is camera-relative (-z)', p1.z < p0.z - 1, `z ${p0.z.toFixed(1)} -> ${p1.z.toFixed(1)}`);

// -- AC-4.1.5: jump --
const jumpY = await evalG(async () => {
  const g = window.__game;
  g.input.pressT.jump = g.loop.simTime;      // simulate press
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 16));
    peak = Math.max(peak, g.player.pos.y);
  }
  return peak;
});
check('jump reaches ~1.5m apex', jumpY > 1.2 && jumpY < 2.2, `peak ${jumpY.toFixed(2)}m`);

// -- AC-4.1.4: dodge distance, i-frames, cooldown --
// Deterministic manual stepping (loop stopped, ticks advanced directly):
// wall-clock waits can't reliably hit ~100-200ms windows once real frame
// times get long (many lights/shadows under headless software rendering),
// same lesson already applied to the P2/P3 combat specs.
const dodge = await evalG(() => {
  const g = window.__game, f = g.player;
  g.loop.stop();
  const start = { x: f.pos.x, z: f.pos.z };
  f.startDodge(f.intent.move.x, f.intent.move.z);
  g.step(6);                                  // ~50ms: mid-dodge
  const iframesEarly = f.iframeT > 0 && f.state === 'dodge';
  g.step(25);                                 // ~260ms total: past 200ms iframe window
  const iframesLate = f.iframeT;
  const duringCd = f.startDodge(1, 0);        // must be refused on cooldown
  g.step(18);                                 // ~410ms total: dodge (300ms) finished
  const dist = Math.hypot(f.pos.x - start.x, f.pos.z - start.z);
  g.step(48);                                 // past the 500ms cooldown
  const afterCd = f.startDodge(1, 0);         // allowed after cooldown
  g.loop.start();
  return { iframesEarly, iframesLate, duringCd, afterCd, dist };
});
check('dodge grants early i-frames', dodge.iframesEarly);
check('i-frames end by ~200ms', dodge.iframesLate <= 0.02, `left ${dodge.iframesLate}`);
check('dodge travels ~3.5m', dodge.dist > 2.6 && dodge.dist < 4.4, `${dodge.dist.toFixed(2)}m`);
check('dodge refused during cooldown', dodge.duringCd === false);
check('dodge allowed after cooldown', dodge.afterCd === true);

// -- AC-4.1.2: lock-on acquire / strafe-facing / range break / re-acquire --
const lock = await evalG(async () => {
  const g = window.__game, out = {};
  g.rig.toggleLock([g.dummy]);
  out.acquired = g.rig.lockTarget === g.dummy;
  await new Promise(r => setTimeout(r, 400));
  // locked facing: player yaw should point at dummy
  const want = g.player.yawTo(g.dummy);
  let d = Math.abs(want - g.player.yaw) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  out.facing = d;
  // drag the dummy out of range -> lock must break
  g.dummy.pos.set(40, 0, -40); g.dummy.prevPos.copy(g.dummy.pos);
  await new Promise(r => setTimeout(r, 200));
  out.broke = g.rig.lockTarget === null;
  // bring it back within the 2s window -> soft re-acquire
  g.dummy.pos.set(0, 0, -3); g.dummy.prevPos.copy(g.dummy.pos);
  await new Promise(r => setTimeout(r, 300));
  out.reacquired = g.rig.lockTarget === g.dummy;
  return out;
});
check('lock-on acquires nearest candidate', lock.acquired);
check('locked player faces target', lock.facing < 0.35, `off by ${lock.facing.toFixed(2)} rad`);
check('lock breaks beyond 25m', lock.broke);
check('soft re-acquire within 2s', lock.reacquired);

// -- AC-4.1.3 implicit: no snapping — covered by turn smoothing; visual pass.
// -- collision: walking into the arena wall must not pass through --
const wall = await evalG(async () => {
  const g = window.__game, f = g.player;
  f.pos.set(0, 0, 8); f.prevPos.copy(f.pos);
  g.rig.lockTarget = null;
  return null;
});
await hold(page, 's', 1600);                  // run south into the wall
const wallZ = await evalG(() => window.__game.player.pos.z);
check('arena wall stops the player', wallZ < 12.6, `z=${wallZ.toFixed(2)} (wall inner face ~11.55)`);

check('no console/page errors', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: process.env.SHOT || '/tmp/p1.png' });
await browser.close();
finish();
