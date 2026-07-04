// The zone: named locations + static colliders, blockout geometry generated
// from data (FR-5.1). P1 ships the arena slice; P5 completes the zone.

import * as THREE from 'three';
import { makeFloorTexture } from '../fx/textures.js';

// Axis-aligned wall/prop boxes: [cx, cy, cz, sx, sy, sz, colorHex?]
// The arena is a 24x24 court with 3m walls and one (future) gate gap north.
const ARENA = { x: 0, z: 0, size: 24, wallH: 3, wallT: 1 };

function arenaBoxes() {
  const { x, z, size, wallH, wallT } = ARENA;
  const h = size / 2, w = wallH / 2;
  return [
    // south wall (solid)
    [x, w, z + h + wallT / 2, size + wallT * 2, wallH, wallT],
    // north wall split by a 4m gate gap (escape route, gated until FR-1.3)
    [x - (size / 4 + 1), w, z - h - wallT / 2, size / 2 - 2, wallH, wallT],
    [x + (size / 4 + 1), w, z - h - wallT / 2, size / 2 - 2, wallH, wallT],
    // east / west walls
    [x + h + wallT / 2, w, z, wallT, wallH, size + wallT * 2],
    [x - h - wallT / 2, w, z, wallT, wallH, size + wallT * 2],
    // corner pillars for camera-probe interest
    [x + h - 1.5, 1.25, z + h - 1.5, 1.2, 2.5, 1.2],
    [x - h + 1.5, 1.25, z + h - 1.5, 1.2, 2.5, 1.2],
  ];
}

// full zone (FR-5.1): six connected locations around the arena.
// bounds: x ∈ [-50, 50], z ∈ [-52, 20]
const WALLS = [
  // outer boundary
  [0, 1.5, 20.5, 102, 3, 1], [0, 1.5, -52.5, 102, 3, 1],
  [-50.5, 1.5, -16, 1, 3, 74], [50.5, 1.5, -16, 1, 3, 74],
  // tutorial pocket room at (-38,-2), door on the east side (z -4..0)
  [-38, 1.5, -9, 14, 3, 1], [-38, 1.5, 5, 14, 3, 1],
  [-45.5, 1.5, -2, 1, 3, 15],
  [-31, 1.5, -6.75, 1, 3, 5.5], [-31, 1.5, 2.75, 1, 3, 5.5],
  // chokepoint corridor (west route), gap ~4m
  [-30.5, 1.5, -29, 1, 3, 18], [-25.5, 1.5, -29, 1, 3, 18],
  // open-ground pillars
  [-8, 1.25, -28, 1.5, 2.5, 1.5], [8, 1.25, -34, 1.5, 2.5, 1.5],
  // rival base pillars
  [27, 1.5, -45, 1.2, 3, 1.2], [33, 1.5, -45, 1.2, 3, 1.2], [30, 1.5, -39, 1.2, 3, 1.2],
];

export class Zone {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];         // {min:Vector3, max:Vector3}
    this.locations = {
      arena: new THREE.Vector3(ARENA.x, 0, ARENA.z),
      arenaGate: new THREE.Vector3(ARENA.x, 0, ARENA.z - ARENA.size / 2 - 1),
      tutorialPocket: new THREE.Vector3(-38, 0, -2),
      openGround: new THREE.Vector3(0, 0, -30),
      chokepoint: new THREE.Vector3(-28, 0, -29),
      rivalBase: new THREE.Vector3(30, 0, -42),
      escapeRoute: new THREE.Vector3(0, 0, -21),
    };
    this.gate = null;            // FR-1.3 gate blocker, openable
    this._build();
  }

  _addBox([cx, cy, cz, sx, sy, sz, color = 0x1c1c33], { emissive = 0x000000, visible = true } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.85, metalness: 0.05 })
    );
    mesh.position.set(cx, cy, cz);
    mesh.visible = visible;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const collider = {
      min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
      mesh,
    };
    this.colliders.push(collider);
    return collider;
  }

  _build() {
    // ground — textured (procedural checker+grid) so distance/spacing reads
    // at a glance, and shadow-catching so fighters + walls ground visually
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(120, 1, 120),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeFloorTexture(), roughness: 0.95 })
    );
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    for (const b of arenaBoxes()) this._addBox(b);
    for (const b of WALLS) this._addBox(b);

    // gate blocker across the north gap — closed during First Blood
    this.gate = this._addBox(
      [ARENA.x, ARENA.wallH / 2, ARENA.z - ARENA.size / 2 - 0.5, 4.2, ARENA.wallH, 1, 0x552233],
      { emissive: 0x330a14 }
    );

    // escape-route strip + rival base pad (visual markers, no collision)
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.04, 14),
      new THREE.MeshBasicMaterial({ color: 0x552233 })
    );
    strip.position.set(0, 0.02, -21);
    this.scene.add(strip);
    this.escapeStrip = strip;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.06, 7),
      new THREE.MeshBasicMaterial({ color: 0x38101a })
    );
    pad.position.set(30, 0.03, -42);
    this.scene.add(pad);
  }

  setGateOpen(open) {
    this.gate.mesh.visible = !open;
    this.gate.disabled = open;
  }

  // resolve a capsule (cylinder) of radius r at pos (feet) against colliders.
  // Mutates pos. Returns true if any contact happened.
  collide(pos, r, height) {
    let touched = false;
    for (const c of this.colliders) {
      if (c.disabled) continue;
      if (pos.y + height < c.min.y || pos.y > c.max.y) continue;
      // closest point on AABB footprint to center
      const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
      const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      touched = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        // center inside the box: push out along smallest penetration axis
        const px = Math.min(pos.x - c.min.x + r, c.max.x - pos.x + r);
        const pz = Math.min(pos.z - c.min.z + r, c.max.z - pos.z + r);
        if (px < pz) pos.x += (pos.x - (c.min.x + c.max.x) / 2 > 0 ? px : -px);
        else pos.z += (pos.z - (c.min.z + c.max.z) / 2 > 0 ? pz : -pz);
      }
    }
    return touched;
  }

  // camera obstruction probe: march from `from` toward `to`, return first
  // safe point before entering a collider (with margin)
  cameraProbe(from, to, margin = 0.25) {
    const steps = 24;
    const p = from.clone();
    const d = to.clone().sub(from).divideScalar(steps);
    let last = from.clone();
    for (let i = 1; i <= steps; i++) {
      p.add(d);
      for (const c of this.colliders) {
        if (c.disabled) continue;
        if (p.x > c.min.x - margin && p.x < c.max.x + margin &&
            p.y > c.min.y - margin && p.y < c.max.y + margin &&
            p.z > c.min.z - margin && p.z < c.max.z + margin) {
          return last;
        }
      }
      last.copy(p);
    }
    return to.clone();
  }
}
