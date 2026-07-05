import * as THREE from 'three';
import { Loop } from './core/loop.js';
import { store } from './core/store.js';
import { Input } from './core/input.js';
import { Zone } from './world/zone.js';
import { CameraRig } from './world/camera.js';
import { Fighter } from './combat/fighter.js';
import { PlayerController } from './combat/controller.js';
import { Resolver } from './combat/resolver.js';
import { DummyBrain } from './combat/dummy.js';
import { Projectiles } from './combat/projectiles.js';
import { Hud } from './ui/hud.js';
import { PlayerProfile, Profiler } from './ai/playerProfile.js';
import { SyncEngine } from './ai/syncEngine.js';
import { RivalAgent } from './ai/rivalAgent.js';
import { PlayerBot } from './ai/bots.js';
import { RivalManager } from './rivalry/rivalManager.js';
import { DebugPanel } from './ui/debug.js';
import { VFX } from './fx/vfx.js';
import { makeSkyTexture } from './fx/textures.js';
import { Landmarks } from './world/landmarks.js';
import { Navigation } from './world/navigation.js';
import { Prompts } from './ui/prompts.js';
import { GameFlow } from './core/states.js';
import { MacroAgent } from './ai/macroAgent.js';
import { TauntEngine } from './rivalry/taunts.js';
import { ATTACKS } from './combat/attacks.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0x07070d, 45, 105);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// lighting pass: hemisphere fill + a shadow-casting sun sized to the zone
scene.add(new THREE.HemisphereLight(0x9aa2ff, 0x1a1a2e, 0.8));
scene.add(new THREE.AmbientLight(0x8888aa, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(14, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
// tight frustum around the arena/tutorial area (where fights actually
// happen) rather than the whole zone, for sharper shadows at lower cost
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.002;
scene.add(sun);
scene.add(sun.target);

// ---------- world & fighters ----------
const zone = new Zone(scene);
const vfx = new VFX(scene);
const landmarks = new Landmarks(scene);

const player = new Fighter({
  scene, name: 'player',
  color: 0x4db8ff, emissive: 0x0a2438,
  pos: [0, 0, 6],
});
const dummy = new Fighter({
  scene, name: 'dummy',
  color: 0x8a8aa5, emissive: 0x15151f,
  pos: [0, 0, -3],
});
const rival = new Fighter({
  scene, name: 'rival',
  color: 0xff4d6a, emissive: 0x38101a,
  pos: [9, 0, -9],
});

const input = new Input(canvas);
const rig = new CameraRig(camera, player, zone);
const controller = new PlayerController(player, input, rig);
controller.candidates = [dummy, rival];
const dummyBrain = new DummyBrain(dummy, player);
const hud = new Hud({ camera });
hud.track(player, rival);
hud.trackRig(rig);
vfx.spawnAmbient();

// ---------- loop ----------
const statsEl = document.getElementById('stats');
let lastRender = performance.now();
let resolver;   // needs loop; created after

// fighters shouldn't share the same square meter
function separate(a, b) {
  if (!a.alive || !b.alive) return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz), min = a.radius + b.radius;
  if (d > 0.001 && d < min) {
    const push = (min - d) / 2;
    a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
    b.pos.x += dx / d * push; b.pos.z += dz / d * push;
  }
}

// the player's driver is swappable: human controller or a test bot
let playerDriver = controller;
function setPlayerDriver(spec) {
  if (spec === 'human') playerDriver = controller;
  else playerDriver = new PlayerBot(player, rival, spec);   // 'aggressive'|'turtle'|'heavyOnly'
  return playerDriver;
}

// movement-feedback dust: watch grounded/dodge transitions, pure presentation
const feet = new WeakMap();
function trackMovementFx(f) {
  const prev = feet.get(f) || { grounded: f.grounded, state: f.state };
  if (!prev.grounded && f.grounded) {
    vfx.spawnLandingDust({ x: f.pos.x, y: 0.05, z: f.pos.z });
  }
  if (prev.state !== 'dodge' && f.state === 'dodge') {
    vfx.spawnDodgeDust({ x: f.pos.x, y: 0.05, z: f.pos.z });
  }
  if (f.grounded && f.state === 'idle' && (Math.abs(f.intent.move.x) > 0.1 || Math.abs(f.intent.move.z) > 0.1)) {
    if (Math.floor(f.anim / 180) !== Math.floor((prev.anim ?? f.anim) / 180)) {
      vfx.spawnFootDust({ x: f.pos.x, y: 0.05, z: f.pos.z });
    }
  }
  feet.set(f, { grounded: f.grounded, state: f.state, anim: f.anim });
}

const loop = new Loop({
  update(dt) {
    flow.update(dt);
    const combat = flow.combatEnabled;
    playerDriver.update(dt);
    dummyBrain.update(dt);
    rivalAgent.update(dt, loop.simTime);
    player.update(dt, zone, loop.simTime);
    dummy.update(dt, zone, loop.simTime);
    rival.update(dt, zone, loop.simTime);
    trackMovementFx(player); trackMovementFx(rival); trackMovementFx(dummy);
    separate(player, dummy); separate(player, rival); separate(dummy, rival);
    if (combat) {
      // your shots go where you're LOOKING: lock-on first, else the live foe
      const playerTarget = (rig.lockTarget?.alive && rig.lockTarget) ||
        (rival.alive && rivalAgent.enabled ? rival : dummy);
      if (player.pendingShot) { player.pendingShot = false; projectiles.fire(player, playerTarget); }
      if (rival.pendingShot) { rival.pendingShot = false; projectiles.fire(rival, player); }
      if (player.pendingKi) { player.pendingKi = false; projectiles.fire(player, playerTarget, ATTACKS.ki); }
      if (rival.pendingKi) { rival.pendingKi = false; projectiles.fire(rival, player, ATTACKS.ki); }
      projectiles.update(dt, [player, dummy, rival]);
      resolver.meleePair(player, dummy);
      resolver.meleePair(dummy, player);
      resolver.meleePair(player, rival);
      resolver.meleePair(rival, player);
    } else {
      // combat frozen (forced escape / free roam): no new shots, no hits
      player.pendingShot = false; rival.pendingShot = false;
      player.pendingKi = false; rival.pendingKi = false;
      projectiles.update(dt, []);
    }
    // transformation moments (AC-7.4.1): announce + burst + slow beat
    for (const f of [player, rival]) {
      if (f.justTransformed) {
        f.justTransformed = false;
        hud.announce(f === player ? 'SURGE — YOUR POWER ERUPTS' : `${manager.doc.name} TRANSFORMS`, 2200);
        vfx._spawn({ x: f.pos.x, y: f.pos.y + 1.2, z: f.pos.z },
          { color: 0xffd24d, count: 30, speed: [3, 8], size: [0.1, 0.3], life: [0.4, 0.9], upBias: 1.4 });
        loop.slowmo(300, 0.3);
        rig.shake(0.2);
      }
    }
    profiler.update(dt, loop.simTime);
    // charge-up sparkle while winding up a special
    for (const f of [player, rival]) {
      if (f.state === 'attack' && f.attackType === 'special' && f.phase === 'windup') {
        vfx.spawnChargeSparkle(
          { x: f.pos.x + Math.sin(f.yaw) * 0.6, y: f.pos.y + 1.25, z: f.pos.z + Math.cos(f.yaw) * 0.6 },
          f.baseColor.getHex()
        );
      }
    }
  },
  render(alpha) {
    const now = performance.now();
    const rdt = Math.min((now - lastRender) / 1000, 0.1);
    lastRender = now;

    player.syncMesh(alpha);
    dummy.syncMesh(alpha);
    rival.syncMesh(alpha);
    rig.update(rdt, playerDriver === controller ? controller.orbitInput() : { x: 0, y: 0 });
    if (input.consume('debug', 0.1)) debugPanel.toggle();
    debugPanel.update(rdt);
    hud.consume(resolver.events);
    hud.setGoalHint(
      rivalAgent.enabled && rivalAgent.currentGoal ? rivalAgent.currentGoal.hud : null
    );
    hud.setPower(player.power, player.surge, player.surgeMeter);
    hud.update(rdt);
    vfx.update(rdt, loop.simTime);
    landmarks.update(loop.simTime);
    degrade.check();
    renderer.render(scene, camera);
    statsEl.textContent =
      `fps ${loop.fps.toFixed(0)} · ticks ${loop.ticks}` +
      (flow.enabled ? ` · ${flow.state}` : '') +
      (rig.lockTarget ? ' · LOCK' : '') +
      (rivalAgent.enabled && rivalAgent.currentGoal ? ` · ${rivalAgent.currentGoal.name}` : '');
  },
});
resolver = new Resolver({ loop, rig });
resolver.on(e => vfx.onResolverEvent(e));
input.simTime = () => loop.simTime;

// NFR-5 degraded mode: sustained low fps sheds render cost automatically —
// shadows off, pixel ratio 1, particle density halved. One-way (no thrash).
const degrade = {
  auto: true,            // capture/test scripts may pin this off
  engaged: false,
  _lowT: 0,
  _last: null,
  check() {
    if (!this.auto || this.engaged) return;
    // own unclamped wall clock: the render loop's rdt is clamped to 0.1s,
    // which under-counts exactly when frames are slow — the case we detect
    const now = performance.now();
    const dt = this._last == null ? 0 : Math.min((now - this._last) / 1000, 0.5);
    this._last = now;
    if (loop.fps < 30) {
      this._lowT += dt;
      if (this._lowT > 3) this.engage();
    } else {
      this._lowT = 0;
    }
  },
  engage() {
    this.engaged = true;
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(1);
    vfx.density = 0.5;
  },
};

// ---------- the rival's mind & identity ----------
const profile = new PlayerProfile();
const sync = new SyncEngine();
const projectiles = new Projectiles({ scene, resolver, zone });
const rivalAgent = new RivalAgent({ fighter: rival, target: player, profile, sync, resolver });
const profiler = new Profiler({ profile, player, rival, resolver });
const manager = new RivalManager({ store, profile, sync });
const bootMode = manager.loadOrCreate();      // 'created' | 'restored'
manager.applyToFighter(rival);
if (rival.maxHp !== rival.hp) rival.hp = rival.maxHp;
manager.applyPlayerGrowth(player);            // zenkai carries across sessions
player.canFly = !!manager.doc.rivalryStarted; // flight awakened at genesis (AC-7.1.2)
rival.canFly = true;                          // it was always more than you
// (the foe HUD panel is shown/hidden by the GameFlow per state)

const debugPanel = new DebugPanel({
  manager, profile, sync, rivalAgent, player, rival, loop,
  get macroAgent() { return window.__game?.macroAgent; },   // P6
});

// ---------- the Genesis Flow owns who fights when (M1) ----------
const nav = new Navigation();
const prompts = new Prompts();
const taunts = new TauntEngine({ manager });
const macroAgent = new MacroAgent({ rival, player, manager, nav, zone });
const flow = new GameFlow({
  player, dummy, rival, dummyBrain, rivalAgent, manager,
  hud, prompts, zone, nav, resolver, rig, loop, bootMode,
  macroAgent, taunts,
});
flow.boot();

loop.start();

// deterministic manual stepping for tests (see p2 spec for rationale)
function step(n) {
  for (let i = 0; i < n; i++) {
    loop.updateFn(loop.step);
    loop.simTime += loop.step;
    loop.ticks++;
  }
}

// ---------- test / debug surface ----------
window.__game = {
  loop, scene, camera, renderer, store, THREE,
  zone, player, dummy, rival, dummyBrain, input, rig, controller,
  resolver, hud, profile, sync, rivalAgent, profiler, projectiles,
  manager, bootMode, debugPanel, vfx, landmarks, sun,
  nav, prompts, flow, macroAgent, taunts, degrade,
  setPlayerDriver, step,
};
