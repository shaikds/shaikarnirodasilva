// P6 — the nemesis lives: macro-GOAP (Hunt/Train/Ambush) + taunt engine
// FR-3.1 (AC-3.1.1..5), FR-3.2 (AC-3.2.1..4)
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();
await page.evaluate(() => { window.__game.loop.stop(); });

// ================= TAUNT ENGINE (FR-3.1) =================

// seed the genesis memory the canonical line depends on
await page.evaluate(() => {
  const g = window.__game;
  g.manager.ledger.add('player_fled_first_duel', 'Player cowardice: Fled the initial duel.');
  g.manager.doc.emotionalState = 50;
});

// ---- AC-3.1.2: first re-encounter names the flight ----
const canonical = await page.evaluate(async () => {
  const g = window.__game;
  const line = await g.taunts.generateTaunt({ trigger: 'encounter_start' });
  return { line, key: g.taunts.lastKey };
});
check('canonical re-encounter taunt references the flight',
  canonical.key === 'canonical' && /coward|fled|spine/i.test(canonical.line),
  canonical.line);

// ---- AC-3.1.3: variety — 5 same-trigger calls, ≥3 distinct ----
const variety = await page.evaluate(async () => {
  const g = window.__game;
  const lines = [];
  for (let i = 0; i < 5; i++) lines.push(await g.taunts.generateTaunt({ trigger: 'duel_end_win' }));
  return { distinct: new Set(lines).size, lines };
});
check('taunts vary: ≥3 distinct of 5', variety.distinct >= 3, JSON.stringify(variety.lines));

// ---- AC-3.1.4: hate changes the tone (pool band) ----
const bands = await page.evaluate(async () => {
  const g = window.__game, out = [];
  for (const hate of [10, 50, 90]) {
    g.manager.doc.emotionalState = hate;
    await g.taunts.generateTaunt({ trigger: 'player_low_hp' });
    out.push(g.taunts.lastKey);
  }
  return out;
});
check('hate bands select measured/contemptuous/furious pools',
  bands[0] === 'player_low_hp:low' && bands[1] === 'player_low_hp:mid' && bands[2] === 'player_low_hp:high',
  bands.join(' , '));

// ---- memory slots always render (no raw {placeholders}) ----
const rendered = await page.evaluate(async () => {
  const g = window.__game;
  const lines = [];
  for (let i = 0; i < 8; i++) lines.push(await g.taunts.generateTaunt({ trigger: 'encounter_start' }));
  return lines.filter(l => l.includes('{'));
});
check('templates fully render (no bare placeholders)', rendered.length === 0, JSON.stringify(rendered));

// ================= MACRO-GOAP (FR-3.2) =================

// helper to make the macro state deterministic before each bias probe
async function setupMacro(opts) {
  return page.evaluate(({ hate, lastDuel, route }) => {
    const g = window.__game;
    g.flow.goto('freeRoam');
    g.macroAgent.forced = null;
    g.manager.doc.emotionalState = hate;
    if (lastDuel) g.manager.ledger.add(lastDuel, 'seeded for test');
    g.macroAgent._routeSamples = route ?? [];
    return g.macroAgent.replan();
  }, opts);
}

// ---- AC-3.2.3: biases, each demonstrable by forcing the state ----
const huntBias = await setupMacro({ hate: 95, lastDuel: 'duel_won', route: [] });
check('high hate biases HUNT', huntBias === 'Hunt', huntBias);

const trainBias = await setupMacro({ hate: 10, lastDuel: 'duel_lost', route: [] });
check('recent loss biases TRAIN', trainBias === 'Train', trainBias);

const ambushBias = await setupMacro({
  hate: 40, lastDuel: 'duel_won',
  route: ['chokeN', 'chokeN', 'chokeN', 'chokeN', 'chokeN', 'chokeN', 'openGround', 'openGround', 'arena', 'arena'],
});
check('predictable player route biases AMBUSH', ambushBias === 'Ambush', ambushBias);

// ---- debug forcing (the panel buttons drive this same API) ----
const forced = await page.evaluate(() => {
  const g = window.__game;
  g.macroAgent.force('Hunt');
  g.macroAgent.replan();
  const f = g.macroAgent.current;
  g.macroAgent.forced = null;
  return f;
});
check('force() overrides the macro goal (debug demonstrability)', forced === 'Hunt');

// ---- AC-3.2.1 Train: XP accrues while training at the base ----
const train = await page.evaluate(() => {
  const g = window.__game;
  g.flow.goto('freeRoam');
  g.macroAgent.force('Train');
  const base = g.zone.locations.rivalBase;
  g.rival.revive({ x: base.x, z: base.z });
  g.player.pos.set(0, 0, 10); g.player.prevPos.copy(g.player.pos);   // far away
  const xp0 = g.manager.doc.xp;
  g.step(600);                                       // 5s of training
  g.macroAgent.forced = null;
  return { gained: g.manager.doc.xp - xp0, goal: g.macroAgent.current };
});
check('Train accrues XP at the base (~2/s)', train.gained > 7 && train.gained < 14,
  `+${train.gained.toFixed(1)} xp while ${train.goal}`);

// ---- AC-3.2.4 Hunt tell: the rival closes distance toward the player ----
const hunt = await page.evaluate(() => {
  const g = window.__game;
  g.flow.goto('freeRoam');
  g.macroAgent.force('Hunt');
  const base = g.zone.locations.rivalBase;
  g.rival.revive({ x: base.x, z: base.z });
  g.player.pos.set(0, 0, -30); g.player.prevPos.copy(g.player.pos);  // open ground
  const d0 = g.rival.distanceTo(g.player);
  g.step(360);                                       // 3s of hunting
  const d1 = g.rival.distanceTo(g.player);
  g.macroAgent.forced = null;
  return { d0: +d0.toFixed(1), d1: +d1.toFixed(1), state: g.flow.state };
});
check('Hunt closes on the player', hunt.d1 < hunt.d0 - 5, JSON.stringify(hunt));

// ---- Ambush: set at the chokepoint, springs with first-strike bonus ----
const ambush = await page.evaluate(() => {
  const g = window.__game;
  g.flow.goto('freeRoam');
  g.macroAgent.force('Ambush');
  g.macroAgent.armed = false;
  const choke = g.zone.locations.chokepoint;
  g.rival.revive({ x: choke.x, z: choke.z + 10 });   // short walk to position
  g.player.pos.set(0, 0, 10); g.player.prevPos.copy(g.player.pos);
  g.player.hp = 100; g.player.state = 'idle';
  let waited = 0;
  while (!g.macroAgent.armed && waited < 3000) { g.step(30); waited += 30; }
  const armed = g.macroAgent.armed;
  // it lies in wait at the corridor MOUTH (the chokeN waypoint), not mid-corridor
  const [nx, nz] = g.nav.nodes.chokeN;
  const rivalStill = { x: g.rival.pos.x, z: g.rival.pos.z };
  // the player wanders into the trap; sample energy AT the spring tick —
  // the rival can now spend the bonus within milliseconds (ki, dash)
  g.player.pos.set(g.rival.pos.x + 3, 0, g.rival.pos.z + 3);
  g.player.prevPos.copy(g.player.pos);
  let energyAtSpring = null;
  for (let i = 0; i < 240 && energyAtSpring == null; i++) {
    g.step(1);
    if (g.flow.state === 'encounter') energyAtSpring = g.rival.energy;
  }
  g.step(10);
  g.macroAgent.forced = null;
  return {
    armed,
    nearChoke: Math.hypot(rivalStill.x - nx, rivalStill.z - nz) < 4,
    state: g.flow.state,
    sprung: g.manager.ledger.has('ambush_sprung'),
    // >=90 at the spring tick: the grant fired (baseline after the walk +
    // wait sits far lower); allows one same-tick ki blast
    firstStrike: energyAtSpring != null && energyAtSpring >= 90,
    playerJumped: g.player.trace.some(e => e.state === 'stagger'),
  };
});
check('Ambush arms at the chokepoint and waits', ambush.armed && ambush.nearChoke,
  JSON.stringify(ambush));
check('sprung ambush: encounter + ledger + first-strike energy',
  ambush.state === 'encounter' && ambush.sprung && ambush.firstStrike && ambush.playerJumped,
  JSON.stringify(ambush));

// subtitle is set in a microtask (async taunt backend) — read it in a fresh
// evaluate so the queue has flushed
const subtitle = await page.evaluate(() =>
  document.querySelector('#subtitles .line')?.textContent ?? '');
check('rival speaks on the ambush/encounter (subtitle shown)', subtitle.length > 4, subtitle);

// ---- AC-3.2.4: macro goal visible in the debug panel ----
const dbg = await page.evaluate(() => {
  const g = window.__game;
  g.flow.goto('freeRoam');
  g.macroAgent.replan();
  g.debugPanel.toggle();
  g.debugPanel.render();
  const txt = document.getElementById('debug').textContent;
  g.debugPanel.toggle();
  return { shows: txt.includes(`macro goal: ${g.macroAgent.current}`), goal: g.macroAgent.current };
});
check('debug panel shows the live macro goal', dbg.shows, JSON.stringify(dbg));

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p6.png' });
await browser.close();
finish();
