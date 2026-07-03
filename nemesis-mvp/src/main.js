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
import { Hud } from './ui/hud.js';

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

const input = new Input(canvas);
const rig = new CameraRig(camera, player, zone);
const controller = new PlayerController(player, input, rig);
controller.candidates = [dummy];
const dummyBrain = new DummyBrain(dummy, player);
const hud = new Hud({ camera });
hud.track(player, dummy);

// ---------- loop ----------
const statsEl = document.getElementById('stats');
let lastRender = performance.now();
let resolver;   // needs loop; created after

const loop = new Loop({
  update(dt) {
    controller.update(dt);
    dummyBrain.update(dt);
    player.update(dt, zone, loop.simTime);
    dummy.update(dt, zone, loop.simTime);
    resolver.meleePair(player, dummy);
    resolver.meleePair(dummy, player);
  },
  render(alpha) {
    const now = performance.now();
    const rdt = Math.min((now - lastRender) / 1000, 0.1);
    lastRender = now;

    player.syncMesh(alpha);
    dummy.syncMesh(alpha);
    rig.update(rdt, controller.orbitInput());
    hud.consume(resolver.events);
    hud.update(rdt);
    renderer.render(scene, camera);
    statsEl.textContent =
      `fps ${loop.fps.toFixed(0)} · ticks ${loop.ticks}` +
      (rig.lockTarget ? ' · LOCK' : '');
  },
});
resolver = new Resolver({ loop, rig });
input.simTime = () => loop.simTime;
loop.start();

// ---------- test / debug surface ----------
window.__game = {
  loop, scene, camera, renderer, store, THREE,
  zone, player, dummy, dummyBrain, input, rig, controller, resolver, hud,
};
