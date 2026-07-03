// Fighter: the single combat rulebook shared by player and rival.
// P1 scope: kinematics — move, jump, dodge (i-frames), facing, collision.
// P2 adds attack/block/parry/stagger states on top of this state machine.
//
// A Fighter consumes an INTENT each tick:
//   { move: {x, z} world-space desire, face: yaw|null, jump: bool,
//     dodge: bool, ... }
// Producers: PlayerController (input+camera) and RivalAgent (GOAP).

import * as THREE from 'three';
import { MOVE } from '../core/tuning.js';

export class Fighter {
  constructor({ scene, color = 0x4db8ff, emissive = 0x0a2438, pos = [0, 0, 0], name = 'fighter' }) {
    this.name = name;
    this.pos = new THREE.Vector3(...pos);
    this.prevPos = this.pos.clone();
    this.vy = 0;
    this.yaw = 0;                       // facing
    this.hp = 100; this.maxHp = 100;
    this.energy = 30;
    this.state = 'idle';                // idle|dodge (P2: +attack|block|stagger|hitstun|dead)
    this.stateT = 0;                    // seconds left in state
    this.iframeT = 0;
    this.dodgeCd = 0;
    this.grounded = true;
    this.dodgeVec = new THREE.Vector2();
    this.radius = MOVE.radius;
    this.height = MOVE.height;
    this.intent = { move: { x: 0, z: 0 }, face: null, jump: false, dodge: false };

    // blockout body: capsule + head, grouped so tags/poses attach later
    this.mesh = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, emissive });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 6, 12), mat);
    this.body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mat.clone());
    head.position.y = 1.72;
    // nose marker so facing reads at a glance in blockout
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    nose.position.set(0, 1.72, 0.3);
    this.mesh.add(this.body, head, nose);
    scene.add(this.mesh);
    this.syncMesh(1);
  }

  get busy() { return this.state === 'dodge'; }          // P2 extends
  get invulnerable() { return this.iframeT > 0; }
  get alive() { return this.hp > 0; }

  startDodge(dirX, dirZ) {
    if (this.busy || this.dodgeCd > 0 || !this.grounded) return false;
    this.state = 'dodge';
    this.stateT = MOVE.dodge.dur;
    this.iframeT = MOVE.dodge.iframes;
    this.dodgeCd = MOVE.dodge.cooldown;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.01) this.dodgeVec.set(dirX / len, dirZ / len);
    else this.dodgeVec.set(-Math.sin(this.yaw), -Math.cos(this.yaw)); // backstep
    return true;
  }

  update(dt, zone) {
    this.prevPos.copy(this.pos);
    this.iframeT = Math.max(0, this.iframeT - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    const it = this.intent;

    // --- state machine (movement portion) ---
    if (this.state === 'dodge') {
      const speed = MOVE.dodge.dist / MOVE.dodge.dur;
      this.pos.x += this.dodgeVec.x * speed * dt;
      this.pos.z += this.dodgeVec.y * speed * dt;
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'idle';
    } else if (this.state === 'idle') {
      if (it.dodge) { it.dodge = false; this.startDodge(it.move.x, it.move.z); }
      if (this.state === 'idle') {
        const ctl = this.grounded ? 1 : MOVE.airCtl;
        this.pos.x += it.move.x * MOVE.speed * ctl * dt;
        this.pos.z += it.move.z * MOVE.speed * ctl * dt;
        if (it.jump && this.grounded) { this.vy = MOVE.jumpV; this.grounded = false; }
        it.jump = false;

        // facing: explicit (lock-on) or toward movement, smoothed
        let targetYaw = null;
        if (it.face != null) targetYaw = it.face;
        else if (Math.hypot(it.move.x, it.move.z) > 0.05) {
          targetYaw = Math.atan2(it.move.x, it.move.z);
        }
        if (targetYaw != null) {
          let d = targetYaw - this.yaw;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          this.yaw += d * Math.min(1, MOVE.turnRate * dt);
        }
      }
    }

    // --- vertical physics ---
    if (!this.grounded) {
      this.vy -= MOVE.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    }

    // --- world collision ---
    zone.collide(this.pos, this.radius, this.height);
  }

  syncMesh(alpha) {
    this.mesh.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.mesh.rotation.y = this.yaw;
    // readable dodge tell: lean the body into the roll
    this.body.rotation.x = this.state === 'dodge'
      ? (1 - this.stateT / MOVE.dodge.dur) * Math.PI * 0.12 : 0;
  }

  distanceTo(other) {
    const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
    return Math.hypot(dx, dz);
  }
  yawTo(other) {
    return Math.atan2(other.pos.x - this.pos.x, other.pos.z - this.pos.z);
  }
}
