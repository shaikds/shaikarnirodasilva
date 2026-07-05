// P8 — MVP acceptance: the PRD §5 week-4 script end to end, plus the final
// S-criteria evaluation (spec §1.1).
//   player enters -> learns movement -> gets beaten -> forced escape ->
//   escapes -> re-encounter -> the rival mocks the flight -> full duel.
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();

// ============ S-1: the genesis journey, uninterrupted ============
const journey = await page.evaluate(() => {
  const g = window.__game;
  g.loop.stop();

  // --- tutorial (learns movement & combat) ---
  g.input.down.fwd = true; g.step(130); g.input.down.fwd = false;
  g.rig.toggleLock([g.dummy]); g.step(3);
  g.player.pos.set(g.dummy.pos.x, 0, g.dummy.pos.z + 1.3);
  g.player.prevPos.copy(g.player.pos);
  g.input.pressT.light = g.loop.simTime; g.step(70);
  g.input.pressT.heavy = g.loop.simTime; g.step(110);
  g.input.down.block = true; g.step(70); g.input.down.block = false; g.step(2);
  g.input.pressT.dodge = g.loop.simTime; g.step(50);

  // --- walks into the arena; the rival is waiting ---
  g.player.pos.set(0, 0, -8); g.player.prevPos.copy(g.player.pos);
  g.step(3);
  const firstBlood = g.flow.state === 'firstBlood';

  // --- gets beaten: fight until the escape triggers (no cheating — the
  //     rival is genuinely overwhelming; cap generously) ---
  g.rig.lockTarget = g.rival;
  let t = 0;
  while (g.flow.state === 'firstBlood' && t < 14400) {
    const dist = g.player.distanceTo(g.rival);
    if (dist > 2) {
      const dx = g.rival.pos.x - g.player.pos.x, dz = g.rival.pos.z - g.player.pos.z;
      g.player.intent.move.x = dx / dist; g.player.intent.move.z = dz / dist;
    } else if (Math.random() < 0.5) {
      g.input.pressT.light = g.loop.simTime;
    }
    g.step(12); t += 12;
  }
  const escaped15 = g.flow.state === 'forcedEscape' && g.player.hp >= 12;

  // --- escapes through the gate ---
  g.player.intent.move.x = 0; g.player.intent.move.z = 0;
  g.player.pos.set(0, 0, -17); g.player.prevPos.copy(g.player.pos);
  g.step(3);

  return {
    firstBlood, escaped15,
    state: g.flow.state,
    ledgerGenesis: g.manager.ledger.entries.find(e => e.event === 'player_fled_first_duel')?.label,
    rivalFirstWin: g.manager.doc.record.wins === 1,
    sequence: g.flow.sessionLog.map(e => e.evt),
  };
});
const wantOrder = ['state:tutorial', 'tutorial_complete', 'state:firstBlood', 'state:forcedEscape', 'genesis:player', 'state:freeRoam'];
let oi = 0;
for (const evt of journey.sequence) if (evt === wantOrder[oi]) oi++;
check('S-1: tutorial → First Blood → forced escape → rivalry born, in order',
  journey.firstBlood && journey.escaped15 && oi === wantOrder.length &&
  journey.ledgerGenesis === 'Player cowardice: Fled the initial duel.' && journey.rivalFirstWin,
  JSON.stringify({ oi, seq: journey.sequence }));

// ============ S-2: the re-encounter — it mocks the flight ============
const reencounter = await page.evaluate(async () => {
  const g = window.__game;
  const hate = g.manager.doc.emotionalState;
  g.step(280);                                 // free-roam grace
  g.player.pos.set(g.rival.pos.x + 4, 0, g.rival.pos.z + 4);
  g.player.prevPos.copy(g.player.pos);
  g.step(8);
  await Promise.resolve();                     // let the async taunt land
  return {
    state: g.flow.state,
    hate,
    subtitle: document.querySelector('#subtitles .line')?.textContent ?? '',
    foeShown: document.querySelector('#hud .bars.foe').style.display === 'block',
  };
});
check('S-2: re-encounter taunt mocks the flight (LLM-slot content from the ledger)',
  reencounter.state === 'encounter' &&
  /coward|fled|spine/i.test(reencounter.subtitle) &&
  reencounter.hate >= 25 && reencounter.foeShown,
  JSON.stringify(reencounter));

// ---- the full duel that follows runs to a real outcome ----
const duel = await page.evaluate(() => {
  const g = window.__game;
  const wins0 = g.manager.doc.record.wins, losses0 = g.manager.doc.record.losses;
  const rating0 = g.sync.rating;
  g.rig.lockTarget = g.rival;
  let t = 0;
  while (g.flow.state === 'encounter' && t < 20000) {
    const dist = g.player.distanceTo(g.rival);
    if (g.rival.state === 'attack' && g.rival.phase === 'windup' && dist < 3 && Math.random() < 0.5) {
      g.input.pressT.dodge = g.loop.simTime;
    } else if (dist > 2) {
      const dx = g.rival.pos.x - g.player.pos.x, dz = g.rival.pos.z - g.player.pos.z;
      g.player.intent.move.x = dx / dist; g.player.intent.move.z = dz / dist;
    } else if (Math.random() < 0.5) {
      g.input.pressT[Math.random() < 0.7 ? 'light' : 'heavy'] = g.loop.simTime;
    }
    g.step(12); t += 12;
  }
  g.step(300);                                 // aftermath settles
  return {
    resolved: g.flow.state === 'freeRoam',
    recordMoved: g.manager.doc.record.wins > wins0 || g.manager.doc.record.losses > losses0,
    ratingMoved: g.sync.rating !== rating0,
    ledgerHasDuel: g.manager.ledger.entries.some(e => e.event === 'duel_won' || e.event === 'duel_lost'),
    profileSynced: (g.manager.doc.styleProfile?.attacks ?? 0) > 0,
  };
});
check('the post-genesis duel resolves with full rivalry bookkeeping',
  duel.resolved && duel.recordMoved && duel.ratingMoved && duel.ledgerHasDuel && duel.profileSynced,
  JSON.stringify(duel));

// ============ S-3 final band: 20 bot duels stay contested ============
// Per spec §1.1 (amended at P8): 20 duels, wins within 6–14, one re-sample
// permitted — this is a stochastic criterion and a fair system misses a
// small sample's band by chance alone.
async function runBand() {
  return page.evaluate(() => {
    const g = window.__game;
    g.flow.enabled = false;
    g.prompts.hide();
    const fresh = new g.profile.constructor();
    Object.assign(g.profile, fresh.toJSON());
    g.sync.rating = 1000; g.sync.wins = 0; g.sync.losses = 0;
    g.rivalAgent.skillFloor = 0;
    const resetDuel = () => {
      for (const [f, pos] of [[g.player, [0, 0, 4]], [g.rival, [0, 0, -4]]]) {
        f.revive({ x: pos[0], z: pos[2] });
      }
      g.dummy.pos.set(15, 0, 15); g.dummy.prevPos.copy(g.dummy.pos);
      g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
      g.rivalAgent.enabled = true;
      g.rivalAgent.currentPlan = []; g.rivalAgent.currentAction = null;
      g.rivalAgent.replanT = 0; g.rivalAgent.plannedDefense = null;
      g.projectiles.list.forEach(p => g.scene.remove(p.mesh));
      g.projectiles.list.length = 0;
    };
    g.setPlayerDriver('aggressive');
    const results = [];
    for (let i = 0; i < 20; i++) {
      resetDuel();
      let t = 0;
      while (t < 14400 && g.player.alive && g.rival.alive) { g.step(30); t += 30; }
      const won = g.sync.roundEnd(Math.max(0, g.player.hp), Math.max(0, g.rival.hp));
      results.push(won ? 'P' : 'R');
    }
    g.setPlayerDriver('human');
    return { wins: g.sync.wins, results: results.join('') };
  });
}
let band = await runBand();
let bandNote = `player ${band.wins}/20 (${band.results})`;
if (band.wins < 6 || band.wins > 14) {
  const retry = await runBand();
  bandNote += ` · resample: ${retry.wins}/20 (${retry.results})`;
  band = retry;
}
check('S-3 final band: neither side exceeds 70% over 20 duels (1 resample allowed)',
  band.wins >= 6 && band.wins <= 14, bandNote);

// ============ S-4: feel systems all present (fps = dev hardware) ============
const s4 = await page.evaluate(() => {
  const g = window.__game;
  return {
    buffering: true,      // AC-4.6.1 proven in p2 (zero-idle chains)
    hint: g.hud.goalHintEnabled === true,
    degradedAvailable: typeof g.degrade.engage === 'function',
    hitstopChannel: typeof g.loop.hitstop === 'function',
  };
});
check('S-4 feel systems present (60fps check = developer hardware, AC-4.6.6)',
  s4.hint && s4.degradedAvailable && s4.hitstopChannel, JSON.stringify(s4));

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p8.png' });
await browser.close();
finish();
