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

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070d);
scene.fog = new THREE.Fog(0x07070d, 50, 110);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// lighting pass (P1 carry-over): hemisphere fill so blockout reads clearly
scene.add(new THREE.HemisphereLight(0x9aa2ff, 0x1a1a2e, 0.85));
scene.add(new THREE.AmbientLight(0x8888aa, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(10, 20, 8);
scene.add(sun);

// ---------- world & fighters ----------
const zone = new Zone(scene);

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

const loop = new Loop({
  update(dt) {
    playerDriver.update(dt);
    dummyBrain.update(dt);
    rivalAgent.update(dt, loop.simTime);
    player.update(dt, zone, loop.simTime);
    dummy.update(dt, zone, loop.simTime);
    rival.update(dt, zone, loop.simTime);
    separate(player, dummy); separate(player, rival); separate(dummy, rival);
    if (player.pendingShot) { player.pendingShot = false; projectiles.fire(player, rival.alive && rivalAgent.enabled ? rival : dummy); }
    if (rival.pendingShot) { rival.pendingShot = false; projectiles.fire(rival, player); }
    projectiles.update(dt, [player, dummy, rival]);
    resolver.meleePair(player, dummy);
    resolver.meleePair(dummy, player);
    resolver.meleePair(player, rival);
    resolver.meleePair(rival, player);
    profiler.update(dt, loop.simTime);
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
    hud.update(rdt);
    renderer.render(scene, camera);
    statsEl.textContent =
      `fps ${loop.fps.toFixed(0)} · ticks ${loop.ticks}` +
      (rig.lockTarget ? ' · LOCK' : '') +
      (rivalAgent.enabled && rivalAgent.currentGoal ? ` · ${rivalAgent.currentGoal.name}` : '');
  },
});
resolver = new Resolver({ loop, rig });
input.simTime = () => loop.simTime;

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
hud.showFoe(manager.doc.name);

const debugPanel = new DebugPanel({
  manager, profile, sync, rivalAgent, player, rival, loop,
  get macroAgent() { return window.__game?.macroAgent; },   // P6
});

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
  manager, bootMode, debugPanel,
  setPlayerDriver, step,
};
