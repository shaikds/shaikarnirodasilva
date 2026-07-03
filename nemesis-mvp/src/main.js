import * as THREE from 'three';
import { Loop } from './core/loop.js';
import { store } from './core/store.js';
import { Input } from './core/input.js';
import { Zone } from './world/zone.js';
import { CameraRig } from './world/camera.js';
import { Fighter } from './combat/fighter.js';
import { PlayerController } from './combat/controller.js';

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

scene.add(new THREE.AmbientLight(0x8888aa, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
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

// ---------- loop ----------
const statsEl = document.getElementById('stats');
let lastRender = performance.now();

const loop = new Loop({
  update(dt) {
    controller.update(dt);
    player.update(dt, zone);
    dummy.update(dt, zone);
  },
  render(alpha) {
    const now = performance.now();
    const rdt = Math.min((now - lastRender) / 1000, 0.1);
    lastRender = now;

    player.syncMesh(alpha);
    dummy.syncMesh(alpha);
    rig.update(rdt, controller.orbitInput());
    renderer.render(scene, camera);
    statsEl.textContent =
      `fps ${loop.fps.toFixed(0)} · ticks ${loop.ticks}` +
      (rig.lockTarget ? ' · LOCK' : '');
  },
});
input.simTime = () => loop.simTime;
loop.start();

// ---------- test / debug surface ----------
window.__game = {
  loop, scene, camera, renderer, store, THREE,
  zone, player, dummy, input, rig, controller,
};
