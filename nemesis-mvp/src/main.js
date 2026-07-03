import * as THREE from 'three';
import { Loop } from './core/loop.js';
import { store } from './core/store.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070d);
scene.fog = new THREE.Fog(0x07070d, 40, 90);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 4, 8);
camera.lookAt(0, 1, 0);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x8888aa, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 8);
scene.add(sun);

// ---------- first light: blockout floor + capsule ----------
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(40, 1, 40),
  new THREE.MeshLambertMaterial({ color: 0x101020 })
);
floor.position.y = -0.5;
scene.add(floor);

const grid = new THREE.GridHelper(40, 40, 0x3a3a66, 0x1c1c33);
grid.position.y = 0.01;
scene.add(grid);

const capsule = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 1.0, 6, 12),
  new THREE.MeshLambertMaterial({ color: 0x4db8ff, emissive: 0x0a2438 })
);
capsule.position.set(0, 0.9, 0);
scene.add(capsule);

// ---------- loop ----------
const statsEl = document.getElementById('stats');
const loop = new Loop({
  update(dt) {
    capsule.rotation.y += dt * 0.8;   // proof of sim time vs render time
  },
  render() {
    renderer.render(scene, camera);
    statsEl.textContent =
      `fps ${loop.fps.toFixed(0)} · ticks ${loop.ticks}`;
  },
});
loop.start();

// ---------- test / debug surface ----------
window.__game = { loop, scene, camera, renderer, store, THREE };
