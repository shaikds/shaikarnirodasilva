// Fixed-timestep simulation loop with interpolated render.
// Owns the two global time channels combat feel depends on:
//   - hitstop  (freeze): sim fully pauses, render continues (AC-4.6.3)
//   - slow-mo: sim advances at a reduced time scale (AC-4.5.2, single channel)

export class Loop {
  constructor({ hz = 120, update, render }) {
    this.step = 1 / hz;
    this.updateFn = update;
    this.renderFn = render;
    this.ticks = 0;
    this.simTime = 0;
    this.fps = 60;
    this.hitstopMs = 0;
    this.slowmoMs = 0;
    this.slowmoFactor = 0.35;
    this.running = false;
    this._acc = 0;
    this._last = 0;
    this._frame = this._frame.bind(this);
  }

  hitstop(ms) { this.hitstopMs = Math.max(this.hitstopMs, ms); }

  // single channel: a slow-mo beat cannot stack or retrigger during itself
  slowmo(ms, factor = 0.35) {
    if (this.slowmoMs > 0) return false;
    this.slowmoMs = ms;
    this.slowmoFactor = factor;
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._frame);
  }
  stop() { this.running = false; }

  _frame(now) {
    if (!this.running) return;
    // Clamp bounds how much wall-clock time a single slow frame can convert
    // to sim time — high enough that a genuinely slow renderer (weak GPU,
    // software rendering, a background dev-tools repaint) still advances
    // gameplay at real speed instead of silently losing time, but bounded
    // so a multi-second tab-switch away doesn't spiral into a huge catch-up.
    const CLAMP_MS = 300;
    let realMs = Math.min(now - this._last, CLAMP_MS);
    this._last = now;
    if (realMs > 0) this.fps += ((1000 / realMs) - this.fps) * 0.05;

    if (this.hitstopMs > 0) {
      this.hitstopMs -= realMs;
    } else {
      let scale = 1;
      if (this.slowmoMs > 0) {
        scale = this.slowmoFactor;
        this.slowmoMs -= realMs;
      }
      this._acc += (realMs / 1000) * scale;
      let guard = Math.ceil(CLAMP_MS / (this.step * 1000)) + 2;  // covers the clamp window
      while (this._acc >= this.step && guard-- > 0) {
        this.updateFn(this.step);
        this._acc -= this.step;
        this.ticks++;
        this.simTime += this.step;
      }
    }
    this.renderFn(this._acc / this.step);
    requestAnimationFrame(this._frame);
  }
}
