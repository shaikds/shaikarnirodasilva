// P0 — boot & first light (roadmap P0; NFR-1, NFR-2 foundations)
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

await page.waitForTimeout(1500);
const g = await page.evaluate(() => ({
  ticks: window.__game.loop.ticks,
  fps: window.__game.loop.fps,
  children: window.__game.scene.children.length,
}));
await page.waitForTimeout(500);
const ticks2 = await page.evaluate(() => window.__game.loop.ticks);

check('no console/page errors', errors.length === 0, errors.join(' | '));
check('sim ticks advance', ticks2 > g.ticks, `${g.ticks} -> ${ticks2}`);
check('~120Hz sim over wall time', ticks2 > 120, `ticks after ~2s: ${ticks2}`);
check('scene populated', g.children >= 4, `children: ${g.children}`);
// headless renders on SwiftShader (software): assert "interactive", not 60.
// Real-hardware fps is verified at P7/P8 (AC-4.6.6), not here.
check('fps interactive under software rendering', g.fps > 15, `fps: ${g.fps.toFixed(1)}`);

// hitstop freezes sim but not render; slow-mo cannot stack (loop contract).
// Drives loop._frame() with synthetic timestamps instead of real wall-clock
// waits, so the assertion has zero dependency on actual render/frame speed
// (headless software rendering can run 150-250ms/frame with the shadow
// pass — real-time waits here would be exactly as fragile as the P1/P2
// combat-timing windows already fixed by manual stepping).
const freeze = await page.evaluate(() => {
  const { loop } = window.__game;
  loop.stop();
  const realRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = () => {};   // swallow the trailing schedule
  loop.running = true;
  loop.hitstopMs = 0; loop.slowmoMs = 0; loop._acc = 0; loop.ticks = 0;
  let t = 1000;
  loop._last = t;
  loop.hitstop(300);
  const t0 = loop.ticks;
  t += 200; loop._frame(t);          // realMs=200: hitstopMs 300->100, still frozen
  const frozen = loop.ticks === t0;
  t += 300; loop._frame(t);          // realMs=300: hitstopMs 100->-200, frozen THIS call too
  t += 50;  loop._frame(t);          // realMs=50: hitstopMs<=0 now -> sim resumes
  const resumed = loop.ticks > t0;
  const s1 = loop.slowmo(200);
  const s2 = loop.slowmo(200);       // must be rejected while active
  loop.running = false;
  window.requestAnimationFrame = realRAF;
  return { frozen, resumed, s1, s2 };
});
check('hitstop freezes sim', freeze.frozen);
check('sim resumes after hitstop', freeze.resumed);
check('slow-mo single channel', freeze.s1 === true && freeze.s2 === false);

await page.screenshot({ path: process.env.SHOT || '/tmp/p0.png' });
await browser.close();
finish();
