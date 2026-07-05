// P9 — Saiyan combat (M7 / FR-7.x): flight, ki dash, ki blasts, surge, zenkai
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();
await page.evaluate(() => { window.__game.loop.stop(); });

// ---- AC-7.1.2: flight locked before the genesis ----
const locked = await page.evaluate(() => {
  const g = window.__game;
  const tried = g.player.toggleFlight();
  return { tried, flying: g.player.flying, state: g.flow.state };
});
check('flight is locked before the rivalry is born',
  locked.tried === false && !locked.flying && locked.state === 'tutorial',
  JSON.stringify(locked));

// ---- genesis unlocks flight ----
const unlocked = await page.evaluate(() => {
  const g = window.__game;
  g.flow.goto('firstBlood');
  g.player.applyDamage(500);
  g.step(3);
  g.player.pos.set(0, 0, -17); g.player.prevPos.copy(g.player.pos);
  g.step(3);
  return { state: g.flow.state, canFly: g.player.canFly };
});
check('the first defeat awakens flight (AC-7.1.2)',
  unlocked.state === 'freeRoam' && unlocked.canFly, JSON.stringify(unlocked));

// ---- AC-7.1.1: flight — rise, ceiling clamp, landing ----
const flight = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  g.flow.enabled = false;                       // isolate mechanics from here on
  g.prompts.hide();
  g.rivalAgent.enabled = false;
  g.rival.revive({ x: 30, z: -40 });
  f.revive({ x: 0, z: -30 });
  f.canFly = true;
  f.toggleFlight();
  const took = f.flying;
  g.input.down.jump = true;                     // Space held = rise (real input:
  g.step(240);                                  // the controller owns intents)
  const height = f.pos.y;
  g.step(300);                                  // keep climbing into the clamp
  const clamped = f.pos.y;
  g.input.down.jump = false;
  f.toggleFlight();                             // cut the power
  g.step(400);
  return { took, height: +height.toFixed(1), clamped: +clamped.toFixed(1), landed: f.grounded && f.pos.y === 0 };
});
check('flight rises under Space and clamps at the ceiling',
  flight.took && flight.height > 8 && flight.clamped <= 14.01,
  JSON.stringify(flight));
check('cutting flight drops you back to the ground (gravity)', flight.landed);

// ---- AC-7.1.3: melee respects vertical reach ----
const aerial = await page.evaluate(() => {
  const g = window.__game;
  g.__hits = [];
  if (!g.__hooked9) {
    g.resolver.on(e => g.__hits.push({ type: e.type, kind: e.kind, amount: e.amount, att: e.att.name }));
    g.__hooked9 = true;
  }
  const setup = (py, ry, rFlying) => {
    g.player.revive({ x: 0, z: -30 }); g.player.canFly = true;
    g.rival.revive({ x: 0, z: -28.6 });
    g.player.flying = py > 0; g.player.pos.y = py;
    g.rival.flying = rFlying; g.rival.pos.y = ry;
    g.rig.lockTarget = g.rival;
    // what lock-on does continuously in real play: face the target NOW
    // (revive() keeps stale yaw; windup tracking alone can't swing 180°)
    g.player.yaw = g.player.yawTo(g.rival);
    g.__hits.length = 0;
  };
  // flyer vs grounded: 6m above — must whiff
  setup(6, 0, false);
  g.input.pressT.light = g.loop.simTime; g.step(60);
  const whiffed = g.__hits.filter(h => h.type === 'hit').length === 0;
  // both at altitude: must land
  setup(6, 6, true);
  g.input.pressT.light = g.loop.simTime; g.step(60);
  const landed = g.__hits.some(h => h.type === 'hit');
  return { whiffed, landed, rivalY: +g.rival.pos.y.toFixed(1) };
});
check('aerial melee: whiffs across 6m of altitude, lands at matched height (AC-7.1.3)',
  aerial.whiffed && aerial.landed, JSON.stringify(aerial));

// ---- AC-7.3.1: ki blasts — cost, cooldown, damage through the rulebook ----
const ki = await page.evaluate(() => {
  const g = window.__game;
  g.player.revive({ x: 0, z: -24 }); g.player.energy = 50;
  g.rival.revive({ x: 0, z: -34 });                     // 10m away, in the open
  g.rival.pos.y = 0; g.rival.flying = false;
  g.rig.lockTarget = g.rival;
  g.player.yaw = g.player.yawTo(g.rival);
  g.__hits.length = 0;
  const fired = g.player.fireKi();
  const cdBlocked = g.player.fireKi();                  // same tick: cooldown
  const energyAfter = g.player.energy;
  g.step(90);                                           // flight time
  const hit = g.__hits.find(h => h.type === 'hit' && h.kind === 'ki');
  return { fired, cdBlocked, energyAfter, dmg: hit ? +hit.amount.toFixed(1) : null };
});
check('ki blast: fires, costs 8, cooldown gates spam, hits for ~4',
  ki.fired && ki.cdBlocked === false && ki.energyAfter <= 42.5 && ki.dmg === 4,
  JSON.stringify(ki));

// ---- AC-7.2.1: dragon dash closes 3D distance, drains energy ----
const dash = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  f.revive({ x: 0, z: -20 }); f.canFly = true;
  f.toggleFlight(); f.pos.y = 2;
  g.rival.revive({ x: 0, z: -44 });
  g.rival.flying = true; g.rival.pos.y = 8;             // above AND far
  f.energy = 100;
  g.rig.lockTarget = g.rival;                           // controller: dashTarget = lock
  g.input.down.dash = true;                             // hold Q
  const d0 = f.pos.distanceTo(g.rival.pos);
  g.step(90);                                           // 0.75s of rushing
  const d1 = f.pos.distanceTo(g.rival.pos);
  const drained = f.energy < 95;
  g.step(120);
  const d2 = f.pos.distanceTo(g.rival.pos);
  g.input.down.dash = false;
  return { d0: +d0.toFixed(1), d1: +d1.toFixed(1), d2: +d2.toFixed(1), drained };
});
check('dragon dash: rushes the target in 3D and drains energy',
  dash.d1 < dash.d0 - 8 && dash.drained && dash.d2 <= 2.5,
  JSON.stringify(dash));

// ---- AC-7.4.1: surge — auto-transform, damage x1.25, aura ----
const surge = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  f.revive({ x: 0, z: -29 });
  g.rival.revive({ x: 0, z: -27.6 });
  g.rival.flying = false; g.rival.pos.y = 0;
  f.flying = false; f.pos.y = 0;
  f.stats.attack = 1;                                    // isolate the multiplier
  g.rig.lockTarget = g.rival;
  f.yaw = f.yawTo(g.rival);
  f.gainSurge(100);
  g.step(3);                                             // auto-transform tick
  const transformed = f.surge;
  const aura = !!f._aura?.sprite.visible;
  g.__hits.length = 0;
  g.input.pressT.light = g.loop.simTime; g.step(60);
  const hit = g.__hits.find(h => h.type === 'hit');
  return { transformed, aura, dmg: hit ? +hit.amount.toFixed(2) : null };
});
check('full surge meter auto-transforms with a golden aura',
  surge.transformed && surge.aura, JSON.stringify(surge));
check('surge multiplies damage x1.25', surge.dmg === 7.5, `dmg ${surge.dmg}`);

// ---- AC-7.4.2: pride — the outshone rival\'s meter races ----
const pride = await page.evaluate(() => {
  const g = window.__game;
  g.rival.revive({ x: 0, z: -40 });
  g.player.revive({ x: 0, z: -30 });
  g.player.surge = true;                                 // you are transformed
  g.rival.surgeMeter = 0;
  g.rivalAgent.enabled = true;
  g.step(240);                                           // 2s of burning pride
  g.rivalAgent.enabled = false;
  return { meter: +g.rival.surgeMeter.toFixed(1), transformed: g.rival.surge };
});
check('pride: outshone rival\'s surge meter races (~22/s)',
  pride.meter >= 35 || pride.transformed, JSON.stringify(pride));

// ---- rival aerial pursuit (AC-7.1 + agent) ----
const pursuit = await page.evaluate(() => {
  const g = window.__game;
  g.player.revive({ x: 0, z: -30 }); g.player.canFly = true;
  g.player.surge = false;
  g.rival.revive({ x: 3, z: -30 });
  g.player.toggleFlight();
  g.player.pos.y = 8; g.player.intent.rise = 0;
  g.rivalAgent.enabled = true;
  g.step(360);                                           // 3s
  g.rivalAgent.enabled = false;
  return { rivalFlying: g.rival.flying, rivalY: +g.rival.pos.y.toFixed(1) };
});
check('the rival takes flight and climbs after an airborne player',
  pursuit.rivalFlying && pursuit.rivalY > 3, JSON.stringify(pursuit));

// ---- AC-7.4.3: zenkai — grows every duel, more from defeat, persists ----
const zenkai = await page.evaluate(() => {
  const g = window.__game;
  const p0 = g.manager.doc.playerPower ?? 0;
  g.manager.onDuelEnd({ playerHp: 0, rivalHp: 50 });     // a defeat
  const afterLoss = g.manager.doc.playerPower;
  g.manager.onDuelEnd({ playerHp: 60, rivalHp: 0 });     // a victory
  const afterWin = g.manager.doc.playerPower;
  g.manager.applyPlayerGrowth(g.player);
  return {
    lossGain: afterLoss - p0, winGain: afterWin - afterLoss,
    atkMult: +g.player.stats.attack.toFixed(3), power: g.player.power,
  };
});
check('zenkai: +60 from defeat, +40 from victory, maps to damage',
  zenkai.lossGain === 60 && zenkai.winGain === 40 && zenkai.atkMult > 1,
  JSON.stringify(zenkai));

await page.reload();
await page.waitForFunction(() => window.__game != null, { timeout: 10000 });
const persisted = await page.evaluate(() => ({
  power: window.__game.player.power,
  canFly: window.__game.player.canFly,
  atk: +window.__game.player.stats.attack.toFixed(3),
}));
check('zenkai power and awakened flight persist across sessions',
  persisted.power >= 100 && persisted.canFly && persisted.atk > 1,
  JSON.stringify(persisted));

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p9.png' });
await browser.close();
finish();
