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

// hitstop freezes sim but not render; slow-mo cannot stack (loop contract)
const freeze = await page.evaluate(async () => {
  const { loop } = window.__game;
  loop.hitstop(300);
  const t0 = loop.ticks;
  await new Promise(r => setTimeout(r, 200));
  const frozen = loop.ticks === t0;
  await new Promise(r => setTimeout(r, 300));
  const resumed = loop.ticks > t0;
  const s1 = loop.slowmo(200);
  const s2 = loop.slowmo(200);   // must be rejected while active
  return { frozen, resumed, s1, s2 };
});
check('hitstop freezes sim', freeze.frozen);
check('sim resumes after hitstop', freeze.resumed);
check('slow-mo single channel', freeze.s1 === true && freeze.s2 === false);

await page.screenshot({ path: process.env.SHOT || '/tmp/p0.png' });
await browser.close();
finish();
