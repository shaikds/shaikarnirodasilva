// P10 — martial arts: limb fighting, vanish afterimages, hold-to-charge
// heavies with BLAST fly-away, combo routes, dash headbutt, key-map overlay.
// FR-8.1..8.5 (spec.md §8.6)
import { boot, check, finish } from './helpers.js';

const { browser, page, errors } = await boot();
await page.evaluate(() => { window.__game.loop.stop(); });

// standard isolation (see p2): flow off, rival quiescent, dummy as target,
// yaw set at setup like lock-on would, deterministic stepping only
async function reset(opts = {}) {
  await page.evaluate(({ playerPos, dummyPos, playerYaw }) => {
    const g = window.__game;
    const wipe = (f) => {
      f.state = 'idle'; f.stateT = 0; f.attackType = null; f.phase = null;
      f.combo = 0; f.comboT = 0; f.kb.set(0, 0); f.dodgeCd = 0; f.iframeT = 0;
      f.vy = 0; f.grounded = true; f.flying = false; f.chargeT = 0;
      f.attackCharge = 0; f.mesh.visible = true;
    };
    g.player.pos.set(...playerPos); g.player.prevPos.copy(g.player.pos);
    g.player.yaw = playerYaw; g.player.hp = 100; g.player.energy = 60;
    wipe(g.player);
    g.dummy.pos.set(...dummyPos); g.dummy.prevPos.copy(g.dummy.pos);
    g.dummy.hp = 1000; g.dummy.maxHp = 1000; g.dummy.yaw = Math.PI;
    wipe(g.dummy);
    g.loop.hitstopMs = 0; g.loop.slowmoMs = 0;
    g.dummyBrain.mode = 'idle';
    g.flow.enabled = false;
    g.prompts.hide();
    g.rivalAgent.enabled = false;
    g.rival.pos.set(200, 0, 200); g.rival.prevPos.copy(g.rival.pos);
    g.rival.hp = g.rival.maxHp;
    g.input.down.heavy = false; g.input.down.dash = false;
    if (g.rig.lockTarget !== g.dummy) g.rig.lockTarget = g.dummy;
    g.player.trace.length = 0; g.dummy.trace.length = 0;
    g.__hits = [];
    if (!g.__hooked) {
      g.resolver.on(e => g.__hits.push({
        type: e.type, kind: e.kind, amount: e.amount, charge: e.charge,
        att: e.att.name, def: e.def.name,
      }));
      g.__hooked = true;
    }
  }, {
    playerPos: opts.playerPos ?? [0, 0, -1],
    dummyPos: opts.dummyPos ?? [0, 0, 0.9],
    playerYaw: opts.playerYaw ?? 0,
  });
}

// ================= FR-8.1: limbs, not a sword =================

const rig = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  return {
    limbs: !!(f.armL && f.armR && f.legL && f.legR),
    swordGone: f.arm === undefined,
    armChildren: f.armL?.children?.length ?? 0,     // segment + fist tip
  };
});
check('AC-8.1.1 limb rig: two arms, two legs, no sword',
  rig.limbs && rig.swordGone && rig.armChildren === 2, JSON.stringify(rig));

// poses actually move the limbs: jab extends the lead arm on active frames
await reset();
const jabPose = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  f.syncMesh(1);
  const idleArm = f.armL.rotation.x;
  f.startAttack('light');                    // light1 = jab
  g.step(Math.round(0.13 * 120) + 2);        // into active
  f.syncMesh(1);
  const activeArm = f.armL.rotation.x;
  g.step(140);
  return { idleArm: +idleArm.toFixed(2), activeArm: +activeArm.toFixed(2), phaseSeen: f.trace.some(e => e.phase === 'active') };
});
check('AC-8.1.3 jab pose: lead arm extends on active frames',
  jabPose.phaseSeen && Math.abs(jabPose.activeArm) < 0.3 && jabPose.idleArm > 0.9,
  JSON.stringify(jabPose));

// ================= FR-8.3: hold-to-charge heavy =================

// tap = exactly the table damage, no blast, no fly-away
await reset();
const tap = await page.evaluate(() => {
  const g = window.__game;
  g.input.pressT.heavy = g.loop.simTime;     // tap: press without hold
  g.step(140);
  const hit = g.__hits.find(h => h.type === 'hit');
  return {
    dmg: hit ? +hit.amount.toFixed(2) : null,
    blast: g.__hits.some(h => h.type === 'blast'),
    dummyFlew: g.dummy.trace.some(e => e.state === 'flyaway'),
  };
});
check('AC-8.3.1 tap heavy: exact table damage (14), no blast',
  tap.dmg === 14 && !tap.blast && !tap.dummyFlew, JSON.stringify(tap));

// full charge = x2.2 damage, BLAST, fly-away -> wall slam -> get up with i-frames
await reset({ playerPos: [8.6, 0, 0], dummyPos: [10.4, 0, 0], playerYaw: Math.PI / 2 });
const blast = await page.evaluate(() => {
  const g = window.__game, d = g.dummy;
  g.input.down.heavy = true;
  g.input.pressT.heavy = g.loop.simTime;
  g.step(1);
  const charging = g.player.state === 'charge';
  g.step(130);                               // hold > maxS (0.9s)
  g.input.down.heavy = false;
  g.step(70);                                // release -> windup -> hit
  const hit = g.__hits.find(h => h.type === 'hit');
  const blastEv = g.__hits.find(h => h.type === 'blast');
  const flew = d.state === 'flyaway' || d.trace.some(e => e.state === 'flyaway');
  // ride the fly-away out: wall slam, then get up
  let gotUp = false, idleIframes = 0;
  for (let i = 0; i < 600 && !gotUp; i++) {
    g.step(1);
    if (d.state === 'getUp') gotUp = true;
  }
  for (let i = 0; i < 300 && d.state !== 'idle'; i++) g.step(1);
  idleIframes = d.iframeT;
  return {
    charging,
    dmg: hit ? +hit.amount.toFixed(2) : null,
    blast: !!blastEv, charge: blastEv?.charge,
    flew, gotUp,
    slammed: d.hp < 1000 - 30.8 - 3,         // wall slam added FLYAWAY.slamDmg
    hp: +d.hp.toFixed(1),
    idleIframes: +idleIframes.toFixed(2),
    state: d.state,
  };
});
check('AC-8.3.2 full charge: x2.2 damage (30.8) + blast event',
  blast.charging && blast.dmg === 30.8 && blast.blast && blast.charge === 1,
  JSON.stringify(blast));
check('AC-8.3.3 blast sends them FLYING into the wall (slam damage)',
  blast.flew && blast.slammed, JSON.stringify(blast));
check('AC-8.3.4 they stay down, then rise with brief i-frames',
  blast.gotUp && blast.state === 'idle' && blast.idleIframes >= 0.25,
  JSON.stringify(blast));

// getting hit CANCELS the charge
await reset();
const cancel = await page.evaluate(() => {
  const g = window.__game;
  g.input.down.heavy = true;                 // a real hold, via the controller
  g.input.pressT.heavy = g.loop.simTime;
  g.step(6);
  const wasCharging = g.player.state === 'charge';
  g.dummy.startAttack('light');              // dummy faces the player already
  g.step(24);                                // windup+active: the hit lands
  const afterHit = g.player.state;
  const releaseAfter = g.player.releaseCharge();
  g.input.down.heavy = false;
  return { wasCharging, afterHit, releaseAfter };
});
check('AC-8.3.5 taking a hit cancels the charge (no stored release)',
  cancel.wasCharging && cancel.afterHit === 'hitstun' && cancel.releaseAfter === false,
  JSON.stringify(cancel));

// ================= FR-8.4: combo routes =================

await reset();
const route = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  const fromLight1 = (() => {                // no route off light1
    f.startAttack('light');
    g.step(34);                              // light1 recover
    return f.canStart('heavy');
  })();
  g.step(140);                               // settle
  f.state = 'idle'; f.attackType = null; f.phase = null;
  g.dummy.state = 'idle'; g.dummy.stateT = 0; g.dummy.vy = 0; g.dummy.grounded = true;
  g.dummy.pos.set(0, 0, 0.9); g.dummy.prevPos.copy(g.dummy.pos);
  f.pos.set(0, 0, -1); f.prevPos.copy(f.pos); f.yaw = 0;
  f.startAttack('light');                    // light1
  g.step(34);
  f.startAttack('light');                    // -> light2
  g.step(28);                                // light2 recover
  const routed = f.canStart('heavy') && f.startAttack('heavy');
  const type = f.attackType;
  g.step(24);                                // uppercut windup+active
  const launched = !g.dummy.grounded && g.dummy.vy > 4;
  g.step(160);
  return { fromLight1, routed, type, launched, vy: +g.dummy.vy.toFixed(1) };
});
check('AC-8.4.1 light-light-HEAVY routes into the uppercut (light1 does not)',
  route.fromLight1 === false && route.routed && route.type === 'uppercut',
  JSON.stringify(route));
check('AC-8.4.2 uppercut launches HIGH (launchVy 6.5)', route.launched,
  JSON.stringify(route));

// dash headbutt: heavy pressed while ki-dashing converts momentum
await reset({ playerPos: [0, 0, -4], dummyPos: [0, 0, 0.9] });
const headbutt = await page.evaluate(() => {
  const g = window.__game;
  g.input.down.dash = true;                  // Q carries you in...
  for (let i = 0; i < 60 && g.player.distanceTo(g.dummy) > 2.0; i++) g.step(1);
  g.input.pressT.heavy = g.loop.simTime;     // ...K converts the momentum
  g.step(2);
  const type = g.player.attackType;
  g.input.down.dash = false;
  g.step(140);
  const hit = g.__hits.find(h => h.type === 'hit');
  return { type, dist: +g.player.distanceTo(g.dummy).toFixed(1), landed: !!hit };
});
check('AC-8.1.2 dash + heavy = headbutt (momentum into impact)',
  headbutt.type === 'headbutt' && headbutt.landed, JSON.stringify(headbutt));

// ================= FR-8.2: vanish + afterimages =================

await reset();
const vanish = await page.evaluate(() => {
  const g = window.__game, f = g.player;
  const ghosts0 = g.vfx.ghosts?.length ?? 0;
  let hidden = false, ghostSeen = false;
  for (let d = 0; d < 3; d++) {              // afterimages are stochastic
    f.dodgeCd = 0;
    f.startDodge(1, 0);
    for (let i = 0; i < 40 && f.state === 'dodge'; i++) {
      g.step(1);
      f.syncMesh(1);
      if (!f.mesh.visible) hidden = true;
      if ((g.vfx.ghosts?.length ?? 0) > ghosts0) ghostSeen = true;
    }
    g.step(30);
  }
  f.syncMesh(1);
  return { hidden, ghostSeen, visibleAfter: f.mesh.visible };
});
check('AC-8.2.1 dodge vanishes through the i-frames, then reappears',
  vanish.hidden && vanish.visibleAfter, JSON.stringify(vanish));
check('AC-8.2.2 afterimage ghosts trail the vanish', vanish.ghostSeen);

// ================= FR-8.3 (rival): the nemesis charges too =================

await reset();
const aiCharge = await page.evaluate(() => {
  const g = window.__game;
  g.rival.revive({ x: 0, z: 2.5 });
  g.rival.yaw = Math.PI;
  g.player.pos.set(0, 0, 0.5); g.player.prevPos.copy(g.player.pos);
  g.player.stagger(3);                       // punishable: the rival dares to hold
  g.rivalAgent.enabled = true;
  g.rivalAgent.currentPlan = ['heavyAttack'];
  g.rivalAgent.currentAction = null;
  g.rivalAgent.replanT = 99;                 // don't replan over the probe
  let charged = false, released = null;
  for (let i = 0; i < 400; i++) {
    g.step(1);
    if (g.rival.state === 'charge') charged = true;
    if (charged && g.rival.state === 'attack') {
      released = { type: g.rival.attackType, charge: g.rival.attackCharge };
      break;
    }
  }
  g.rivalAgent.enabled = false;
  g.rival.pos.set(200, 0, 200); g.rival.prevPos.copy(g.rival.pos);
  return { charged, released };
});
check('AC-8.3.6 the rival charges heavies and auto-releases',
  aiCharge.charged && aiCharge.released?.type === 'heavy' &&
  aiCharge.released.charge >= 0 && aiCharge.released.charge <= 1,
  JSON.stringify(aiCharge));

// ================= FR-8.5: key-map overlay =================

const keymap = await page.evaluate(() => {
  const g = window.__game;
  const el = document.getElementById('keymap');
  const bootVisible = !!el && !el.classList.contains('hidden');
  const mentionsCharge = /CHARGE/.test(el?.textContent ?? '');
  g.keymap.hide();
  const hidden = el.classList.contains('hidden');
  // H is mapped: a real keydown lands in the input buffer as 'help'
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }));
  const hMapped = g.input.consume('help', 0.5);
  g.keymap.toggle();
  const reshown = !el.classList.contains('hidden');
  g.keymap.hide();
  return { bootVisible, mentionsCharge, hidden, hMapped, reshown };
});
check('AC-8.5.1 key map shows on boot and explains the charge mechanic',
  keymap.bootVisible && keymap.mentionsCharge, JSON.stringify(keymap));
check('AC-8.5.2 H toggles the key map any time',
  keymap.hidden && keymap.hMapped && keymap.reshown, JSON.stringify(keymap));

check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
await page.screenshot({ path: process.env.SHOT || '/tmp/p10.png' });
await browser.close();
finish();
