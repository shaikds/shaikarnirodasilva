// P3 — the rival fights: profile mirroring, sync engine, micro-GOAP, special
// FR-3.3 (AC-3.3.2/3.3.4), FR-3.4 (AC-3.4.4), FR-4.4, S-3 first band run.
// All duels run on deterministic manual stepping (loop stopped).
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

// install duel harness in the page
await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();
  g.__resetDuel = (playerPos = [0, 0, 4], rivalPos = [0, 0, -4]) => {
    for (const [f, pos] of [[g.player, playerPos], [g.rival, rivalPos]]) {
      f.pos.set(...pos); f.prevPos.copy(f.pos);
      f.hp = f.maxHp = 100; f.energy = 30;
      f.state = 'idle'; f.stateT = 0; f.attackType = null; f.phase = null;
      f.combo = 0; f.comboT = 0; f.kb.set(0, 0); f.dodgeCd = 0; f.iframeT = 0;
      f.deadT = 0;
    }
    g.dummy.pos.set(15, 0, 15); g.dummy.prevPos.copy(g.dummy.pos);   // out of the way
    g.dummy.hp = 100;
    g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
    g.rivalAgent.enabled = true;
    g.rivalAgent.currentPlan = []; g.rivalAgent.currentAction = null;
    g.rivalAgent.replanT = 0; g.rivalAgent.plannedDefense = null;
    g.projectiles.list.forEach(p => g.scene.remove(p.mesh));
    g.projectiles.list.length = 0;
  };
  // run one duel to the death (or tick cap); returns outcome
  g.__duel = (botStyle, maxTicks = 14400) => {           // 120s sim cap
    g.setPlayerDriver(botStyle);
    g.__resetDuel();
    let t = 0;
    while (t < maxTicks && g.player.alive && g.rival.alive) { g.step(30); t += 30; }
    const pHp = Math.max(0, g.player.hp), rHp = Math.max(0, g.rival.hp);
    const playerWon = g.sync.roundEnd(pHp, rHp);
    return { playerWon, pHp: +pHp.toFixed(1), rHp: +rHp.toFixed(1), ticks: t, rating: +g.sync.rating.toFixed(0) };
  };
});

// ---- GOAP planner sanity (import the module directly in-page) ----
const goap = await page.evaluate(async () => {
  const { plan } = await import('./src/ai/goap.js');
  const actions = [
    { name: 'open', pre: s => !s.open, effect: s => { s.open = true; }, cost: () => 1 },
    { name: 'enter', pre: s => s.open, effect: s => { s.inside = true; }, cost: () => 1 },
  ];
  const goal = { satisfied: s => s.inside };
  const ok = plan({ open: false, inside: false }, goal, actions, { maxDepth: 3 });
  const tooShallow = plan({ open: false, inside: false }, goal, actions, { maxDepth: 1 });
  return { ok, tooShallow };
});
check('GOAP plans multi-step chains', goap.ok && goap.ok.join(',') === 'open,enter',
  JSON.stringify(goap.ok));
check('GOAP respects plan depth (weak nemesis thinks short)', goap.tooShallow === null);

// ---- AC-3.3.4: skill scaling endpoints ----
const skill = await page.evaluate(() => {
  const g = window.__game;
  const r0 = g.sync.rating;
  g.sync.rating = 700; const lo = g.sync.skill;
  g.sync.rating = 1400; const hi = g.sync.skill;
  g.sync.rating = r0;
  return { lo, hi };
});
check('sync skill maps 700→0.05, 1400→1.0', skill.lo === 0.05 && skill.hi === 1);

// ---- FR-4.4: special projectile — clean hit for 18, blocked for 9 ----
const special = await page.evaluate(() => {
  const g = window.__game, out = {};
  g.setPlayerDriver('human');                 // inert without keys
  g.__resetDuel([0, 0, 5], [0, 0, -3]);
  g.rivalAgent.enabled = false;               // scripted shot, no brain
  g.rival.intent.face = g.rival.yawTo(g.player);
  g.rival.energy = 100;
  g.rival.startAttack('special');
  g.step(200);                                // windup + flight
  out.cleanDmg = +(100 - g.player.hp).toFixed(1);
  // blocked: same shot into a held block (aged past parry window)
  g.__resetDuel([0, 0, 5], [0, 0, -3]);
  g.rivalAgent.enabled = false;
  g.input.down.block = true;
  g.step(30);                                 // block comes up and ages
  g.rival.energy = 100;
  g.rival.intent.face = g.rival.yawTo(g.player);
  g.rival.startAttack('special');
  g.step(200);
  g.input.down.block = false;
  out.blockedDmg = +(100 - g.player.hp).toFixed(1);
  out.energyAfter = g.rival.energy < 60;      // cost paid
  g.step(10);
  return out;
});
check('special hits clean for 18', special.cleanDmg === 18, `dmg ${special.cleanDmg}`);
check('blocked special deals 50%', special.blockedDmg === 9, `dmg ${special.blockedDmg}`);
check('special costs energy', special.energyAfter);

// ---- AC-3.4.4: BreakGuard vs turtle — heavy first ≥70% while blocking ----
const breakGuard = await page.evaluate(() => {
  const g = window.__game;
  const counts = { heavy: 0, light: 0 };
  g.rival.onAction = a => {
    if ((a === 'heavy' || a === 'light') && g.player.blocking) counts[a]++;
  };
  g.__duel('turtle');
  g.__duel('turtle');
  g.rival.onAction = null;
  const goalSeen = g.rivalAgent.currentGoal?.name;   // last goal, for the log
  return { counts, goalSeen };
});
const bgTotal = breakGuard.counts.heavy + breakGuard.counts.light;
check('BreakGuard: ≥70% heavies vs a blocking player',
  bgTotal >= 5 && breakGuard.counts.heavy / bgTotal >= 0.7,
  `heavy ${breakGuard.counts.heavy} / light ${breakGuard.counts.light}`);

// ---- AC-3.3.2 (a): LEARNING — 3 heavy-only duels fill the profile ----
const learning = await page.evaluate(() => {
  const g = window.__game;
  const fresh = new g.profile.constructor();
  Object.assign(g.profile, fresh.toJSON());
  g.profiler.enabled = true;
  for (let i = 0; i < 3; i++) g.__duel('heavyOnly');
  return { heavyPref: +g.profile.heavyPref.toFixed(2), attacks: g.profile.attacks };
});
check('learning: profile heavyPref ≥0.8 after 3 heavy-only duels',
  learning.heavyPref >= 0.8 && learning.attacks > 10,
  `heavyPref ${learning.heavyPref} over ${learning.attacks} attacks`);

// ---- AC-3.3.2 (b): MIRRORING — profile drives behavior ≥20pt shift ----
// profiler frozen so the measured duels don't overwrite the forced profile
const mirror = await page.evaluate(() => {
  const g = window.__game;
  g.profiler.enabled = false;
  const share = () => {
    const c = { heavy: 0, light: 0 };
    g.rival.onAction = a => { if (a === 'heavy' || a === 'light') c[a]++; };
    g.__duel('aggressive');
    g.rival.onAction = null;
    const t = c.heavy + c.light;
    return t ? c.heavy / t : 0;
  };
  const force = (lights, heavies) => {
    const fresh = new g.profile.constructor();
    Object.assign(g.profile, fresh.toJSON(), { lights, heavies, attacks: lights + heavies });
  };
  force(100, 0);  const lightStyle = share();
  force(0, 100);  const heavyStyle = share();
  g.profiler.enabled = true;
  return { lightStyle: +lightStyle.toFixed(2), heavyStyle: +heavyStyle.toFixed(2) };
});
check('mirroring: forced heavy profile shifts rival ≥20pts vs light profile',
  mirror.heavyStyle - mirror.lightStyle >= 0.2,
  `light-profile share ${mirror.lightStyle} -> heavy-profile share ${mirror.heavyStyle}`);

// ---- S-3 band: 10 duels vs aggressive bot — neither side >70% ----
const band = await page.evaluate(() => {
  const g = window.__game;
  const fresh = new g.profile.constructor();
  Object.assign(g.profile, fresh.toJSON());
  g.sync.rating = 1000; g.sync.wins = 0; g.sync.losses = 0;
  const results = [];
  for (let i = 0; i < 10; i++) results.push(g.__duel('aggressive'));
  return { wins: g.sync.wins, losses: g.sync.losses, results };
});
console.log('  band detail:', JSON.stringify(band.results.map(r => `${r.playerWon ? 'P' : 'R'} ${r.pHp}:${r.rHp} @${r.rating}`)));
check('S-3 band: player wins between 3 and 7 of 10',
  band.wins >= 3 && band.wins <= 7, `player ${band.wins} : rival ${band.losses}`);

// ---- goal exposure for HUD/debug (AC-3.4.5) ----
const goalExposed = await page.evaluate(() => {
  const g = window.__game;
  return g.rivalAgent.currentGoal != null && typeof g.rivalAgent.currentGoal.hud === 'string';
});
check('current micro goal exposed with HUD label', goalExposed);

await page.evaluate(() => { window.__game.setPlayerDriver('human'); window.__game.loop.start(); });
check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p3.png' });
await browser.close();
finish();
