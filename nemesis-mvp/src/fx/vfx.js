// VFX: hit sparks, blood spray + persistent ground decals, dust, and a
// charge-up sparkle for specials. Pure presentation — spawns off Resolver
// events and Fighter state transitions, never touches combat numbers, so
// P0-P4 acceptance tests (which assert exact damage/timing) are unaffected.

import * as THREE from 'three';
import { softDot, bloodBlob } from './textures.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const GRAVITY = 9;
const DECAL_CAP = 140;

function spriteMat(tex, color, opacity = 1) {
  return new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.density = 1;      // NFR-5 degraded mode halves this
    this.particles = [];   // {sprite, vel:Vector3, life, max, grav, fadeSize}
    this.decals = [];      // {mesh}
    this.decalGroup = new THREE.Group();
    scene.add(this.decalGroup);
  }

  _spawn(pos, { color = 0xffffff, count = 10, speed = [1, 4], size = [0.08, 0.22],
                life = [0.3, 0.7], grav = GRAVITY, spread = 1, upBias = 0.5, tex = softDot } = {}) {
    count = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < count; i++) {
      const mat = spriteMat(tex, color, 1);
      const spr = new THREE.Sprite(mat);
      const s = rnd(size[0], size[1]);
      spr.scale.set(s, s, s);
      spr.position.copy(pos).add(new THREE.Vector3(rnd(-0.05, 0.05), rnd(-0.05, 0.05), rnd(-0.05, 0.05)));
      this.scene.add(spr);
      const theta = rnd(0, Math.PI * 2), phi = rnd(0, Math.PI * upBias);
      const sp = rnd(speed[0], speed[1]) * spread;
      const vel = new THREE.Vector3(
        Math.cos(theta) * Math.sin(phi) * sp,
        Math.cos(phi) * sp * 1.3 + upBias,
        Math.sin(theta) * Math.sin(phi) * sp
      );
      const l = rnd(life[0], life[1]);
      this.particles.push({ sprite: spr, vel, life: l, max: l, grav });
    }
  }

  // --- combat feedback (Resolver event -> particles) ---
  onResolverEvent(e) {
    const pos = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
    const bloodColor = e.def?.name === 'rival' ? 0x8a1030 : 0xc21c2c;   // ichor vs blood
    if (e.type === 'hit') {
      const big = e.kind !== 'light';
      this._spawn(pos, {
        color: big ? 0xffd24d : 0xffffff, count: big ? 14 : 8,
        speed: big ? [2, 6] : [1, 3.5], size: big ? [0.1, 0.28] : [0.06, 0.16],
        life: [0.2, 0.45],
      });
      this._spawnBlood(pos, bloodColor, big ? 16 : 8);
    } else if (e.type === 'blocked') {
      this._spawn(pos, { color: 0xffd24d, count: e.broke ? 16 : 9, speed: [2, 5], size: [0.08, 0.2], life: [0.2, 0.4] });
    } else if (e.type === 'parried') {
      this._spawn(pos, { color: 0x4dffb8, count: 20, speed: [3, 7], size: [0.1, 0.24], life: [0.25, 0.5], upBias: 1 });
    } else if (e.type === 'dodged') {
      this._spawn(pos, { color: 0x8a8aa5, count: 5, speed: [0.5, 1.5], size: [0.05, 0.1], life: [0.2, 0.35] });
    }
  }

  _spawnBlood(pos, color, count) {
    this._spawn(pos, {
      color, count, speed: [1.5, 5], size: [0.05, 0.14], life: [0.4, 0.9],
      grav: GRAVITY * 1.6, tex: bloodBlob,
    });
    // a couple of droplets get tracked to land as permanent ground decals
    for (let i = 0; i < Math.min(3, count); i++) {
      const vel = new THREE.Vector3(rnd(-2, 2), rnd(2, 4), rnd(-2, 2));
      this.particles.push({
        sprite: null, decalDrop: true, decalColor: color,
        pos: pos.clone(), vel, life: 2, max: 2, grav: GRAVITY * 1.6,
      });
    }
  }

  addDecal(pos, color) {
    const size = rnd(0.3, 0.7);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: bloodBlob, color, transparent: true, opacity: 0.65,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rnd(0, Math.PI * 2);
    mesh.position.set(pos.x, 0.015, pos.z);
    this.decalGroup.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > DECAL_CAP) {
      this.decalGroup.remove(this.decals.shift());
    }
  }

  // --- movement feedback ---
  spawnDodgeDust(pos) {
    this._spawn(pos, { color: 0xaaaacc, count: 6, speed: [0.5, 1.5], size: [0.12, 0.24], life: [0.3, 0.5], upBias: 0.15 });
  }
  spawnLandingDust(pos) {
    this._spawn(pos, { color: 0x9a9ab5, count: 8, speed: [0.4, 1.4], size: [0.14, 0.3], life: [0.3, 0.55], upBias: 0.1 });
  }
  spawnFootDust(pos) {
    this._spawn(pos, { color: 0x8a8aa0, count: 2, speed: [0.1, 0.4], size: [0.06, 0.12], life: [0.2, 0.35], upBias: 0.05 });
  }
  spawnChargeSparkle(pos, color) {
    this._spawn(pos, { color, count: 2, speed: [0.2, 0.6], size: [0.05, 0.1], life: [0.15, 0.3], upBias: 0.3 });
  }

  // a handful of slow-drifting motes for atmosphere — cheap, always-on
  spawnAmbient(count = 35, bounds = { x: 45, z: 55, y: 6 }) {
    this.ambient = [];
    const mat = spriteMat(softDot, 0x8a8aa5, 0.18);
    for (let i = 0; i < count; i++) {
      const spr = new THREE.Sprite(mat.clone());
      const s = rnd(0.04, 0.1);
      spr.scale.set(s, s, s);
      spr.position.set(rnd(-bounds.x, bounds.x), rnd(0.3, bounds.y), rnd(-bounds.z, bounds.z - 30));
      this.scene.add(spr);
      this.ambient.push({ sprite: spr, phase: rnd(0, 10), speed: rnd(0.05, 0.15) });
    }
  }

  _updateAmbient(t) {
    if (!this.ambient) return;
    for (const a of this.ambient) {
      a.sprite.position.y += Math.sin(t * a.speed + a.phase) * 0.002;
      a.sprite.position.x += Math.cos(t * a.speed * 0.7 + a.phase) * 0.003;
    }
  }

  update(dt, t = 0) {
    this._updateAmbient(t);
    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= p.grav * dt;
      if (p.decalDrop) {
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y <= 0 || p.life <= 0) {
          if (p.pos.y <= 0) this.addDecal(p.pos, p.decalColor);
          p.dead = true;
        }
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      const t = Math.max(0, p.life / p.max);
      p.sprite.material.opacity = t;
      if (p.life <= 0 || p.sprite.position.y < -0.5) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        p.dead = true;
      }
    }
    this.particles = this.particles.filter(p => !p.dead);
  }
}
