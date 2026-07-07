// Procedural SFX — WebAudio synthesis, zero external assets (NFR-1).
// Every sound is an oscillator/noise burst with an envelope; the whole
// soundscape costs nothing to load and works offline. Master volume is
// deliberately modest. Autoplay policy: the context resumes on the first
// user gesture; everything is try/catch'd so headless tests never break.

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    const resume = () => {
      try { this._ac()?.resume(); } catch { /* stay silent */ }
    };
    addEventListener('keydown', resume, { once: false });
    addEventListener('mousedown', resume, { once: false });
  }

  _ac() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      } catch { this.enabled = false; return null; }
    }
    return this.ctx;
  }

  // tone: freq -> freqEnd over dur, with an exponential decay envelope
  _tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.1, vol = 0.5, delay = 0 }) {
    const ac = this._ac(); if (!ac) return;
    try {
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch { /* silent */ }
  }

  // filtered noise burst (impacts, whooshes)
  _noise({ dur = 0.1, vol = 0.4, filter = 1200, filterEnd = null, delay = 0 }) {
    const ac = this._ac(); if (!ac) return;
    try {
      const t0 = ac.currentTime + delay;
      const len = Math.max(1, (dur * ac.sampleRate) | 0);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filter, t0);
      if (filterEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(10, filterEnd), t0 + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0);
    } catch { /* silent */ }
  }

  // ---- the vocabulary ----
  hit(kind = 'light') {
    const heavy = kind !== 'light';
    this._noise({ dur: heavy ? 0.14 : 0.07, vol: heavy ? 0.6 : 0.4, filter: heavy ? 700 : 1100 });
    this._tone({ type: 'sine', freq: heavy ? 130 : 180, freqEnd: 50, dur: heavy ? 0.18 : 0.1, vol: heavy ? 0.7 : 0.45 });
  }
  blocked() {
    this._tone({ type: 'triangle', freq: 720, freqEnd: 500, dur: 0.06, vol: 0.35 });
    this._noise({ dur: 0.04, vol: 0.2, filter: 2400 });
  }
  parried() {
    this._tone({ type: 'sine', freq: 900, freqEnd: 1800, dur: 0.14, vol: 0.4 });
    this._tone({ type: 'sine', freq: 1350, freqEnd: 2400, dur: 0.12, vol: 0.25, delay: 0.03 });
  }
  ki() {
    this._tone({ type: 'square', freq: 850, freqEnd: 260, dur: 0.09, vol: 0.18 });
  }
  special() {
    this._tone({ type: 'sawtooth', freq: 160, freqEnd: 880, dur: 0.45, vol: 0.3 });
    this._noise({ dur: 0.45, vol: 0.15, filter: 400, filterEnd: 3200 });
  }
  dash() {
    this._noise({ dur: 0.28, vol: 0.3, filter: 300, filterEnd: 2600 });
  }
  fly() {
    this._noise({ dur: 0.35, vol: 0.22, filter: 500, filterEnd: 1800 });
    this._tone({ type: 'sine', freq: 220, freqEnd: 440, dur: 0.3, vol: 0.12 });
  }
  transform() {
    this._tone({ type: 'sawtooth', freq: 70, freqEnd: 420, dur: 0.9, vol: 0.4 });
    this._noise({ dur: 0.9, vol: 0.25, filter: 200, filterEnd: 4000 });
    this._tone({ type: 'sine', freq: 520, freqEnd: 1040, dur: 0.5, vol: 0.2, delay: 0.35 });
  }
  death() {
    this._tone({ type: 'sine', freq: 320, freqEnd: 38, dur: 0.7, vol: 0.5 });
    this._noise({ dur: 0.4, vol: 0.3, filter: 900, filterEnd: 120 });
  }
  taunt() {
    this._tone({ type: 'triangle', freq: 340, freqEnd: 300, dur: 0.05, vol: 0.2 });
    this._tone({ type: 'triangle', freq: 300, freqEnd: 260, dur: 0.05, vol: 0.18, delay: 0.07 });
  }
}
