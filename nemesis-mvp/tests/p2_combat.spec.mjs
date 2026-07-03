// P2 — combat core vs training dummy
// FR-4.2 (attacks/chain), FR-4.3 (block/parry), FR-4.5 (combo), FR-4.6 (feel)
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

// helper: reset positions, lock on, clear traces
async function reset() {
  await page.evaluate(() => {
    const g = window.__game;
    const wipe = (f) => {
      f.state = 'idle'; f.stateT = 0; f.attackType = null; f.phase = null;
      f.combo = 0; f.comboT = 0; f.kb.set(0, 0); f.dodgeCd = 0; f.iframeT = 0;
    };
    g.player.pos.set(0, 0, -1); g.player.prevPos.copy(g.player.pos);
    g.player.yaw = 0; g.player.hp = 100; g.player.energy = 30;
    wipe(g.player);
    g.dummy.pos.set(0, 0, 0.9); g.dummy.prevPos.copy(g.dummy.pos);
    g.dummy.hp = 1000; g.dummy.maxHp = 1000;
    wipe(g.dummy);
    g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
    g.dummyBrain.mode = 'idle';
    if (g.rig.lockTarget !== g.dummy) g.rig.lockTarget = g.dummy;
    g.player.trace.length = 0; g.dummy.trace.length = 0;
    g.__hits = [];
    if (!g.__hooked) {
      g.resolver.on(e => g.__hits.push({
        type: e.type, kind: e.kind, amount: e.amount, combo: e.combo,
        att: e.att.name, def: e.def.name, t: g.loop.simTime,
      }));
      g.__hooked = true;
    }
  });
  await page.waitForTimeout(50);
}

// ---- AC-4.2.1 + AC-4.6.1: 3-hit light string via buffered presses ----
await reset();
const string = await page.evaluate(async () => {
  const g = window.__game, f = g.player;
  // mash light three times: presses land during recovery -> buffer must chain
  for (let i = 0; i < 3; i++) {
    g.input.pressT.light = g.loop.simTime;
    await new Promise(r => setTimeout(r, 320));
  }
  await new Promise(r => setTimeout(r, 700));
  return { trace: f.trace.slice(), hits: g.__hits.slice() };
});
const seq = string.trace.filter(e => e.state === 'attack' && e.phase === 'windup').map(e => e.type);
check('light string chains light1→light2→light3',
  seq.join(',') === 'light1,light2,light3', seq.join(','));
const cleanHits = string.hits.filter(h => h.type === 'hit');
check('all three string hits land', cleanHits.length === 3, `landed ${cleanHits.length}`);
// buffered chain executes with zero idle frames: light2 windup starts the
// same sim tick light1's recover ends (trace has no 'idle' between them)
const states = string.trace.map(e => e.state + ':' + (e.phase || ''));
check('no idle gap inside the string',
  !states.slice(0, -1).some((s, i) => s === 'idle:' && states[i + 1].startsWith('attack')),
  states.join(' | '));

// ---- AC-4.5.1: combo scaling math (6, 7*1.08, 10*1.16) ----
const dmgs = cleanHits.map(h => +h.amount.toFixed(2));
check('combo scaling +8%/step applied',
  Math.abs(dmgs[0] - 6) < 0.01 &&
  Math.abs(dmgs[1] - 7 * 1.08) < 0.01 &&
  Math.abs(dmgs[2] - 10 * 1.16) < 0.01,
  JSON.stringify(dmgs));

// ---- AC-4.2.2 + AC-4.3.1: heavy breaks block ----
await reset();
const blocked = await page.evaluate(async () => {
  const g = window.__game;
  g.dummyBrain.mode = 'block';
  await new Promise(r => setTimeout(r, 200));
  g.input.pressT.heavy = g.loop.simTime;
  await new Promise(r => setTimeout(r, 900));
  return { hits: g.__hits.slice(), dummyTrace: g.dummy.trace.slice() };
});
const blk = blocked.hits.find(h => h.type === 'blocked');
check('heavy vs block emits blocked+broke', !!blk && blk.kind === 'heavy',
  JSON.stringify(blocked.hits.map(h => h.type)));
check('blocked heavy deals 45%', blk && Math.abs(blk.amount - 14 * 0.45) < 0.01,
  blk && blk.amount.toFixed(2));
check('blocker staggered by heavy',
  blocked.dummyTrace.some(e => e.state === 'stagger'));

// ---- AC-4.3.1: light vs block chips 15% ----
await reset();
const lightBlocked = await page.evaluate(async () => {
  const g = window.__game;
  g.dummyBrain.mode = 'block';
  await new Promise(r => setTimeout(r, 250));   // block ages past parry window
  g.input.pressT.light = g.loop.simTime;
  await new Promise(r => setTimeout(r, 600));
  return g.__hits.filter(h => h.type === 'blocked');
});
check('blocked light deals 15%',
  lightBlocked.length === 1 && Math.abs(lightBlocked[0].amount - 6 * 0.15) < 0.01,
  JSON.stringify(lightBlocked.map(h => h.amount?.toFixed(2))));

// ---- AC-4.3.2: timed parry — deterministic manual stepping ----
// Parry is a 150ms window; wall-clock waits on software-rendered frames
// can't hit it reliably. Stop the rAF loop and step sim ticks directly.
await reset();
const parry = await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();
  const step = g.loop.step;
  const T = n => { for (let i = 0; i < n; i++) {
    g.loop.updateFn(step); g.loop.simTime += step; g.loop.ticks++;
  } };
  // player heavy (windup 330ms = ~40 ticks); dummy blocks at tick 33
  // -> block is ~7 ticks (~58ms) old at impact: inside the parry window
  g.input.pressT.heavy = g.loop.simTime;
  T(33);
  g.dummyBrain.mode = 'block';
  T(40);
  const parried = !!g.__hits.find(h => h.type === 'parried');
  const attackerStaggered = g.player.state === 'stagger';
  const hpUntouched = g.dummy.hp === 1000;
  g.dummyBrain.mode = 'idle';
  T(200);
  g.loop.start();
  return { parried, attackerStaggered, hpUntouched };
});
check('fresh block parries', parry.parried);
check('parry staggers the attacker (punish window)', parry.attackerStaggered);
check('parry negates all damage', parry.hpUntouched);

// ---- AC-4.3.2: whiffed parry attempt costs 400ms recovery ----
await reset();
const whiff = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  g.loop.stop();
  const step = g.loop.step;
  const T = n => { for (let i = 0; i < n; i++) {
    g.loop.updateFn(step); g.loop.simTime += step; g.loop.ticks++;
  } };
  g.input.down.block = true;                   // hold...
  T(7);                                        // ~58ms: inside parry window
  g.input.down.block = false;                  // ...release early
  T(1);
  const inRecover = f.state === 'parryRecover';
  T(36);                                       // ~300ms in: still recovering
  const stillRecovering = f.state === 'parryRecover';
  T(20);                                       // past 400ms: free
  const recovered = f.state === 'idle';
  g.loop.start();
  return { inRecover, stillRecovering, recovered };
});
check('early release enters parryRecover', whiff.inRecover);
check('parry whiff lasts ~400ms', whiff.inRecover && whiff.stillRecovering && whiff.recovered);

// ---- AC-4.6.2: light recovery cancels into dodge; heavy is commit-only ----
await reset();
const cancels = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  g.loop.stop();
  const step = g.loop.step;
  const T = n => { for (let i = 0; i < n; i++) {
    g.loop.updateFn(step); g.loop.simTime += step; g.loop.ticks++;
  } };
  // light: windup+active ≈ 27 ticks; press dodge inside recovery
  g.input.pressT.light = g.loop.simTime;
  T(30);
  g.input.pressT.dodge = g.loop.simTime;
  T(3);
  const dodgeCancel = f.state === 'dodge';
  T(60);                                       // dodge finishes
  // heavy: dodge press mid-windup must NOT cancel
  f.dodgeCd = 0; g.loop.hitstopMs = 0;
  g.input.pressT.heavy = g.loop.simTime;
  T(18);                                       // ~150ms into 330ms windup
  g.input.pressT.dodge = g.loop.simTime;
  T(5);
  const heavyHeld = f.state === 'attack' && f.attackType === 'heavy';
  T(120); g.loop.hitstopMs = 0;
  g.loop.start();
  return { dodgeCancel, heavyHeld };
});
check('light recovery cancels into dodge', cancels.dodgeCancel);
check('heavy windup is commit-only', cancels.heavyHeld);

// ---- AC-4.6.3: hitstop fired with data-table durations ----
await reset();
const hitstop = await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();
  g.loop.hitstopMs = 0;
  const step = g.loop.step;
  const T = n => { for (let i = 0; i < n; i++) {
    g.loop.updateFn(step); g.loop.simTime += step; g.loop.ticks++;
  } };
  g.input.pressT.light = g.loop.simTime;
  T(30);                                       // through windup+active: hit lands
  // manual stepping doesn't consume the freeze channel, so the raw value
  // set by the resolver is readable exactly
  const seen = g.loop.hitstopMs;
  const landed = g.__hits.some(h => h.type === 'hit');
  g.loop.hitstopMs = 0;
  T(60);
  g.loop.start();
  return { seen, landed };
});
check('hitstop registered on hit (=40ms light, data-driven)',
  hitstop.landed && hitstop.seen === 40, `hitstopMs ${hitstop.seen}`);

// ---- AC-4.6.5: light flinch / dummy attack staggers player on clean hit ----
await reset();
const reactions = await page.evaluate(async () => {
  const g = window.__game;
  g.dummyBrain.mode = 'attack';
  await new Promise(r => setTimeout(r, 1200));
  g.dummyBrain.mode = 'idle';
  return {
    playerFlinched: g.player.trace.some(e => e.state === 'hitstun'),
    playerHp: g.player.hp,
  };
});
check('clean hit flinches the receiver', reactions.playerFlinched && reactions.playerHp < 100,
  `hp ${reactions.playerHp}`);

// ---- death: hp<=0 -> dead state, lock drops ----
await reset();
const death = await page.evaluate(async () => {
  const g = window.__game;
  g.dummy.hp = 5; g.dummy.maxHp = 100;
  g.input.pressT.light = g.loop.simTime;
  await new Promise(r => setTimeout(r, 500));
  return { dead: !g.dummy.alive, lockDropped: g.rig.lockTarget === null };
});
check('lethal hit kills', death.dead);
check('lock-on drops on target death', death.lockDropped);

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
await page.screenshot({ path: process.env.SHOT || '/tmp/p2.png' });
await browser.close();
finish();
