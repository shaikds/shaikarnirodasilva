// PlayerProfile: the live statistical model of how the player fights
// (FR-3.3). Ported from nemesis-arena/game.js and adapted to 3D (meters,
// lock-on era). The rival reads this to mirror the player's style; the
// Profiler class does the observing.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class PlayerProfile {
  constructor(saved = null) {
    Object.assign(this, {
      lights: 0, heavies: 0, specials: 0, blocks: 0, dodges: 0,
      hits: 0, attacks: 0,
      defChances: 0, defTaken: 0,
      attackDist: 2.2,        // m, EMA of distance at attack start
      reaction: 400,          // ms, EMA from rival windup -> defensive action
      airPref: 0.1,           // EMA of airborne time
      comboFollowup: 0.4,     // press-after-hit tendency
      totalActions: 0,
      rounds: 0,
    }, saved || {});
  }

  ema(key, value, a = 0.15) { this[key] = lerp(this[key], value, a); }

  // --- derived style metrics (all 0..1) ---
  get lightShare()  { const t = this.lights + this.heavies; return t ? this.lights / t : 0.65; }
  get heavyPref()   { const t = this.lights + this.heavies; return t ? this.heavies / t : 0.35; }
  get dodgePref()   { const t = this.blocks + this.dodges;  return t ? this.dodges / t : 0.5; }
  get defenseRate() { return this.defChances ? clamp(this.defTaken / this.defChances, 0, 1) : 0.3; }
  get accuracy()    { return this.attacks ? this.hits / this.attacks : 0.5; }
  get specialPref() { return this.attacks ? clamp(this.specials / this.attacks, 0, 1) : 0.08; }
  get aggression() {
    const off = this.lights + this.heavies + this.specials;
    const def = this.blocks + this.dodges;
    return (off + def) ? off / (off + def) : 0.5;
  }
  get sync() {
    return clamp(this.totalActions / 80, 0, 0.7) + clamp(this.rounds / 10, 0, 0.3);
  }

  toJSON() {
    const o = {};
    for (const k of ['lights','heavies','specials','blocks','dodges','hits','attacks',
                     'defChances','defTaken','attackDist','reaction','airPref',
                     'comboFollowup','totalActions','rounds']) o[k] = this[k];
    return o;
  }
}

// Observes real fighters and fills the profile. Works for human input AND
// bot drivers because it watches Fighter actions/events, not the keyboard.
export class Profiler {
  constructor({ profile, player, rival, resolver }) {
    this.profile = profile;
    this.player = player;
    this.rival = rival;
    this.enabled = true;         // tests freeze observation to isolate mirroring
    this._windupAt = null;       // rival windup start (ms sim)
    this._windupDefended = false;
    this._followT = 0;           // press-after-hit window
    this._airAcc = 0;

    player.onAction = (action) => this.onPlayerAction(action);
    resolver.on(e => {
      if (e.type === 'hit' && e.att === player) {
        this.profile.hits++;
        this._followT = 0.8;
      }
    });
  }

  onPlayerAction(action) {
    if (!this.enabled) return;
    const p = this.profile;
    if (action === 'light' || action === 'heavy' || action === 'special') {
      p[action === 'light' ? 'lights' : action === 'heavy' ? 'heavies' : 'specials']++;
      p.attacks++; p.totalActions++;
      if (this.rival) p.ema('attackDist', this.player.distanceTo(this.rival));
      if (this._followT > 0) { p.ema('comboFollowup', 1, 0.2); this._followT = 0; }
    } else if (action === 'block' || action === 'dodge') {
      p[action === 'block' ? 'blocks' : 'dodges']++;
      p.totalActions++;
      if (this._windupAt != null && !this._windupDefended) {
        p.ema('reaction', clamp((this._nowMs ?? 0) - this._windupAt, 80, 900), 0.25);
        this._windupDefended = true;
        p.defTaken++;
      }
    }
  }

  update(dt, nowS) {
    if (!this.enabled) return;
    this._nowMs = nowS * 1000;
    const p = this.profile, r = this.rival;
    if (r) {
      const inWindup = r.state === 'attack' && r.phase === 'windup';
      if (inWindup && this._windupAt == null) {
        this._windupAt = this._nowMs;
        this._windupDefended = false;
        if (this.player.distanceTo(r) < 3.5) p.defChances++;
      } else if (!inWindup) {
        this._windupAt = null;
      }
    }
    if (this._followT > 0) {
      this._followT -= dt;
      if (this._followT <= 0) p.ema('comboFollowup', 0, 0.2);
    }
    // airborne sampling, cheap EMA every ~0.25s of accumulated dt
    this._airAcc += dt;
    if (this._airAcc >= 0.25) {
      p.ema('airPref', this.player.grounded ? 0 : 1, 0.04);
      this._airAcc = 0;
    }
  }
}
