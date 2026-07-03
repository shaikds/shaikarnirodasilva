// PlayerController: turns Input + camera orientation into a Fighter intent.
// The rival's GOAP agent is the other intent producer — same Fighter API.

import { CAMERA } from '../core/tuning.js';

export class PlayerController {
  constructor(fighter, input, rig) {
    this.fighter = fighter;
    this.input = input;
    this.rig = rig;
  }

  update(dt) {
    const f = this.fighter, inp = this.input, rig = this.rig;
    const axes = inp.moveAxes();

    // camera-relative move (AC-4.1.1); normalize diagonals
    const len = Math.hypot(axes.x, axes.z) || 1;
    const nx = axes.x / len, nz = axes.z / len;
    // ground-plane camera basis: forward = pivot - camera = (-sinY, -cosY),
    // right = forward × up = (cosY, -sinY)
    const sin = Math.sin(rig.yaw), cos = Math.cos(rig.yaw);
    f.intent.move.x = (-sin * nz) + (cos * nx);
    f.intent.move.z = (-cos * nz) + (-sin * nx);

    // facing: locked fighters square up to the target (AC-4.1.2)
    f.intent.face = rig.lockTarget ? f.yawTo(rig.lockTarget) : null;

    // buffered discrete actions (AC-4.6.1): consumed when actionable
    if (!f.busy) {
      if (inp.consume('jump')) f.intent.jump = true;
      if (inp.consume('dodge')) f.intent.dodge = true;
    }
    if (inp.consume('lock', 0.05)) this.rig.toggleLock(this.candidates || []);

    // camera orbit input: pointer-lock mouse or arrow keys
    const md = inp.takeMouseDelta();
    const orbit = {
      x: md.x * CAMERA.mouseSens +
         ((inp.down.camR ? 1 : 0) - (inp.down.camL ? 1 : 0)) * CAMERA.orbitSpeed * dt,
      y: -md.y * CAMERA.mouseSens +
         ((inp.down.camU ? 1 : 0) - (inp.down.camD ? 1 : 0)) * CAMERA.orbitSpeed * 0.6 * dt,
    };
    this._orbit = orbit;
  }

  orbitInput() { return this._orbit || { x: 0, y: 0 }; }
}
