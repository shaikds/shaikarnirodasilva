// Third-person camera rig: orbit + follow, lock-on framing, obstruction
// probe, impulse/shake budget (FR-4.1, AC-4.6.4).

import * as THREE from 'three';
import { CAMERA } from '../core/tuning.js';

export class CameraRig {
  constructor(camera, target, zone) {
    this.camera = camera;
    this.target = target;              // Fighter to follow
    this.zone = zone;
    this.yaw = 0;                      // camera south of fighter, looking north (-z)
    this.pitch = 0.35;
    this.lockTarget = null;
    this._lostLock = null;             // {target, t} for soft re-acquire
    this._pos = new THREE.Vector3();
    this._impulse = new THREE.Vector3();
    this._shake = 0;
    this._first = true;
  }

  toggleLock(candidates) {
    if (this.lockTarget) { this._dropLock(false); return null; }
    let best = null, bestD = CAMERA.lockRange;
    for (const c of candidates) {
      if (!c.alive) continue;
      const d = this.target.distanceTo(c);
      if (d < bestD) { best = c; bestD = d; }
    }
    this.lockTarget = best;
    return best;
  }

  _dropLock(byRange) {
    this._lostLock = byRange && this.lockTarget
      ? { target: this.lockTarget, t: CAMERA.reacquireWindow } : null;
    this.lockTarget = null;
  }

  impulse(x, y, z) { this._impulse.set(x, y, z); }
  shake(amount) { this._shake = Math.max(this._shake, amount); }

  update(dt, orbitInput = { x: 0, y: 0 }) {
    // lock maintenance (AC-4.1.2)
    if (this.lockTarget) {
      if (!this.lockTarget.alive) this._dropLock(false);
      else if (this.target.distanceTo(this.lockTarget) > CAMERA.lockRange) this._dropLock(true);
    } else if (this._lostLock) {
      this._lostLock.t -= dt;
      if (this._lostLock.t <= 0) this._lostLock = null;
      else if (this._lostLock.target.alive &&
               this.target.distanceTo(this._lostLock.target) <= CAMERA.lockRange) {
        this.lockTarget = this._lostLock.target;   // soft re-acquire
        this._lostLock = null;
      }
    }

    // orbit
    this.yaw -= orbitInput.x;
    this.pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, this.pitch + orbitInput.y));
    if (this.lockTarget) {
      // ease behind the player relative to the target so both stay framed
      const want = this.target.yawTo(this.lockTarget) + Math.PI;
      let d = want - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yaw += d * Math.min(1, 4 * dt);
    }

    // desired position on the orbit sphere
    const pivot = this.target.mesh.position.clone();
    pivot.y += CAMERA.heightOffset;
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(CAMERA.dist);
    let want = pivot.clone().add(off);
    want.y = Math.max(0.3, want.y);
    want = this.zone.cameraProbe(pivot, want);     // pull in on obstruction

    if (this._first) { this._pos.copy(want); this._first = false; }
    else this._pos.lerp(want, Math.min(1, CAMERA.followLerp * dt));

    // impulse decay + shake
    this._impulse.multiplyScalar(Math.exp(-8 * dt));
    this._shake = Math.max(0, this._shake - 6 * dt * this._shake - 0.01);
    const jitter = this._shake > 0.001
      ? new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this._shake)
      : new THREE.Vector3();

    this.camera.position.copy(this._pos).add(this._impulse).add(jitter);

    // look: midpoint-weighted when locked so both fighters stay in frame
    const lookAt = this.lockTarget
      ? pivot.clone().lerp(this.lockTarget.mesh.position.clone().setY(this.lockTarget.mesh.position.y + 1.2), 0.35)
      : pivot;
    this.camera.lookAt(lookAt);
  }
}
