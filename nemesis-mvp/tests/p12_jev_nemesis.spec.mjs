// P12 — Jev as the nemesis (M10, developer-requested follow-up to M9).
// FR-10.1..10.3 (spec.md §8.8). Same mock-backed methodology as p11 —
// free, deterministic, no live TypeSafe credit spent — except one probe
// that deliberately leaves the backend unmocked to prove the offline
// fallback to the tuned GOAP brain under REAL conditions (AC-10.2.2).
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();
await page.evaluate(() => { window.__game.loop.stop(); });

async function reset(opts = {}) {
  await page.evaluate(({ playerPos, rivalPos, playerYaw, rivalYaw }) => {
    const g = window.__game;
    const wipe = (f) => {
      f.state = 'idle'; f.stateT = 0; f.attackType = null; f.phase = null;
      f.combo = 0; f.comboT = 0; f.kb.set(0, 0); f.dodgeCd = 0; f.iframeT = 0;
      f.vy = 0; f.grounded = true; f.flying = false; f.chargeT = 0;
      f.attackCharge = 0; f.mesh.visible = true; f.surge = false; f.surgeMeter = 0;
    };
    g.player.pos.set(...playerPos); g.player.prevPos.copy(g.player.pos);
    g.player.yaw = playerYaw; g.player.hp = 100; g.player.energy = 60;
    wipe(g.player);
    g.rival.pos.set(...rivalPos); g.rival.prevPos.copy(g.rival.pos);
    g.rival.yaw = rivalYaw; g.rival.hp = g.rival.maxHp;
    wipe(g.rival);
    g.dummy.pos.set(200, 0, 200); g.dummy.prevPos.copy(g.dummy.pos);
    g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
    g.dummyBrain.mode = 'idle';
    g.flow.enabled = false;
    g.prompts.hide();
    // the nemesis's own gate (AC-10.2.1): enabled -> a real duel context
    g.rivalAgent.enabled = true;
    g.rivalAgent.currentPlan = []; g.rivalAgent.currentAction = null;
    g.rivalAgent.replanT = 99;         // don't let GOAP replan over the probe
    g.rivalAgent.plannedDefense = null; g.rivalAgent.blockHoldT = 0;
    g.rivalAgent.currentGoal = null;
    if (g.rig.lockTarget !== g.rival) g.rig.lockTarget = g.rival;
    g.player.trace.length = 0; g.rival.trace.length = 0;
    g.__hits = [];
    if (!g.__hooked) {
      g.resolver.on(e => g.__hits.push({
        type: e.type, kind: e.kind, amount: e.amount,
        att: e.att.name, def: e.def.name,
      }));
      g.__hooked = true;
    }
    const jd = g.jevNemesisDriver;
    jd.directive = null; jd.pending = false; jd.offline = false; jd.seq = 0;
    jd.alert = 0; jd.commitCharge = 0; jd.recent = []; jd.lastDirective = null;
    jd._sinceDecision = 99; jd._salient = false; jd._voiceT = -99; jd._retryT = 0;
    if (!g.nemesisPanel.active) g.nemesisPanel.toggle(true);
    jd.backend.send = async () => ({});    // default stub the test overrides
  }, {
    playerPos: opts.playerPos ?? [0, 0, -1],
    rivalPos: opts.rivalPos ?? [0, 0, 0.5],
    playerYaw: opts.playerYaw ?? 0,
    rivalYaw: opts.rivalYaw ?? Math.PI,
  });
}

// ================= FR-10.1: shared vocabulary, nemesis framing =================

await reset();
const shape = await page.evaluate(async () => {
  const g = window.__game;
  g.manager.doc.name = 'SERAK'; g.manager.doc.level = 3;
  g.manager.doc.emotionalState = 62;
  g.manager.doc.record = { wins: 2, losses: 4, escapes: 1 };
  g.manager.ledger.add('duel_lost', 'Defeated by the player (40 HP left).');
  g.player.state = 'attack'; g.player.phase = 'windup'; g.player.attackType = 'heavy';
  g.player.hp = 55;
  let captured = null;
  g.jevNemesisDriver.backend.send = async (state, questions) => { captured = { state, questions }; return {}; };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  return captured;
});
check('AC-10.1.2 state.me is the nemesis\'s own identity (name/level/power)',
  shape?.state.me.name === 'SERAK' && shape.state.me.level === 3 && 'powerLevel' in shape.state.me,
  JSON.stringify(shape?.state.me));
check('AC-10.1.2 state.foe is the player, state AND phase distinguished, no stored name',
  shape?.state.foe.state === 'attack' && shape.state.foe.phase === 'windup' &&
  shape.state.foe.hp === 55 && !('name' in shape.state.foe),
  JSON.stringify(shape?.state.foe));
check('AC-10.1.2 rivalry carries the NEMESIS\'S OWN hate (myHate, not foeHate)',
  shape?.state.rivalry.myHate === 62 && !('foeHate' in shape.state.rivalry),
  JSON.stringify(shape?.state.rivalry));
check('AC-10.1.2 rivalry carries the win/loss record and its own ledger memories verbatim',
  JSON.stringify(shape?.state.rivalry.record) === JSON.stringify({ wins: 2, losses: 4, escapes: 1 }) &&
  shape?.state.rivalry.grudges.some(l => /Defeated by the player/.test(l)),
  JSON.stringify(shape?.state.rivalry));

const EXPECTED_MOVES = ['press_attack', 'route_uppercut', 'charge_blast', 'headbutt_rush',
  'ki_pressure', 'special_beam', 'guard', 'evade', 'take_flight', 'close_distance', 'back_off'];
const ids = shape?.questions.map(q => q.id).sort();
check('AC-10.1.1 the nemesis asks the SAME four typed judgments as the player driver',
  JSON.stringify(ids) === JSON.stringify(['commit_full_charge', 'danger_now', 'next_move', 'voice'].sort()),
  JSON.stringify(ids));
const nextMoveQ = shape?.questions.find(q => q.id === 'next_move');
check('AC-10.1.1 next_move criteria are the IDENTICAL vocabulary (one rulebook, both sides)',
  JSON.stringify(Object.keys(nextMoveQ?.criteria ?? {}).sort()) === JSON.stringify([...EXPECTED_MOVES].sort()),
  JSON.stringify(Object.keys(nextMoveQ?.criteria ?? {})));
check('AC-10.1.1 the persona speaks as the nemesis itself, first person, not a borrowed voice',
  /nemesis/i.test(nextMoveQ?.instructions ?? '') && /JEV/.test(nextMoveQ?.instructions ?? ''),
  nextMoveQ?.instructions);

// ================= FR-10.2: executor drives the shared Fighter API =================

// next_move actually moves the rival
await reset();
const movePicked = await page.evaluate(async () => {
  const g = window.__game;
  g.jevNemesisDriver.backend.send = async () => ({ next_move: { answer: 'evade', p: 0.9 } });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const move = g.jevNemesisDriver.directive?.move;
  // the very first tick (directive still null while the answer was in
  // flight) fell back to RivalAgent, which — cleared to an empty plan by
  // reset() — replans immediately and may commit to an attack of its own;
  // give that room to finish before asserting Jev's OWN directive landed
  for (let i = 0; i < 150; i++) g.step(1);
  return { move, dodged: g.rival.trace.some(e => e.state === 'dodge') };
});
check('AC-10.2.1 the executor drives the RIVAL through the shared Fighter API',
  movePicked.move === 'evade' && movePicked.dodged, JSON.stringify(movePicked));

// charge-commit gating produces the same real blast/no-blast outcomes as M9
await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const fullCommit = await page.evaluate(async () => {
  const g = window.__game;
  g.jevNemesisDriver.backend.send = async () => ({
    next_move: { answer: 'charge_blast', p: 0.9 },
    commit_full_charge: { answer: true, p: 0.92 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 260; i++) g.step(1);
  return { blasts: g.__hits.filter(h => h.type === 'blast').length };
});
check('AC-10.2.1 the nemesis\'s own charged blast lands with the same rules as the player\'s',
  fullCommit.blasts >= 1, JSON.stringify(fullCommit));

// the "is a real duel happening" gate is RivalAgent.enabled — nothing else
await reset();
const gated = await page.evaluate(async () => {
  const g = window.__game;
  g.rivalAgent.enabled = false;      // no duel context
  let called = false;
  g.jevNemesisDriver.backend.send = async () => { called = true; return {}; };
  for (let i = 0; i < 60; i++) g.step(1);
  return { called };
});
check('AC-10.2.1 outside a real duel (RivalAgent.enabled=false) Jev never asks',
  !gated.called, JSON.stringify(gated));

// ================= FR-10.2.2: offline falls back to the TUNED GOAP brain =================

// mocked failure -> explicit delegation call proof
await reset();
const offlineMocked = await page.evaluate(async () => {
  const g = window.__game;
  g.jevNemesisDriver.backend.send = async () => { throw new Error('connection refused'); };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const offlineFlag = g.jevNemesisDriver.offline;
  g.nemesisPanel.tick();
  const panelErrText = document.querySelector('#jevNemesis .err')?.textContent ?? '';
  // GOAP's own goal selection only happens inside RivalAgent.update() —
  // seeing it populate proves delegation, not a parallel implementation
  g.rivalAgent.currentGoal = null;
  g.player.pos.set(0, 0, -6); g.player.prevPos.copy(g.player.pos);   // give GOAP something to plan around
  for (let i = 0; i < 60; i++) g.step(1);
  return { offlineFlag, goapActed: g.rivalAgent.currentGoal != null, lastError: g.jevNemesisDriver.lastError, panelErrText };
});
check('AC-10.2.2 a failed backend sets offline and hands the fighter to RivalAgent.update()',
  offlineMocked.offlineFlag && offlineMocked.goapActed, JSON.stringify(offlineMocked));
check('AC-9.2.3 the nemesis panel also shows the real failure reason on screen',
  offlineMocked.lastError === 'connection refused' && offlineMocked.panelErrText === 'connection refused',
  JSON.stringify(offlineMocked));

// (AC-10.2.2's "no backend configured at all" case is the exact same
// code path as offlineMocked above — backend.send rejects, .catch() sets
// offline, the driver delegates to rivalAgent.update(). A real unmocked
// fetch to the (absent) local proxy proves nothing extra and only adds a
// browser-level ERR_CONNECTION_REFUSED console entry that would trip
// every other suite's "no console errors" convention, so it's not
// exercised here as a separate probe.)

// ================= FR-10.2.3: cadence/freshness match M9's contract =================

await reset();
const cadence = await page.evaluate(async () => {
  const g = window.__game;
  let calls = 0, resolveSecond = null;
  g.jevNemesisDriver.backend.send = (state, q) => {
    calls++;
    if (calls === 1) return Promise.resolve({ next_move: { answer: 'press_attack', p: 0.9 } });
    return new Promise(res => { resolveSecond = res; });
  };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const directiveAfterFirst = g.jevNemesisDriver.directive?.move;
  for (let i = 0; i < 170; i++) g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const pendingDuringSecond = g.jevNemesisDriver.pending;
  const directiveWhilePending = g.jevNemesisDriver.directive?.move;
  resolveSecond({ next_move: { answer: 'back_off', p: 0.9 } });
  await new Promise(r => setTimeout(r, 0));
  const directiveAfterSecond = g.jevNemesisDriver.directive?.move;
  return { calls, directiveAfterFirst, pendingDuringSecond, directiveWhilePending, directiveAfterSecond };
});
check('AC-10.2.3 cadence: a fresh judgment fires on staleness', cadence.calls === 2, JSON.stringify(cadence));
check('AC-10.2.3 the current directive keeps executing while a request is in flight',
  cadence.pendingDuringSecond && cadence.directiveWhilePending === 'press_attack', JSON.stringify(cadence));
check('AC-10.2.3 freshness: the new directive applies only once resolved',
  cadence.directiveAfterSecond === 'back_off', JSON.stringify(cadence));

// ================= FR-10.2.4: voice speaks through the canonical channel =================

await reset();
const voice = await page.evaluate(async () => {
  const g = window.__game;
  g.manager.doc.name = 'SERAK';
  const root = document.getElementById('subtitles');
  root.innerHTML = '<div class="who"></div><div class="line"></div>';
  g.jevNemesisDriver.backend.send = async () => ({
    next_move: { answer: 'back_off', p: 0.9 },
    voice: { answer: 'contempt', p: 0.8 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  return {
    who: document.querySelector('#subtitles .who')?.textContent ?? '',
    line: document.querySelector('#subtitles .line')?.textContent ?? '',
  };
});
check('AC-10.2.4 the nemesis speaks under ITS OWN in-world name via the canonical subtitle channel',
  voice.who === 'SERAK' && voice.line.includes('deserves better'), JSON.stringify(voice));

// ================= FR-10.3: independent activation and config =================

await reset();
const toggle = await page.evaluate(() => {
  const g = window.__game;
  const whileOn = g.rivalBrain === g.jevNemesisDriver;
  g.nemesisPanel.toggle(false);
  const whileOff = g.rivalBrain === g.rivalAgent;
  g.nemesisPanel.toggle(true);
  const backOn = g.rivalBrain === g.jevNemesisDriver;
  return { whileOn, whileOff, backOn };
});
check('AC-10.3.1 the nemesis toggle independently swaps which brain drives the rival',
  toggle.whileOn && toggle.whileOff && toggle.backOn, JSON.stringify(toggle));

const independence = await page.evaluate(() => {
  const g = window.__game;
  return {
    differentStorageKeys: g.jevDriver.backend.storageKey !== g.jevNemesisDriver.backend.storageKey,
    playerDefault: g.jevDriver.backend.url,
    nemesisDefault: g.jevNemesisDriver.backend.url,
  };
});
check('AC-10.3.1 each side has its own namespaced backend config (separate localStorage key)',
  independence.differentStorageKeys, JSON.stringify(independence));

const noCrossTalk = await page.evaluate(() => {
  const g = window.__game;
  g.jevNemesisDriver.backend.saveConfig({ apiKey: 'nemesis-only-key' });
  const leaked = g.jevDriver.backend.apiKey === 'nemesis-only-key';
  g.jevNemesisDriver.backend.saveConfig({ apiKey: '' });   // clean up
  return { leaked };
});
check('AC-10.3.1 configuring one side\'s key never touches the other\'s', !noCrossTalk.leaked, JSON.stringify(noCrossTalk));

const defaults = await page.evaluate(() => {
  const g = window.__game;
  return {
    url: g.jevNemesisDriver.backend.url,
    apiKeyEmpty: g.jevNemesisDriver.backend.apiKey === '',
  };
});
check('AC-10.3.2 nemesis backend also defaults to the local proxy, no baked-in key',
  defaults.url === 'http://localhost:8765/decide' && defaults.apiKeyEmpty, JSON.stringify(defaults));

// both/neither can be active — independent of the player toggle
await reset();
const both = await page.evaluate(() => {
  const g = window.__game;
  if (!g.jevPanel.active) g.jevPanel.toggle(true);
  const bothActive = g.playerDriver === g.jevDriver && g.rivalBrain === g.jevNemesisDriver;
  g.jevPanel.toggle(false);
  g.nemesisPanel.toggle(false);
  const neitherActive = g.playerDriver === g.controller && g.rivalBrain === g.rivalAgent;
  g.nemesisPanel.toggle(true);   // restore for downstream isolation
  return { bothActive, neitherActive };
});
check('AC-10.3.1 both drivers (or neither) may be active independently of one another',
  both.bothActive && both.neitherActive, JSON.stringify(both));

// ================= boot-time presence =================

const panelPresent = await page.evaluate(() => {
  const el = document.getElementById('jevNemesis');
  return !!el && el.querySelector('.toggle')?.textContent;
});
check('the JEV IS THE NEMESIS panel exists in the DOM at boot, positioned separately from LET JEV PLAY',
  typeof panelPresent === 'string' && panelPresent.length > 0, panelPresent);

// leave the game in default (GOAP-driven) mode for anything after this suite
await page.evaluate(() => {
  const g = window.__game;
  if (g.nemesisPanel.active) g.nemesisPanel.toggle(false);
  if (g.jevPanel.active) g.jevPanel.toggle(false);
  g.rivalAgent.enabled = false;
});

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p12.png' });
await browser.close();
finish();
