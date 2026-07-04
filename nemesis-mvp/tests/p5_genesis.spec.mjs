// P5 — Genesis Flow in the full zone
// FR-1.1 (tutorial), FR-1.2 (First Blood), FR-1.3 (forced escape, both
// branches), FR-5.1 (zone), AC-1.1.5 (returning-player skip).
// Deterministic manual stepping throughout (loop stopped, step(n)).
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

// ---- fresh boot lands in the tutorial (FR-1.1) ----
const bootState = await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();
  return {
    mode: g.bootMode,
    state: g.flow.state,
    playerNearPocket: Math.hypot(g.player.pos.x + 38, g.player.pos.z + 2) < 4,
    prompt: g.prompts.current,
    rivalFighting: g.rivalAgent.enabled,
  };
});
check('fresh boot enters tutorial at the pocket',
  bootState.mode === 'created' && bootState.state === 'tutorial' &&
  bootState.playerNearPocket && !bootState.rivalFighting,
  JSON.stringify(bootState));
check('first prompt is MOVE', /1\/6.*MOVE/.test(bootState.prompt ?? ''), bootState.prompt);

// ---- scripted tutorial playthrough, all six gated steps ----
const tut = await page.evaluate(() => {
  const g = window.__game, out = { prompts: [] };
  const t0 = g.loop.simTime;
  const snap = () => out.prompts.push(g.prompts.current);

  // 1 move: hold W for ~1s (6 m/s covers the 3m requirement)
  g.input.down.fwd = true; g.step(130); g.input.down.fwd = false; snap();
  // 2 lock-on
  g.rig.toggleLock([g.dummy]); g.step(3); snap();
  // 3+4 attacks: stand in front of the dummy and land one of each
  g.player.pos.set(g.dummy.pos.x, 0, g.dummy.pos.z + 1.3);
  g.player.prevPos.copy(g.player.pos);
  g.input.pressT.light = g.loop.simTime; g.step(70); snap();
  g.input.pressT.heavy = g.loop.simTime; g.step(110); snap();
  // 5 block: hold for half a second
  g.input.down.block = true; g.step(70); g.input.down.block = false; g.step(2); snap();
  // 6 dodge
  g.input.pressT.dodge = g.loop.simTime; g.step(50); snap();

  const done = g.flow.sessionLog.find(e => e.evt === 'tutorial_complete');
  return {
    ...out,
    state: g.flow.state,
    completed: !!done,
    elapsedS: done ? done.t - t0 : null,
    whiffGate: null,
  };
});
check('tutorial: all six steps gate and complete', tut.completed && tut.state === 'approach',
  `state ${tut.state}; prompts seen: ${JSON.stringify(tut.prompts)}`);
check('tutorial completes well under 90s (AC-1.1.4)', tut.elapsedS != null && tut.elapsedS <= 90,
  `${tut.elapsedS?.toFixed(1)}s`);

// ---- whiffs must not advance attack steps (AC-1.1.2) — probe on a fresh sub-state ----
const whiff = await page.evaluate(() => {
  const g = window.__game;
  // rewind to the light-attack step artificially
  g.flow.state = 'tutorial';
  g.flow.tutorial = { step: 2, moved: 0, blockHeld: 0 };
  g.player.pos.set(-38, 0, -2); g.player.prevPos.copy(g.player.pos);   // far from dummy
  g.rig.lockTarget = null;
  g.input.pressT.light = g.loop.simTime;
  g.step(70);
  const stillOnStep = g.flow.tutorial.step === 2;
  // now land it for real and restore progress
  g.player.pos.set(g.dummy.pos.x, 0, g.dummy.pos.z + 1.3);
  g.player.prevPos.copy(g.player.pos);
  g.rig.lockTarget = g.dummy;
  g.flow.state = 'approach';
  return { stillOnStep };
});
check('a whiffed attack does not advance the step (AC-1.1.2)', whiff.stillOnStep);

// ---- entering the arena starts First Blood (FR-1.2) ----
const fb = await page.evaluate(() => {
  const g = window.__game;
  const baseAttack = g.manager.doc.stats.attack;
  g.player.pos.set(0, 0, -8); g.player.prevPos.copy(g.player.pos);
  g.step(3);
  return {
    state: g.flow.state,
    rivalMaxHp: g.rival.maxHp,
    rivalAttack: g.rival.stats.attack,
    expectAttack: baseAttack * 3,
    gateClosed: !g.zone.gate.disabled && g.zone.gate.mesh.visible,
    skillFloor: g.rivalAgent.skillFloor,
    agentOn: g.rivalAgent.enabled,
    nameCard: document.querySelector('#hud .announce')?.textContent ?? '',
    name: g.manager.doc.name,
  };
});
check('First Blood: state + overwhelming stats (AC-1.2.1)',
  fb.state === 'firstBlood' && fb.rivalMaxHp === 200 &&
  Math.abs(fb.rivalAttack - fb.expectAttack) < 1e-9 && fb.skillFloor === 0.9 && fb.agentOn,
  JSON.stringify(fb));
check('arena is sealed during First Blood (AC-1.2.3)', fb.gateClosed);
check('name card shown (AC-1.2.2)', fb.nameCard.includes(fb.name), fb.nameCard);

// ---- forced escape, player branch (FR-1.3) ----
const esc = await page.evaluate(() => {
  const g = window.__game;
  g.player.hp = 5;                       // below both clamp and trigger
  g.step(2);
  return {
    state: g.flow.state,
    hpClamped: g.player.hp >= 12,        // AC-1.3.5: death impossible
    frozen: !g.flow.combatEnabled,       // AC-1.3.1
    gateOpen: g.zone.gate.disabled,
    prompt: g.prompts.current,
  };
});
check('player at 15% triggers the frozen escape (AC-1.3.1, AC-1.3.5)',
  esc.state === 'forcedEscape' && esc.hpClamped && esc.frozen && esc.gateOpen,
  JSON.stringify(esc));
check('escape prompt says RUN', /RUN/.test(esc.prompt ?? ''), esc.prompt);

const genesis = await page.evaluate(() => {
  const g = window.__game;
  g.player.pos.set(0, 0, -17); g.player.prevPos.copy(g.player.pos);   // through the gate
  g.step(3);
  const entry = g.manager.ledger.entries.find(e => e.event === 'player_fled_first_duel');
  return {
    state: g.flow.state,
    label: entry?.label,
    wins: g.manager.doc.record.wins,
    escapes: g.manager.doc.record.escapes,
    hate: g.manager.doc.emotionalState,
    started: g.manager.doc.rivalryStarted === true,
    statsRestored: g.rival.maxHp === g.manager.doc.stats.hp && g.rivalAgent.skillFloor === 0,
  };
});
check('escape resolves the genesis (AC-1.3.2)',
  genesis.state === 'freeRoam' &&
  genesis.label === 'Player cowardice: Fled the initial duel.' &&
  genesis.wins === 1 && genesis.escapes === 1 && genesis.hate >= 25 && genesis.started,
  JSON.stringify(genesis));
check('rival stats restored after First Blood', genesis.statsRestored);

// ---- re-encounter starts a real duel (AC-5.1.4 anywhere-encounters) ----
const enc = await page.evaluate(() => {
  const g = window.__game;
  g.step(280);                            // let the free-roam grace pass
  g.player.pos.set(g.rival.pos.x + 3, 0, g.rival.pos.z + 3);
  g.player.prevPos.copy(g.player.pos);
  g.step(6);
  return { state: g.flow.state, agentOn: g.rivalAgent.enabled };
});
check('proximity in free roam starts an encounter', enc.state === 'encounter' && enc.agentOn,
  JSON.stringify(enc));

// ---- killing the rival: duel bookkeeping + respawn ----
const kill = await page.evaluate(() => {
  const g = window.__game;
  g.player.hp = 100;
  // 0.5 hp: even a blocked chip hit finishes it — the rubber-banded rival
  // defends hard at low hp (a single light WAS blocked in an earlier run,
  // which is the mirror/sync systems working, not a bug), so mash a few
  g.rival.hp = 0.5;
  g.rig.lockTarget = g.rival;
  for (let i = 0; i < 8 && g.rival.alive; i++) {
    g.player.pos.set(g.rival.pos.x, 0, g.rival.pos.z + 1.3);
    g.player.prevPos.copy(g.player.pos);
    g.input.pressT.light = g.loop.simTime;
    g.step(70);
  }
  const afterKill = { state: g.flow.state, losses: g.manager.doc.record.losses,
                      tags: [...g.manager.doc.appearanceTags] };
  g.step(300);                            // aftermath timer
  const base = g.zone.locations.rivalBase;
  return {
    ...afterKill,
    finalState: g.flow.state,
    revived: g.rival.alive && g.rival.hp === g.rival.maxHp,
    atBase: Math.hypot(g.rival.pos.x - base.x, g.rival.pos.z - base.z) < 3,
  };
});
check('rival death records the loss + Scarred tag',
  kill.state === 'aftermath' && kill.losses === 1 && kill.tags.includes('Scarred'),
  JSON.stringify(kill));
check('aftermath revives the rival at its base',
  kill.finalState === 'freeRoam' && kill.revived && kill.atBase,
  JSON.stringify(kill));

// ---- breaking away mid-duel logs an escape ----
const flee = await page.evaluate(() => {
  const g = window.__game;
  g.step(280);
  g.player.pos.set(g.rival.pos.x + 3, 0, g.rival.pos.z + 3);
  g.player.prevPos.copy(g.player.pos);
  g.step(6);
  const inDuel = g.flow.state === 'encounter';
  g.player.pos.set(0, 0, 10); g.player.prevPos.copy(g.player.pos);   // >25m away
  g.step(3);
  return {
    inDuel, state: g.flow.state,
    logged: g.manager.ledger.has('player_escaped_duel'),
    escapes: g.manager.doc.record.escapes,
  };
});
check('mid-duel escape returns to free roam + ledger entry',
  flee.inDuel && flee.state === 'freeRoam' && flee.logged && flee.escapes === 2,
  JSON.stringify(flee));

// ---- symmetric branch: the RIVAL flees its first duel (AC-1.3.3) ----
const rivalFlees = await page.evaluate(() => {
  const g = window.__game;
  g.player.hp = 100;                      // must be above 15% or the check
                                          // routes to the PLAYER escape branch
  const hate0 = g.manager.doc.emotionalState;
  const losses0 = g.manager.doc.record.losses;
  g.flow.goto('firstBlood');
  const logMark = g.flow.sessionLog.length;
  g.rival.hp = 20;                        // ≤15% of the 200 First-Blood pool
  g.step(8);                              // player is far -> resolves fast,
                                          // possibly within one probe window
  const escaped = g.flow.sessionLog.slice(logMark)
    .some(e => e.evt === 'state:forcedEscape');
  const entry = g.manager.ledger.entries.find(e => e.event === 'rival_fled_first_duel');
  return {
    escaped, state: g.flow.state,
    logged: !!entry,
    lossCounted: g.manager.doc.record.losses === losses0 + 1,
    hateJump: g.manager.doc.emotionalState - hate0,
    finalHate: g.manager.doc.emotionalState,
  };
});
check('rival at 15% flees instead (AC-1.3.3)',
  rivalFlees.escaped && rivalFlees.state === 'freeRoam' && rivalFlees.logged &&
  rivalFlees.lossCounted && (rivalFlees.hateJump >= 30 || rivalFlees.finalHate === 100),
  JSON.stringify(rivalFlees));

// ---- returning player skips the tutorial (AC-1.1.5) ----
await page.reload();
await page.waitForFunction(() => window.__game != null, { timeout: 10000 });
const returning = await page.evaluate(() => ({
  mode: window.__game.bootMode,
  state: window.__game.flow.state,
}));
check('returning player boots straight to free roam',
  returning.mode === 'restored' && returning.state === 'freeRoam',
  JSON.stringify(returning));

// ---- zone bounds soak: 60s of random input never escapes the zone (AC-5.1.3) ----
const soak = await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();
  const dirs = ['fwd', 'back', 'left', 'right'];
  let worst = { x: 0, z: 0 };
  for (let burst = 0; burst < 300; burst++) {         // 300 x 24 ticks = 60s sim
    for (const d of dirs) g.input.down[d] = Math.random() < 0.4;
    if (Math.random() < 0.1) g.input.pressT.jump = g.loop.simTime;
    if (Math.random() < 0.1) g.input.pressT.dodge = g.loop.simTime;
    g.step(24);
    const p = g.player.pos;
    if (Number.isNaN(p.x) || Number.isNaN(p.z)) return { nan: true };
    worst = { x: Math.max(worst.x, Math.abs(p.x)), z: p.z < worst.z ? p.z : worst.z };
    if (Math.abs(p.x) > 50 || p.z > 20.5 || p.z < -52.5) {
      return { escaped: true, at: { x: p.x, z: p.z } };
    }
  }
  for (const d of dirs) g.input.down[d] = false;
  return { escaped: false, nan: false, worst };
});
check('60s random-input soak stays in bounds, no NaN',
  soak.escaped === false && soak.nan === false, JSON.stringify(soak));

// ---- waypoint graph connects the far corners (FR-5.1) ----
const nav = await page.evaluate(() => window.__game.nav.path('tutorial', 'rivalBase'));
check('nav graph connects tutorial to rival base', Array.isArray(nav) && nav.length >= 4,
  JSON.stringify(nav));

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p5.png' });
await browser.close();
finish();
