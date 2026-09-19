// Action-mapped input with a timestamped buffer (AC-4.6.1).
// Discrete actions record the sim-time of their last press; consumers ask
// "was ACTION pressed within the buffer window?" at the moment they become
// able to act, which yields buffered execution with zero idle frames.

import { INPUT } from './tuning.js';

const KEYMAP = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyJ: 'light', KeyK: 'heavy', KeyL: 'special',
  KeyI: 'ki', KeyF: 'flight', KeyQ: 'dash', KeyC: 'descend',
  KeyB: 'block',                    // hold (keyboard alias for RMB)
  KeyH: 'help',                     // key-map overlay (FR-8.5)
  Tab: 'lock', KeyE: 'interact',
  Backquote: 'debug',
  ArrowLeft: 'camL', ArrowRight: 'camR', ArrowUp: 'camU', ArrowDown: 'camD',
};

export class Input {
  constructor(canvas) {
    this.down = {};                  // action -> bool
    this.pressT = {};                // action -> sim time of last press
    this.mouseDX = 0; this.mouseDY = 0;
    this.touchAxes = null;           // {x,z} set by TouchControls' joystick, else null
    this.simTime = () => 0;          // wired by main to loop.simTime

    addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) { this.down[a] = true; this.pressT[a] = this.simTime(); }
    });
    addEventListener('keyup', e => {
      const a = KEYMAP[e.code];
      if (a) this.down[a] = false;
    });

    if (canvas) {
      canvas.addEventListener('click', () => {
        // pointer lock is a desktop mouse-look concept; on a touch device
        // TouchControls drives the camera via a drag zone instead (FR-11.2)
        if (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0) return;
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.();
        }
      });
      addEventListener('mousemove', e => {
        if (document.pointerLockElement === canvas) {
          this.mouseDX += e.movementX; this.mouseDY += e.movementY;
        }
      });
      addEventListener('mousedown', e => {
        if (document.pointerLockElement !== canvas) return;
        const a = e.button === 0 ? 'light' : e.button === 2 ? 'block' : 'heavy';
        this.down[a] = true; this.pressT[a] = this.simTime();
      });
      addEventListener('mouseup', e => {
        if (e.button === 0) this.down.light = false;
        else if (e.button === 2) this.down.block = false;
        else this.down.heavy = false;
      });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
    }
  }

  // programmatic press/release (FR-11.2): TouchControls drives the exact
  // same state a keyboard would, through this instead of duplicating the
  // keydown/keyup logic above — one input pipeline, two producers.
  press(action) { this.down[action] = true; this.pressT[action] = this.simTime(); }
  release(action) { this.down[action] = false; }

  // camera-relative move vector (x=right, z=forward), unnormalized -1..1
  moveAxes() {
    if (this.touchAxes) return this.touchAxes;
    return {
      x: (this.down.right ? 1 : 0) - (this.down.left ? 1 : 0),
      z: (this.down.fwd ? 1 : 0) - (this.down.back ? 1 : 0),
    };
  }

  // was `action` pressed within the buffer window? consume it if so
  consume(action, windowS = INPUT.bufferMs / 1000) {
    const t = this.pressT[action];
    if (t == null) return false;
    if (this.simTime() - t <= windowS) { this.pressT[action] = -Infinity; return true; }
    return false;
  }

  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
}
