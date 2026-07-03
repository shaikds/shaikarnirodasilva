// Special-attack projectiles (FR-4.4): aimed at fire time (a read, not a
// tracker), resolved through the same Resolver rulebook as melee — so
// block/parry/dodge all work identically for both fighters (AC-4.4.3).

import * as THREE from 'three';
import { ATTACKS } from './attacks.js';

const LIFETIME = 3.0;

export class Projectiles {
  constructor({ scene, resolver, zone }) {
    this.scene = scene;
    this.resolver = resolver;
    this.zone = zone;
    this.list = [];
  }

  fire(owner, target) {
    const def = ATTACKS.special;
    const from = new THREE.Vector3(
      owner.pos.x + Math.sin(owner.yaw) * 0.7,
      owner.pos.y + 1.3,
      owner.pos.z + Math.cos(owner.yaw) * 0.7
    );
    const at = new THREE.Vector3(target.pos.x, target.pos.y + 1.1, target.pos.z);
    const vel = at.sub(from).normalize().multiplyScalar(def.projectile.speed);

    const color = owner.baseColor?.getHex() ?? 0xffffff;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(def.projectile.radius, 10, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(def.projectile.radius * 1.8, 10, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
    );
    mesh.add(halo);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.list.push({ owner, mesh, vel, t: 0, def });
  }

  update(dt, fighters) {
    for (const p of this.list) {
      p.t += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;

      // fighter hits (never the owner)
      for (const f of fighters) {
        if (f === p.owner || !f.alive) continue;
        const dx = f.pos.x - pos.x, dz = f.pos.z - pos.z;
        const dy = (f.pos.y + 1.0) - pos.y;
        if (Math.hypot(dx, dz) < p.def.projectile.radius + f.radius &&
            Math.abs(dy) < 1.3) {
          const d = Math.hypot(dx, dz) || 1;
          this.resolver.strike(p.owner, f, p.def, { x: dx / d, z: dz / d });
          p.dead = true;
          break;
        }
      }
      // world: walls or lifetime
      if (!p.dead) {
        const probe = pos.clone();
        if (this.zone.collide(probe, p.def.projectile.radius, 0.1) ||
            p.t > LIFETIME || pos.y < 0 || pos.y > 12) {
          p.dead = true;
        }
      }
      if (p.dead) this.scene.remove(p.mesh);
    }
    this.list = this.list.filter(p => !p.dead);
  }
}
