// P11 — Jev (TypeSafe System One) plays the player. FR-9.1..9.3
// (spec.md §8.7). All probes hit a mocked JevBackend — free, deterministic,
// no live TypeSafe credit spent — except the one wire-contract test, which
// mocks `fetch` itself to verify the actual HTTP body shape.
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();
await page.evaluate(() => { window.__game.loop.stop(); });


// standard isolation (see p2/p10): flow off, dummy/rival quiescent,
// rival stands in for the "foe" Jev fights, driver reset to a clean slate
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
    g.rivalAgent.enabled = false;
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
    // clean Jev driver state; put it in control (AC-9.2.4)
    const jd = g.jevDriver;
    jd.directive = null; jd.pending = false; jd.offline = false; jd.seq = 0;
    jd.alert = 0; jd.commitCharge = 0; jd.recent = []; jd.lastDirective = null;
    jd.lastTauntHeard = null; jd._sinceDecision = 99; jd._salient = false;
    jd._voiceT = -99; jd._retryT = 0;
    if (!g.jevPanel.active) g.jevPanel.toggle(true);
    // default backend: a stub the test overrides per-probe
    jd.backend.send = async () => ({});
  }, {
    playerPos: opts.playerPos ?? [0, 0, -1],
    rivalPos: opts.rivalPos ?? [0, 0, 0.5],
    playerYaw: opts.playerYaw ?? 0,
    rivalYaw: opts.rivalYaw ?? Math.PI,
  });
}

// ================= FR-9.3: credential safety + wire contract =================

const defaults = await page.evaluate(() => {
  const g = window.__game;
  return {
    url: g.jevDriver.backend.url,
    apiKeyEmpty: g.jevDriver.backend.apiKey === '',
  };
});
check('AC-9.3.1 default endpoint is the local key-holding proxy',
  defaults.url === 'http://localhost:8765/decide', JSON.stringify(defaults));
check('AC-9.3.1 no API key baked in by default (localStorage/panel only)',
  defaults.apiKeyEmpty, JSON.stringify(defaults));

const wireNoKey = await page.evaluate(async () => {
  const g = window.__game;
  const orig = window.fetch;
  let captured = null;
  window.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers || {} };
    return { ok: true, json: async () => ({ answers: {} }) };
  };
  g.jevDriver.backend.url = 'http://localhost:8765/decide';
  g.jevDriver.backend.apiKey = '';
  await g.jevDriver.backend.send({ foo: 1 }, [{ id: 'x' }]);
  window.fetch = orig;
  return captured;
});
check('AC-9.1.3 the wire body carries `state` and `questions` as separate top-level fields',
  wireNoKey && 'state' in wireNoKey.body && 'questions' in wireNoKey.body &&
  wireNoKey.body.state.foo === 1 && Array.isArray(wireNoKey.body.questions) && !!wireNoKey.body.model,
  JSON.stringify(wireNoKey));
check('proxy path: no Authorization header when no key is configured',
  !('authorization' in wireNoKey.headers), JSON.stringify(wireNoKey.headers));

const wireWithKey = await page.evaluate(async () => {
  const g = window.__game;
  const orig = window.fetch;
  let captured = null;
  window.fetch = async (url, init) => { captured = init.headers; return { ok: true, json: async () => ({}) }; };
  g.jevDriver.backend.apiKey = 'test-secret-123';
  await g.jevDriver.backend.send({}, []);
  g.jevDriver.backend.apiKey = '';
  window.fetch = orig;
  return captured;
});
check('AC-9.3.1 dev-only direct key sends a Bearer header when configured',
  wireWithKey?.authorization === 'Bearer test-secret-123', JSON.stringify(wireWithKey));

const normalize = await page.evaluate(() => {
  const g = window.__game, b = g.jevDriver.backend;
  return {
    mapShape: b._normalize({ answers: { next_move: { answer: 'press_attack', probability: 0.8 } } }),
    arrayShape: b._normalize({ results: [{ id: 'next_move', value: 'press_attack', confidence: 0.8 }] }),
    choiceKey: b._normalize({ next_move: { choice: 'press_attack', p: 0.8 } }),
    bareBool: b._normalize({ answers: { danger_now: true } }),
    // the REAL TypeSafe wire shape (confirmed 2026-09-18 via convergent
    // independent public SDKs — docs.typesafe.ai stayed unreachable):
    // a Noul answer is a bare `noul` float, the yes-probability directly
    realNoul: b._normalize({ model: 'jev-1.13.0', answers: { danger_now: { type: 'noul', noul: 0.82 } } }),
    realNoulLow: b._normalize({ model: 'jev-1.13.0', answers: { danger_now: { type: 'noul', noul: 0.15 } } }),
    realChoice: b._normalize({ model: 'jev-1.13.0', answers: {
      next_move: { type: 'choice', choice: 'press_attack', confidence: 0.83, probabilities: { press_attack: 0.83, evade: 0.1 } },
    } }),
  };
});
check('AC-9.3.2 normalize handles an answers-map response',
  normalize.mapShape.next_move?.answer === 'press_attack' && normalize.mapShape.next_move?.p === 0.8,
  JSON.stringify(normalize.mapShape));
check('AC-9.3.2 normalize handles a results-array response',
  normalize.arrayShape.next_move?.answer === 'press_attack' && normalize.arrayShape.next_move?.p === 0.8,
  JSON.stringify(normalize.arrayShape));
check('AC-9.3.2 normalize accepts "choice" as an answer-field alias',
  normalize.choiceKey.next_move?.answer === 'press_attack', JSON.stringify(normalize.choiceKey));
check('AC-9.3.2 normalize accepts a bare boolean answer',
  normalize.bareBool.danger_now?.answer === true, JSON.stringify(normalize.bareBool));
check('AC-9.3.2 (confirmed wire shape) a real `noul` field is read as a direct yes-probability',
  normalize.realNoul.danger_now?.p === 0.82 && normalize.realNoul.danger_now?.answer === true &&
  normalize.realNoulLow.danger_now?.p === 0.15 && normalize.realNoulLow.danger_now?.answer === false,
  JSON.stringify({ hi: normalize.realNoul, lo: normalize.realNoulLow }));
check('AC-9.3.2 (confirmed wire shape) a real Choice answer reads choice+confidence+probabilities',
  normalize.realChoice.next_move?.answer === 'press_attack' && normalize.realChoice.next_move?.p === 0.83 &&
  normalize.realChoice.next_move?.distribution?.press_attack === 0.83,
  JSON.stringify(normalize.realChoice));

// end-to-end: a REAL-shaped response (bare `noul` field) drives the exact
// same charge-commit behavior as the mocked {answer,p}-shaped one used
// throughout the rest of this suite — the two response conventions must
// not be conflated (a direct P(yes) is never inverted)
await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const realShapeCommit = await page.evaluate(async () => {
  const g = window.__game;
  // reset()'s stub shadows the real send(); remove it so the ACTUAL
  // JevBackend.prototype.send runs (fetch -> _normalize -> _apply)
  delete g.jevDriver.backend.send;
  const orig = window.fetch;
  window.fetch = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        next_move: { type: 'choice', choice: 'charge_blast', confidence: 0.9 },
        commit_full_charge: { type: 'noul', noul: 0.92 },   // real shape: direct P(yes)
      },
    }),
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  window.fetch = orig;
  // one real fetch+normalize round trip is all this proves; re-mock send
  // before the long stepping loop so a later staleness re-ask can't hit
  // the real (absent) localhost proxy and log a network error
  g.jevDriver.backend.send = async () => ({});
  for (let i = 0; i < 260; i++) g.step(1);
  return { blasts: g.__hits.filter(h => h.type === 'blast').length, commitCharge: g.jevDriver.commitCharge };
});
check('AC-9.3.2 a real-shaped `noul` response drives a genuine full-charge BLAST (not inverted)',
  realShapeCommit.commitCharge > 0.55 && realShapeCommit.blasts >= 1,
  JSON.stringify(realShapeCommit));

// ================= FR-9.1: state and questions, separated =================

await reset();
const shape = await page.evaluate(async () => {
  const g = window.__game;
  g.rival.state = 'attack'; g.rival.phase = 'windup'; g.rival.attackType = 'heavy';
  g.rival.hp = 77;
  let captured = null;
  g.jevDriver.backend.send = async (state, questions) => { captured = { state, questions }; return {}; };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  return captured;
});
check('AC-9.1.1 state.me carries observed self facts',
  shape?.state.me && typeof shape.state.me.hp === 'number' &&
  typeof shape.state.me.energy === 'number' && 'flying' in shape.state.me && 'canFly' in shape.state.me,
  JSON.stringify(shape?.state.me));
check('AC-9.1.1 state.foe distinguishes state AND phase (a wind-up is not a stagger)',
  shape?.state.foe.state === 'attack' && shape.state.foe.phase === 'windup' && shape.state.foe.hp === 77,
  JSON.stringify(shape?.state.foe));
check('AC-9.1.1 state.rivalry carries the living-memory fields',
  shape?.state.rivalry && 'record' in shape.state.rivalry && 'foeHate' in shape.state.rivalry &&
  'lastTauntHeard' in shape.state.rivalry && 'macroThreat' in shape.state.rivalry,
  JSON.stringify(shape?.state.rivalry));
check('AC-9.1.1 no inferred conclusions in state (only observed facts, no e.g. "recommendedMove")',
  !('recommendedMove' in shape.state) && !('shouldAttack' in shape.state), JSON.stringify(Object.keys(shape?.state ?? {})));

const EXPECTED_MOVES = ['press_attack', 'route_uppercut', 'charge_blast', 'headbutt_rush',
  'ki_pressure', 'special_beam', 'guard', 'evade', 'take_flight', 'close_distance', 'back_off'];
const ids = shape?.questions.map(q => q.id).sort();
check('AC-9.1.2 question bank: exactly the four typed judgments',
  JSON.stringify(ids) === JSON.stringify(['commit_full_charge', 'danger_now', 'next_move', 'voice'].sort()),
  JSON.stringify(ids));
const nextMoveQ = shape?.questions.find(q => q.id === 'next_move');
check('AC-9.1.2 next_move is a Choice covering the whole tactical vocabulary',
  nextMoveQ?.type === 'choice' &&
  JSON.stringify(Object.keys(nextMoveQ.criteria).sort()) === JSON.stringify([...EXPECTED_MOVES].sort()),
  JSON.stringify(Object.keys(nextMoveQ?.criteria ?? {})));
const chargeQ = shape?.questions.find(q => q.id === 'commit_full_charge');
check('AC-9.1.2 commit_full_charge is a speculative Noul (premise stated in the question)',
  chargeQ?.type === 'noul' && /assume|charging/i.test(chargeQ.instructions), chargeQ?.instructions);
const voiceQ = shape?.questions.find(q => q.id === 'voice');
check('AC-9.1.2 voice is a Choice with a stay_silent no-match outcome',
  voiceQ?.type === 'choice' && 'stay_silent' in voiceQ.criteria, JSON.stringify(Object.keys(voiceQ?.criteria ?? {})));

// ================= FR-9.1.4: typed answers actually drive the fighter =================

// next_move picked by highest-probability answer: mocked 'evade' -> dodge
await reset();
const movePicked = await page.evaluate(async () => {
  const g = window.__game;
  g.jevDriver.backend.send = async () => ({ next_move: { answer: 'evade', p: 0.91 } });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const move = g.jevDriver.directive?.move;
  for (let i = 0; i < 20; i++) g.step(1);
  return { move, dodged: g.player.trace.some(e => e.state === 'dodge') };
});
check('AC-9.1.4 next_move is consumed by highest probability and executed',
  movePicked.move === 'evade' && movePicked.dodged, JSON.stringify(movePicked));

// commit_full_charge gates the hold: confident YES -> full charge -> BLAST
await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const fullCommit = await page.evaluate(async () => {
  const g = window.__game;
  g.jevDriver.backend.send = async () => ({
    next_move: { answer: 'charge_blast', p: 0.9 },
    commit_full_charge: { answer: true, p: 0.92 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 260; i++) g.step(1);
  return { blasts: g.__hits.filter(h => h.type === 'blast').length };
});
check('AC-9.1.4 confident commit_full_charge -> the hold reaches a real BLAST',
  fullCommit.blasts >= 1, JSON.stringify(fullCommit));

// doubtful commit_full_charge -> a short, safe release: hit lands, no blast
await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const safeRelease = await page.evaluate(async () => {
  const g = window.__game;
  g.jevDriver.backend.send = async () => ({
    next_move: { answer: 'charge_blast', p: 0.9 },
    commit_full_charge: { answer: false, p: 0.85 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 260; i++) g.step(1);
  return {
    blasts: g.__hits.filter(h => h.type === 'blast').length,
    hits: g.__hits.filter(h => h.type === 'hit').length,
  };
});
check('AC-9.1.4 doubtful commit_full_charge -> releases early: lands a hit, no blast',
  safeRelease.blasts === 0 && safeRelease.hits >= 1, JSON.stringify(safeRelease));

// danger_now arms the defensive reflex independent of next_move's choice
await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const dangerYes = await page.evaluate(async () => {
  const g = window.__game;
  g.rival.startAttack('heavy');            // rival winds up right on setup
  g.jevDriver.backend.send = async () => ({
    next_move: { answer: 'press_attack', p: 0.9 },   // NOT 'evade' — isolates the reflex
    danger_now: { answer: true, p: 0.93 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 30; i++) g.step(1);
  return { dodged: g.player.trace.some(e => e.state === 'dodge') };
});
check('AC-9.1.4 danger_now=yes arms a dodge even while next_move is offensive',
  dangerYes.dodged, JSON.stringify(dangerYes));

await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const dangerNo = await page.evaluate(async () => {
  const g = window.__game;
  g.rival.startAttack('heavy');
  g.jevDriver.backend.send = async () => ({
    next_move: { answer: 'back_off', p: 0.9 },       // no melee action to trigger a dodge some other way
    danger_now: { answer: false, p: 0.9 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 30; i++) g.step(1);
  return { dodged: g.player.trace.some(e => e.state === 'dodge') };
});
check('AC-9.1.4 danger_now=no does not force a dodge', !dangerNo.dodged, JSON.stringify(dangerNo));

// voice: Choice selection, never generation; stay_silent suppresses the line
await reset();
const voiceSpeaks = await page.evaluate(async () => {
  const g = window.__game;
  document.querySelector('#subtitles .line') && (document.querySelector('#subtitles .line').textContent = '');
  g.jevDriver.backend.send = async () => ({
    next_move: { answer: 'back_off', p: 0.9 },
    voice: { answer: 'contempt', p: 0.8 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  return document.querySelector('#subtitles .line')?.textContent ?? '';
});
check('AC-9.1.4 a non-silent voice answer surfaces the CANNED line as a JEV subtitle',
  voiceSpeaks.includes('deserves better'), voiceSpeaks);

await reset();
const voiceSilent = await page.evaluate(async () => {
  const g = window.__game;
  const line = document.querySelector('#subtitles .line');
  const before = line?.textContent ?? '';
  g.jevDriver.backend.send = async () => ({
    next_move: { answer: 'back_off', p: 0.9 },
    voice: { answer: 'stay_silent', p: 0.7 },
  });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  return { before, after: line?.textContent ?? '' };
});
check('AC-9.1.4 stay_silent produces no subtitle', voiceSilent.after === voiceSilent.before, JSON.stringify(voiceSilent));

// ================= FR-9.2: cadence, in-flight persistence, freshness =================

await reset();
const cadence = await page.evaluate(async () => {
  const g = window.__game;
  let calls = 0, resolveSecond = null;
  g.jevDriver.backend.send = (state, q) => {
    calls++;
    if (calls === 1) return Promise.resolve({ next_move: { answer: 'press_attack', p: 0.9 } });
    return new Promise(res => { resolveSecond = res; });   // held open deliberately
  };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const directiveAfterFirst = g.jevDriver.directive?.move;
  for (let i = 0; i < 170; i++) g.step(1);        // cross the 1.4s staleness line
  await new Promise(r => setTimeout(r, 0));                                   // request #2 STARTS, does not resolve
  const pendingDuringSecond = g.jevDriver.pending;
  const directiveWhilePending = g.jevDriver.directive?.move;
  resolveSecond({ next_move: { answer: 'back_off', p: 0.9 } });
  await new Promise(r => setTimeout(r, 0));
  const directiveAfterSecond = g.jevDriver.directive?.move;
  return { calls, directiveAfterFirst, pendingDuringSecond, directiveWhilePending, directiveAfterSecond };
});
check('AC-9.2.2 a fresh judgment fires on staleness (one request per decision)', cadence.calls === 2, JSON.stringify(cadence));
check('AC-9.2.2 the current directive keeps executing while a request is in flight',
  cadence.pendingDuringSecond && cadence.directiveWhilePending === 'press_attack', JSON.stringify(cadence));
check('AC-9.2.2 freshness: the new directive applies only once its answer resolves',
  cadence.directiveAfterSecond === 'back_off', JSON.stringify(cadence));

// living memory: recent combat + last directive's outcome feed the NEXT state
await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const memory = await page.evaluate(async () => {
  const g = window.__game;
  let n = 0, secondState = null;
  g.jevDriver.backend.send = async (state) => {
    n++;
    if (n === 2) secondState = state;
    return { next_move: { answer: n === 1 ? 'press_attack' : 'back_off', p: 0.9 } };
  };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 90; i++) g.step(1);          // let the string land on the rival
  for (let i = 0; i < 100; i++) g.step(1);         // cross staleness -> ask #2
  await new Promise(r => setTimeout(r, 0));
  return { secondState, calls: n };
});
check('AC-9.1.1 recent combat events (rivalry memory) feed back into the next state',
  memory.secondState?.recent.some(s => /JEV hit/.test(s)), JSON.stringify(memory.secondState?.recent));
check('AC-9.1.1 lastDirective + outcome feeds back into the next state',
  memory.secondState?.lastDirective?.move === 'press_attack' &&
  typeof memory.secondState?.lastDirective?.outcome === 'string', JSON.stringify(memory.secondState?.lastDirective));

// rival taunts are remembered (the "living" part: JEV holds the memory)
await reset();
const tauntMemory = await page.evaluate(() => {
  const g = window.__game;
  g.hud.subtitle(g.manager.doc.name, 'You again. How predictable.');
  return g.jevDriver.lastTauntHeard;
});
check('AC-9.1.1 the rival\'s last taunt is remembered as rivalry state',
  tauntMemory === 'You again. How predictable.', tauntMemory);

// ================= FR-9.2.3: liveness — no backend, no stall =================

await reset();
const offline = await page.evaluate(async () => {
  const g = window.__game;
  g.jevDriver.backend.send = async () => { throw new Error('connection refused'); };
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  const offlineFlag = g.jevDriver.offline;
  // zero energy so the fallback's aggressive bot can't roll a long-windup
  // special beam and stall the movement window (a bot-randomness artifact,
  // not something this probe cares about) — deterministic ground closing
  g.player.energy = 0;
  g.rival.pos.set(0, 0, -8); g.rival.prevPos.copy(g.rival.pos);   // far: fallback should approach
  const d0 = g.player.distanceTo(g.rival);
  for (let i = 0; i < 150; i++) g.step(1);
  const d1 = g.player.distanceTo(g.rival);
  g.jevPanel.tick();
  const panelOffline = document.getElementById('jev').classList.contains('offline');
  return { offlineFlag, closed: d1 < d0 - 1, panelOffline };
});
check('AC-9.2.3 a failed backend sets the offline flag and the HUD reflects it',
  offline.offlineFlag && offline.panelOffline, JSON.stringify(offline));
check('AC-9.2.3 the heuristic fallback keeps fighting — the duel never stalls',
  offline.closed, JSON.stringify(offline));

// ================= FR-9.2.4: runtime toggle, and the profiler is blind to WHO plays =================

await reset();
const toggle = await page.evaluate(() => {
  const g = window.__game;
  const whileOn = g.playerDriver === g.jevDriver;
  g.jevPanel.toggle(false);
  const whileOff = g.playerDriver === g.controller;
  g.jevPanel.toggle(true);
  const backOn = g.playerDriver === g.jevDriver;
  return { whileOn, whileOff, backOn };
});
check('AC-9.2.4 the panel toggle swaps the live player driver at runtime',
  toggle.whileOn && toggle.whileOff && toggle.backOn, JSON.stringify(toggle));

await reset({ playerPos: [0, 0, -1.5], rivalPos: [0, 0, 0.4] });
const profiled = await page.evaluate(async () => {
  const g = window.__game;
  const attacks0 = g.profile.attacks;
  g.jevDriver.backend.send = async () => ({ next_move: { answer: 'press_attack', p: 0.9 } });
  g.step(1);
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 150; i++) g.step(1);
  return { gained: g.profile.attacks - attacks0 };
});
check('AC-9.2.4 the profiler observes Jev exactly as it would a human (learns from its attacks)',
  profiled.gained > 0, JSON.stringify(profiled));

// ================= boot-time presence (AC-9.2.4 UI) =================

const panelPresent = await page.evaluate(() => {
  const el = document.getElementById('jev');
  return !!el && el.querySelector('.toggle')?.textContent;
});
check('the LET JEV PLAY panel exists in the DOM at boot',
  typeof panelPresent === 'string' && panelPresent.length > 0, panelPresent);

// leave the game in human-driven mode for anything after this suite
await page.evaluate(() => { if (window.__game.jevPanel.active) window.__game.jevPanel.toggle(false); });

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p11.png' });
await browser.close();
finish();
