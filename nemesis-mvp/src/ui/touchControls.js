// Touch controls (FR-11.2): a virtual joystick, a camera-drag zone, and
// on-screen action buttons — driving the EXACT same Input state a
// keyboard/mouse would (Input.press/release, Input.touchAxes). No
// separate code path in PlayerController: one rulebook, two producers,
// same discipline as the rival's GOAP-vs-Jev drivers (NFR-4).

import { TOUCH } from '../core/tuning.js';

const CSS = `
.touchctl { position: fixed; inset: 0; z-index: 15; touch-action: none; }
.touchctl .lookzone { position: absolute; inset: 0; }
.touchctl .stick {
  position: fixed; left: 22px; bottom: 26px; width: 108px; height: 108px;
  border: 2px solid rgba(216,216,232,0.35); border-radius: 50%;
  background: rgba(20,20,36,0.35); z-index: 17;
}
.touchctl .knob {
  position: absolute; left: 50%; top: 50%; width: 48px; height: 48px;
  margin: -24px 0 0 -24px; border-radius: 50%;
  background: rgba(216,216,232,0.5); border: 1px solid rgba(255,255,255,0.4);
}
.touchctl .vpair {
  position: fixed; left: 138px; bottom: 150px; z-index: 17;
  display: flex; flex-direction: column; gap: 6px;
}
.touchctl .btn {
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 1px solid rgba(216,216,232,0.4);
  background: rgba(20,20,36,0.55); color: #dfe3ff;
  font: bold 11px 'Courier New', monospace; letter-spacing: 0.5px;
  user-select: none; z-index: 17;
}
.touchctl .btn.active { background: rgba(255,210,77,0.35); border-color: var(--gold,#ffd24d); }
.touchctl .btn.small { width: 46px; height: 46px; font-size: 9px; }
.touchctl .btn.big { width: 68px; height: 68px; font-size: 11px; }
.touchctl .primary {
  position: fixed; right: 18px; bottom: 24px; z-index: 17;
  display: grid; grid-template-columns: repeat(2, 68px); gap: 10px;
}
.touchctl .secondary {
  position: fixed; right: 20px; bottom: 168px; z-index: 17;
  display: grid; grid-template-columns: repeat(2, 46px); gap: 8px;
}
.touchctl .lockbtn { position: fixed; right: 24px; top: 110px; z-index: 17; }
`;

// [action, label, size] — hold vs tap doesn't need distinguishing here:
// press-on-start/release-on-end is correct for both (FR-11.2.3)
const PRIMARY = [['light', 'LIGHT', 'big'], ['heavy', 'HEAVY\n(hold)', 'big'],
  ['block', 'BLOCK\n(hold)', 'big'], ['dodge', 'DODGE', 'big']];
const SECONDARY = [['special', 'BEAM', 'small'], ['ki', 'KI\n(hold)', 'small'],
  ['dash', 'DASH\n(hold)', 'small'], ['flight', 'FLY', 'small']];

export class TouchControls {
  constructor({ input }) {
    this.input = input;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'touchctl';
    this.el.innerHTML = `
      <div class="lookzone"></div>
      <div class="stick"><div class="knob"></div></div>
      <div class="vpair">
        <div class="btn small" data-a="jump">▲</div>
        <div class="btn small" data-a="descend">▼</div>
      </div>
      <div class="primary">${PRIMARY.map(([a, l, s]) =>
        `<div class="btn ${s}" data-a="${a}">${l}</div>`).join('')}</div>
      <div class="secondary">${SECONDARY.map(([a, l, s]) =>
        `<div class="btn ${s}" data-a="${a}">${l}</div>`).join('')}</div>
      <div class="btn small lockbtn" data-a="lock">LOCK</div>`;
    document.body.appendChild(this.el);

    this._wireButtons();
    this._wireJoystick();
    this._wireLookZone();
  }

  _wireButtons() {
    for (const el of this.el.querySelectorAll('.btn[data-a]')) {
      const a = el.dataset.a;
      const start = e => { e.preventDefault(); this.input.press(a); el.classList.add('active'); };
      const end = e => { e.preventDefault(); this.input.release(a); el.classList.remove('active'); };
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
    }
  }

  _wireJoystick() {
    const stick = this.el.querySelector('.stick');
    const knob = this.el.querySelector('.knob');
    const R = TOUCH.joystickRadius;
    let id = null, cx = 0, cy = 0;
    const start = e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e);
    };
    const move = e => {
      e.preventDefault();
      const t = [...e.changedTouches].find(t => t.identifier === id);
      if (!t) return;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.touchAxes = { x: dx / R, z: -dy / R };
    };
    const end = e => {
      e.preventDefault();
      if (![...e.changedTouches].some(t => t.identifier === id)) return;
      id = null;
      knob.style.transform = '';
      this.input.touchAxes = null;
    };
    stick.addEventListener('touchstart', start, { passive: false });
    stick.addEventListener('touchmove', move, { passive: false });
    stick.addEventListener('touchend', end, { passive: false });
    stick.addEventListener('touchcancel', end, { passive: false });
  }

  // drag anywhere on the look zone to orbit the camera — the touch
  // equivalent of pointer-lock mouselook (FR-11.2.2), feeding the SAME
  // mouseDX/mouseDY the controller already reads via takeMouseDelta()
  _wireLookZone() {
    const zone = this.el.querySelector('.lookzone');
    let id = null, lx = 0, ly = 0;
    const start = e => {
      const t = e.changedTouches[0];
      id = t.identifier; lx = t.clientX; ly = t.clientY;
    };
    const move = e => {
      const t = [...e.changedTouches].find(t => t.identifier === id);
      if (!t) return;
      e.preventDefault();
      const dx = t.clientX - lx, dy = t.clientY - ly;
      lx = t.clientX; ly = t.clientY;
      // touch drag deltas are already comparable in magnitude to raw
      // mouse movementX/Y, so this reuses CAMERA.mouseSens downstream
      // (via takeMouseDelta) with a small extra multiplier (TOUCH.lookSens)
      this.input.mouseDX += dx * TOUCH.lookSens;
      this.input.mouseDY += dy * TOUCH.lookSens;
    };
    const end = e => {
      if (![...e.changedTouches].some(t => t.identifier === id)) return;
      id = null;
    };
    zone.addEventListener('touchstart', start, { passive: true });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end, { passive: true });
    zone.addEventListener('touchcancel', end, { passive: true });
  }
}
