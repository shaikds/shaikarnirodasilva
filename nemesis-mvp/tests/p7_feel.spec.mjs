// P7 — feel pass hardware-independent parts: NFR-5 degraded mode,
// AC-3.4.5 goal hint. (True 60fps verification is AC-4.6.6 on the
// developer's hardware — headless renders in software by design.)
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

// ---- NFR-5: sustained low fps auto-engages degraded mode ----
// headless software rendering IS the low-fps environment — just wait
const degraded = await page.evaluate(async () => {
  const g = window.__game;
  const before = { density: g.vfx.density, shadows: g.renderer.shadowMap.enabled };
  // fps EMA needs ~3s to decay below the threshold, then 3s sustained-low:
  // wait comfortably past both
  await new Promise(r => setTimeout(r, 9000));
  return {
    before,
    engaged: g.degrade.engaged,
    density: g.vfx.density,
    shadows: g.renderer.shadowMap.enabled,
    fps: +g.loop.fps.toFixed(1),
  };
});
check('degraded mode auto-engages under sustained low fps',
  degraded.before.shadows === true && degraded.engaged &&
  degraded.density === 0.5 && degraded.shadows === false,
  JSON.stringify(degraded));

// ---- degrade.auto=false is respected (capture scripts rely on it) ----
await page.reload();
await page.waitForFunction(() => window.__game != null, { timeout: 10000 });
const pinned = await page.evaluate(async () => {
  const g = window.__game;
  g.degrade.auto = false;
  await new Promise(r => setTimeout(r, 4500));
  return { engaged: g.degrade.engaged, shadows: g.renderer.shadowMap.enabled };
});
check('degrade.auto=false pins full quality', !pinned.engaged && pinned.shadows,
  JSON.stringify(pinned));

// ---- AC-3.4.5: micro-goal HUD hint during combat, toggleable ----
const hint = await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();
  g.flow.enabled = false;
  g.prompts.hide();
  g.rivalAgent.enabled = true;
  g.player.pos.set(0, 0, 2); g.player.prevPos.copy(g.player.pos);
  g.rival.revive({ x: 0, z: -2 });
  g.player.revive({ x: 0, z: 2 });
  g.step(60);                                  // agent plans a goal
  // render pass updates the DOM hint
  g.loop.renderFn(0);
  const shown = document.querySelector('#hud .goalhint').textContent;
  g.hud.goalHintEnabled = false;
  g.loop.renderFn(0);
  const hidden = document.querySelector('#hud .goalhint').textContent;
  g.hud.goalHintEnabled = true;
  g.loop.start();
  return { shown, hidden, goal: g.rivalAgent.currentGoal?.name };
});
check('goal hint shows the nemesis intent during combat',
  hint.shown.startsWith('NEMESIS:') && hint.shown.length > 9,
  JSON.stringify(hint));
check('goal hint is toggleable', hint.hidden === '', JSON.stringify(hint));

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await browser.close();
finish();
