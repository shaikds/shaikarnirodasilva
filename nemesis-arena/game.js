/* ============================================================
   NEMESIS ARENA
   A combat game where your opponent learns to fight like YOU.

   The Nemesis:
   - Profiles your style: aggression, block/dodge habits, light
     vs heavy preference, special usage, air game, combo habits,
     spacing, reaction speed.
   - Mirrors that style back at you.
   - An ELO-style sync engine tunes its reaction time, mistake
     rate and aim so it always sits at YOUR skill level.
   - Remembers you between sessions (localStorage).
   ============================================================ */

'use strict';

// ---------- arena ----------
const W = 960, H = 480, FLOOR = 400, CEIL = 78;
const WALL_L = 36, WALL_R = W - 36;
const BODY_H = 130;

// ---------- movement ----------
const WALK_SPEED = 260;
const AIR_CTL = 0.85;
const GRAV = 1500;
const JUMP_V = -620;
const CLIMB_SPEED = 190, SLIDE_SPEED = 150, CEIL_SPEED = 200;
const WALLJUMP = { vx: 400, vy: -500 };

// ---------- combat ----------
const MAX_HP = 100;
const ATTACKS = {
  light:   { windup: 130, active: 90,  recover: 200, range: 78, dmg: 6,  knock: 90  },
  heavy:   { windup: 330, active: 110, recover: 340, range: 92, dmg: 14, knock: 220 },
  special: { windup: 480, active: 60,  recover: 280, range: 0,  dmg: 18, knock: 320 },
};
const DODGE = { dur: 280, iframes: 200, dist: 150 };
const HITSTUN = 260;
const BLOCK_REDUCE = { light: 0.85, heavy: 0.55, special: 0.5 };
const ENERGY_MAX = 100, SPECIAL_COST = 60, PROJ_SPEED = 620;
const COMBO_WINDOW = 1600;

// ---------- utilities ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pct = v => Math.round(v * 100) + '%';

// ============================================================
// Player profile — the data the Nemesis learns from
// ============================================================
class PlayerProfile {
  constructor() {
    const saved = localStorage.getItem('nemesis-profile');
    Object.assign(this, {
      lights: 0, heavies: 0, specials: 0, blocks: 0, dodges: 0,
      hits: 0, attacks: 0,
      defChances: 0, defTaken: 0,          // chances to defend vs actually defended
      attackDist: 120,                     // EMA of distance when attacking
      reaction: 400,                       // EMA ms from enemy windup -> defensive input
      moveBias: 0.5,                       // 0 = retreats, 1 = pushes forward
      airPref: 0.15,                       // EMA of time spent off the ground
      comboFollowup: 0.4,                  // do you press after landing a hit?
      totalActions: 0,
      rounds: 0,
    }, saved ? JSON.parse(saved) : {});
  }
  save() { localStorage.setItem('nemesis-profile', JSON.stringify(this)); }

  ema(key, value, a = 0.15) { this[key] = lerp(this[key], value, a); }

  // --- derived style metrics (all 0..1) ---
  get heavyPref()   { const t = this.lights + this.heavies; return t ? this.heavies / t : 0.35; }
  get dodgePref()   { const t = this.blocks + this.dodges;  return t ? this.dodges / t : 0.5; }
  get defenseRate() { return this.defChances ? clamp(this.defTaken / this.defChances, 0, 1) : 0.3; }
  get accuracy()    { return this.attacks ? this.hits / this.attacks : 0.5; }
  get specialPref() { return this.attacks ? clamp(this.specials / this.attacks, 0, 1) : 0.1; }
  get aggression() {
    const off = this.lights + this.heavies + this.specials, def = this.blocks + this.dodges;
    return (off + def) ? off / (off + def) : 0.5;
  }
  // How much the nemesis "knows" you: data volume + rounds fought
  get sync() {
    return clamp(this.totalActions / 80, 0, 0.7) + clamp(this.rounds / 10, 0, 0.3);
  }
}

// ============================================================
// Sync engine — keeps the fight always even (ELO-style)
// ============================================================
class SyncEngine {
  constructor() {
    const saved = localStorage.getItem('nemesis-rating');
    this.rating = saved ? +saved : 1000;
    this.wins = 0; this.losses = 0;
  }
  // skill 0..1 that the nemesis fights at — derived from YOUR rating
  get skill() { return clamp((this.rating - 700) / 700, 0.05, 1); }

  roundEnd(playerHp, nemesisHp) {
    const won = playerHp > 0;
    won ? this.wins++ : this.losses++;
    const margin = (playerHp - nemesisHp) / MAX_HP;      // -1..1
    const actual = (won ? 1 : 0) * 0.7 + (margin * 0.5 + 0.5) * 0.3;
    this.rating += 90 * (actual - 0.5);                  // expected score is always 0.5
    localStorage.setItem('nemesis-rating', this.rating.toFixed(0));
  }
}

// ============================================================
// Fighter
// ============================================================
class Fighter {
  constructor(x, color, facing) {
    this.x = x; this.y = FLOOR;
    this.vy = 0;
    this.color = color; this.facing = facing;
    this.hp = MAX_HP;
    this.energy = 30;
    this.state = 'idle';          // idle | attack | block | dodge | hitstun
    this.attackType = null;
    this.phase = null;            // windup | active | recover
    this.t = 0;
    this.vx = 0;                  // hitstun slide
    this.impulseVx = 0;           // wall-jump impulse
    this.cling = null;            // null | 'L' | 'R' | 'C'
    this.ctl = { move: 0, up: false, down: false };
    this.pendingShot = false;
    this.combo = 0; this.comboT = 0;
    this.hitLanded = false;
    this.anim = 0;
    this.flash = 0;
  }

  get grounded() { return this.y >= FLOOR - 0.5 && !this.cling; }
  get centerY()  { return this.cling === 'C' ? CEIL + BODY_H / 2 : this.y - BODY_H / 2; }
  get busy() { return this.state === 'attack' || this.state === 'dodge' || this.state === 'hitstun'; }
  get blocking() { return this.state === 'block'; }
  get invulnerable() { return this.state === 'dodge' && this.iframeT > 0; }

  startAttack(type) {
    if (this.busy) return false;
    if (type === 'special') {
      if (this.energy < SPECIAL_COST) return false;
      this.energy -= SPECIAL_COST;
    }
    const a = ATTACKS[type];
    this.state = 'attack'; this.attackType = type;
    this.phase = 'windup'; this.t = a.windup;
    this.hitLanded = false;
    return true;
  }
  startBlock() { if (!this.busy && !this.cling) this.state = 'block'; }
  stopBlock()  { if (this.state === 'block') this.state = 'idle'; }
  startDodge(dir) {
    if (this.busy || this.cling) return false;
    this.state = 'dodge'; this.t = DODGE.dur; this.iframeT = DODGE.iframes;
    this.vx = (dir || -this.facing) * (DODGE.dist / (DODGE.dur / 1000));
    return true;
  }
  jump() {
    if (this.grounded && !this.busy) { this.vy = JUMP_V; this.y -= 1; return true; }
    return false;
  }

  takeHit(dmg, knock, fromDir, type) {
    if (this.invulnerable) return 'dodged';
    this.energy = clamp(this.energy + 8, 0, ENERGY_MAX);
    if (this.blocking) {
      this.hp -= dmg * (1 - BLOCK_REDUCE[type]);
      this.x += fromDir * knock * 0.25;
      this.flash = 80;
      this.combo = 0;
      return 'blocked';
    }
    this.hp -= dmg;
    this.state = 'hitstun'; this.t = HITSTUN;
    this.phase = null;
    this.combo = 0;
    if (this.cling) { this.cling = null; this.vy = 60; }   // knocked off walls
    else { this.x += fromDir * knock * 0.35; }
    this.vx = fromDir * knock * 1.5;
    if (!this.grounded) this.vy = Math.min(this.vy, -140);  // aerial pop
    this.flash = 140;
    return 'hit';
  }

  update(dt) {
    const ms = dt * 1000;
    this.anim += ms;
    this.flash = Math.max(0, this.flash - ms);
    this.energy = clamp(this.energy + 3 * dt, 0, ENERGY_MAX);
    this.comboT -= ms;
    if (this.comboT <= 0) this.combo = 0;

    // ---- state timers ----
    if (this.state === 'attack') {
      this.t -= ms;
      if (this.t <= 0) {
        const a = ATTACKS[this.attackType];
        if (this.phase === 'windup') {
          this.phase = 'active'; this.t = a.active;
          if (this.attackType === 'special') this.pendingShot = true;
        }
        else if (this.phase === 'active') { this.phase = 'recover'; this.t = a.recover; }
        else { this.state = 'idle'; this.phase = null; }
      }
    } else if (this.state === 'dodge') {
      this.t -= ms; this.iframeT -= ms;
      this.x += this.vx * dt;
      if (this.t <= 0) { this.state = 'idle'; this.vx = 0; }
      this.x = clamp(this.x, WALL_L + 14, WALL_R - 14);
      return;                                    // air-dash: gravity paused
    } else if (this.state === 'hitstun') {
      this.t -= ms;
      this.x += this.vx * dt; this.vx *= 0.86;
      if (this.t <= 0) { this.state = 'idle'; this.vx = 0; }
    }

    // ---- traversal / physics ----
    const c = this.ctl;
    if (this.cling === 'C') {
      this.y = CEIL;                                     // feet hooked on ceiling
      if (this.state !== 'hitstun') this.x += c.move * CEIL_SPEED * dt;
      if (c.down) { this.cling = null; this.y = CEIL + BODY_H; this.vy = 0; }
    } else if (this.cling === 'L' || this.cling === 'R') {
      const wallX = this.cling === 'L' ? WALL_L + 14 : WALL_R - 14;
      const away = this.cling === 'L' ? 1 : -1;
      this.x = wallX;
      if (c.up)   this.y -= CLIMB_SPEED * dt;
      if (c.down) this.y += SLIDE_SPEED * dt;
      if (this.y <= CEIL + BODY_H) {                     // climbed to the top
        if (c.up) { this.cling = 'C'; this.y = CEIL; }
        else this.y = CEIL + BODY_H;
      }
      if (this.y >= FLOOR) { this.y = FLOOR; this.cling = null; }
      if (c.move === away && this.state !== 'hitstun') { // leap off the wall
        this.cling = null;
        this.vy = WALLJUMP.vy;
        this.impulseVx = away * WALLJUMP.vx;
      }
    } else {
      // free movement
      if (this.state === 'idle' || this.state === 'attack') {
        const ctlScale = this.state === 'attack' ? 0 : (this.grounded ? 1 : AIR_CTL);
        this.x += c.move * WALK_SPEED * ctlScale * dt;
      }
      this.x += this.impulseVx * dt;
      this.impulseVx *= Math.exp(-4 * dt);
      if (!this.grounded) {
        this.vy += GRAV * dt;
        this.y += this.vy * dt;
        if (this.y >= FLOOR) { this.y = FLOOR; this.vy = 0; this.impulseVx = 0; }
        if (this.y - BODY_H <= CEIL) {                   // head touches ceiling
          this.y = CEIL + BODY_H;
          if (c.up && this.state === 'idle') { this.cling = 'C'; this.y = CEIL; }
          this.vy = Math.max(this.vy, 0);
        }
        // grab a wall by pushing into it while airborne
        if (this.state === 'idle') {
          if (this.x <= WALL_L + 14 && c.move < 0) { this.cling = 'L'; this.vy = 0; }
          if (this.x >= WALL_R - 14 && c.move > 0) { this.cling = 'R'; this.vy = 0; }
        }
      }
    }
    this.x = clamp(this.x, WALL_L + 14, WALL_R - 14);
    this.y = clamp(this.y, CEIL, FLOOR);
  }
}

// ============================================================
// Nemesis AI — mirrors the player's style at matched skill
// ============================================================
class NemesisAI {
  constructor(fighter, profile, engine) {
    this.f = fighter; this.profile = profile; this.engine = engine;
    this.decideT = 0;
    this.plannedDefense = null;
    this.wallPlan = null;
    this.blockT = 0;
  }

  get reactionMs()  { return lerp(420, 130, this.engine.skill); }
  get mistakeRate() { return lerp(0.38, 0.06, this.engine.skill); }

  rubberBand(player) {
    const diff = (this.f.hp - player.hp) / MAX_HP;
    return clamp(this.engine.skill - diff * 0.25, 0.05, 1);
  }

  threatIncoming(player) {
    const f = this.f, dist = Math.abs(player.x - f.x);
    if (player.state === 'attack' && player.phase === 'windup' &&
        player.attackType !== 'special' &&
        dist < ATTACKS[player.attackType].range + 40 &&
        Math.abs(player.centerY - f.centerY) < 100) return true;
    for (const p of game.projectiles) {
      if (p.owner !== f && Math.sign(p.vx) === Math.sign(f.x - p.x) &&
          Math.abs(p.x - f.x) < 320 && Math.abs(p.y - f.centerY) < 90) return true;
    }
    return false;
  }

  think(dt, player) {
    const p = this.profile, f = this.f;
    const skill = this.rubberBand(player);
    const dist = Math.abs(player.x - f.x);
    const vdist = player.centerY - f.centerY;            // + means player lower
    const dir = Math.sign(player.x - f.x) || 1;
    f.facing = dir;

    // --- reactive defense: melee windups and incoming projectiles ---
    if (this.threatIncoming(player) && !f.busy && !this.plannedDefense) {
      if (Math.random() < p.defenseRate * lerp(0.6, 1.15, skill)) {
        this.plannedDefense = {
          in: p.reaction * lerp(1.4, 0.55, skill) * rnd(0.8, 1.2),
          move: Math.random() < p.dodgePref ? 'dodge' : 'block',
        };
      }
    }
    if (this.plannedDefense) {
      this.plannedDefense.in -= dt * 1000;
      if (this.plannedDefense.in <= 0) {
        const m = this.plannedDefense.move;
        if (m === 'dodge' && !f.cling) f.startDodge(-dir);
        else if (!f.cling) { f.startBlock(); this.blockT = rnd(300, 650); }
        this.plannedDefense = null;
        return;
      }
    }
    if (f.blocking) {
      this.blockT -= dt * 1000;
      if (this.blockT <= 0) f.stopBlock();
      return;
    }

    // --- wall/ceiling plan in progress ---
    if (this.wallPlan) {
      const w = this.wallPlan;
      w.t -= dt * 1000;
      f.ctl.move = w.dir; f.ctl.up = true; f.ctl.down = false;
      if (f.cling && f.cling !== 'C' && w.t < 350) {     // leap back at the player
        f.ctl.move = -w.dir;
        this.wallPlan = null;
      } else if (f.cling === 'C' || w.t <= 0) {
        this.wallPlan = null;
        f.ctl.up = false;
      }
      return;
    }
    // hanging on the ceiling: stalk from above, then drop on the player
    if (f.cling === 'C') {
      f.ctl.move = dist > 30 ? dir : 0;
      f.ctl.up = false;
      f.ctl.down = dist < 40;
      return;
    }

    // --- deliberate decisions on a skill-scaled clock ---
    this.decideT -= dt * 1000;
    if (this.decideT > 0 || f.busy) return;
    this.decideT = this.reactionMs * rnd(0.7, 1.3);
    f.ctl.move = 0; f.ctl.up = false; f.ctl.down = false;

    const mistake = Math.random() < this.mistakeRate;
    if (mistake) {
      const r = Math.random();
      if (r < 0.35) f.ctl.move = Math.random() < 0.5 ? -dir : dir;
      else if (r < 0.6) f.startAttack('light');
      else if (r < 0.75) f.jump();
      return;
    }

    // special from range — as often as YOU use yours (and punishes wall-campers)
    const wantSpecial = f.energy >= SPECIAL_COST &&
      (dist > 220 || player.cling) &&
      Math.random() < clamp(0.15 + p.specialPref * 2.2, 0, 0.7);
    if (wantSpecial) { f.startAttack('special'); return; }

    // chase into the air if the player is above
    if (vdist < -110 && f.grounded) {
      if (player.cling && Math.random() < 0.5) {
        this.wallPlan = { dir: player.x < W / 2 ? -1 : 1, t: rnd(700, 1100) };
      } else f.jump();
      f.ctl.move = dir;
      return;
    }
    // aerial flourish — mirrors YOUR air time
    if (f.grounded && Math.random() < p.airPref * 0.55) {
      if (Math.random() < 0.35) {
        const wallDir = f.x < W / 2 ? -1 : 1;
        this.wallPlan = { dir: wallDir, t: rnd(600, 1000) };
      } else { f.jump(); f.ctl.move = dir; }
      return;
    }

    const inRange = dist < ATTACKS.light.range + 8 && Math.abs(vdist) < 90;
    if (inRange) {
      f.ctl.move = 0;
      if (Math.random() < lerp(0.35, 0.85, p.aggression)) {
        f.startAttack(Math.random() < p.heavyPref ? 'heavy' : 'light');
      } else if (Math.random() < 0.35) {
        f.ctl.move = -dir * 0.7;
      }
    } else {
      f.ctl.move = dist > p.attackDist ? dir : (Math.random() < p.moveBias ? dir : -dir * 0.6);
      if (dist < ATTACKS.heavy.range + 20 && Math.abs(vdist) < 90 &&
          Math.random() < p.heavyPref * 0.5) {
        f.startAttack('heavy');
      }
    }
  }

  // after landing a hit: press the advantage as much as YOU do
  onHitLanded() {
    if (Math.random() < this.profile.comboFollowup) this.decideT = 70;
  }

  learnSummary() {
    const p = this.profile, s = [];
    s.push(`Aggression mirrored at ${pct(p.aggression)}`);
    s.push(p.heavyPref > 0.5 ? `You favor HEAVY strikes (${pct(p.heavyPref)}) — copied`
                             : `You favor LIGHT strikes (${pct(1 - p.heavyPref)}) — copied`);
    s.push(p.dodgePref > 0.5 ? `You escape by DODGING — so will I`
                             : `You hide behind BLOCKS — so will I`);
    s.push(`Special usage: ${pct(p.specialPref)} of attacks — matched`);
    s.push(`Air game: ${pct(p.airPref)} — I climb where you climb`);
    s.push(`Combo pressure: ${pct(p.comboFollowup)} — adopted`);
    s.push(`Your reaction: ~${Math.round(p.reaction)}ms — matching`);
    return s;
  }
}

// ============================================================
// Game
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  state: 'title',          // title | fight | roundend
  round: 1,
  banner: '', bannerSub: '',
  particles: [],
  stains: [],              // persistent blood on floor & walls
  rings: [],               // shockwave rings
  texts: [],               // floating combat text
  projectiles: [],
  shake: 0,
  slowmo: 0,
};

const profile = new PlayerProfile();
const engine = new SyncEngine();
let player, nemesis, ai;

function newRound() {
  player = new Fighter(280, '#4db8ff', 1);
  nemesis = new Fighter(680, '#ff4d6a', -1);
  ai = new NemesisAI(nemesis, profile, engine);
  game.state = 'fight';
  game.particles = []; game.stains = []; game.rings = [];
  game.texts = []; game.projectiles = [];
  roundStats.reset();
}

const roundStats = {
  comboWatch: 0,
  reset() {
    this.enemyWindupAt = null;
    this.defendedThis = false;
    this.comboWatch = 0;
  }
};
roundStats.reset();

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;

  if (e.code === 'Enter') {
    if (game.state === 'title' || game.state === 'roundend') {
      if (game.state === 'roundend') game.round++;
      newRound();
    }
  }
  if (game.state !== 'fight') return;

  const p = player;
  if (e.code === 'KeyW') p.jump();
  if (e.code === 'KeyJ' && p.startAttack('light')) recordAttack('light');
  if (e.code === 'KeyK' && p.startAttack('heavy')) recordAttack('heavy');
  if (e.code === 'KeyL' && p.startAttack('special')) recordAttack('special');
  if (e.code === 'Space') {
    e.preventDefault();
    const dir = keys.KeyA ? -1 : keys.KeyD ? 1 : -p.facing;
    if (p.startDodge(dir)) recordDefense('dodge');
  }
  if (e.code === 'KeyS' && !p.cling) { p.startBlock(); recordDefense('block'); }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'KeyS' && player) player.stopBlock();
});

function recordAttack(type) {
  profile[type === 'heavy' ? 'heavies' : type === 'special' ? 'specials' : 'lights']++;
  profile.attacks++; profile.totalActions++;
  profile.ema('attackDist', Math.abs(nemesis.x - player.x));
  if (roundStats.comboWatch > 0) {              // pressed after landing a hit
    profile.ema('comboFollowup', 1, 0.2);
    roundStats.comboWatch = 0;
  }
}
function recordDefense(kind) {
  profile[kind === 'dodge' ? 'dodges' : 'blocks']++;
  profile.totalActions++;
  if (roundStats.enemyWindupAt != null && !roundStats.defendedThis) {
    profile.ema('reaction', clamp(performance.now() - roundStats.enemyWindupAt, 80, 900), 0.25);
    roundStats.defendedThis = true;
    profile.defTaken++;
  }
}

// ---------- combat resolution ----------
function applyHit(att, def, dmg, knock, type, isPlayerAttacking) {
  // combo scaling
  const mult = 1 + 0.08 * Math.min(att.combo, 6);
  const result = def.takeHit(dmg * mult, knock, Math.sign(def.x - att.x) || att.facing, type);

  const hx = def.x, hy = def.centerY - 20;
  if (result === 'hit') {
    att.combo++; att.comboT = COMBO_WINDOW;
    att.energy = clamp(att.energy + 14, 0, ENERGY_MAX);
    if (isPlayerAttacking) { profile.hits++; roundStats.comboWatch = 800; }
    else ai.onHitLanded();

    spawnBlood(hx, hy, type === 'light' ? 16 : type === 'heavy' ? 30 : 40,
               Math.sign(def.x - att.x) || att.facing, def === nemesis);
    pushText('-' + Math.round(dmg * mult), hx + rnd(-10, 10), hy - 40, '#fff', 15);
    if (att.combo >= 2) {
      const big = att.combo >= 4;
      pushText(att.combo + ' HITS' + (big ? '!!' : '!'), att.x, att.centerY - 90,
               att.color, big ? 30 : 21);
      game.rings.push({ x: hx, y: hy, r: 10, vr: big ? 620 : 380,
                        life: 0.4, col: att.color });
      if (att.combo === 5) {
        pushText('SAVAGE', W / 2, 150, '#ffd24d', 46);
        game.slowmo = 260;
      }
    }
    game.shake = Math.max(game.shake, dmg > 12 ? 16 : dmg > 8 ? 12 : 8);
    if (dmg > 8) game.slowmo = Math.max(game.slowmo, 120);
  } else if (result === 'blocked') {
    spawnSparks(hx, hy, 10, '#ffd24d');
    pushText('BLOCK', hx, hy - 40, '#ffd24d', 13);
    game.shake = Math.max(game.shake, 4);
  } else {
    spawnSparks(hx, hy, 6, '#8888aa');
    pushText('DODGE', hx, hy - 40, '#8888aa', 13);
  }
  return result;
}

function resolveMelee(att, def, isPlayerAttacking) {
  if (att.state !== 'attack' || att.phase !== 'active' || att.hitLanded) return;
  if (att.attackType === 'special') return;
  const a = ATTACKS[att.attackType];
  const dist = Math.abs(def.x - att.x);
  const facingOK = Math.sign(def.x - att.x) === att.facing;
  const vOK = Math.abs(def.centerY - att.centerY) < 90;
  if (dist <= a.range && facingOK && vOK) {
    att.hitLanded = true;
    applyHit(att, def, a.dmg, a.knock, att.attackType, isPlayerAttacking);
  }
}

function fireSpecial(f) {
  const foe = f === player ? nemesis : player;
  const sx = f.x + f.facing * 22, sy = f.centerY - 8;
  const dx = foe.x - sx, dy = foe.centerY - sy;
  const len = Math.hypot(dx, dy) || 1;
  game.projectiles.push({
    x: sx, y: sy,
    vx: dx / len * PROJ_SPEED, vy: dy / len * PROJ_SPEED,
    owner: f, col: f.color, age: 0,
  });
  game.rings.push({ x: sx, y: sy, r: 6, vr: 300, life: 0.3, col: f.color });
  game.shake = Math.max(game.shake, 5);
}

function updateProjectiles(dt) {
  for (const p of game.projectiles) {
    p.age += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // trail
    if (Math.random() < 0.8) game.particles.push({
      kind: 'spark', x: p.x + rnd(-4, 4), y: p.y + rnd(-4, 4),
      vx: rnd(-40, 40) - p.vx * 0.1, vy: rnd(-40, 40),
      life: rnd(0.15, 0.4), col: p.col,
    });
    const foe = p.owner === player ? nemesis : player;
    if (Math.abs(foe.x - p.x) < 26 && Math.abs(foe.centerY - p.y) < BODY_H / 2 + 12) {
      const a = ATTACKS.special;
      applyHit(p.owner, foe, a.dmg, a.knock, 'special', p.owner === player);
      game.rings.push({ x: p.x, y: p.y, r: 12, vr: 700, life: 0.45, col: p.col });
      spawnSparks(p.x, p.y, 24, p.col);
      p.dead = true;
    }
    if (p.x < WALL_L || p.x > WALL_R || p.y < CEIL || p.y > FLOOR) {
      game.rings.push({ x: p.x, y: p.y, r: 8, vr: 420, life: 0.35, col: p.col });
      spawnSparks(clamp(p.x, WALL_L, WALL_R), clamp(p.y, CEIL, FLOOR), 14, p.col);
      p.dead = true;
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.dead);
}

// track windows where the player COULD have defended (for defenseRate/reaction)
function trackDefenseWindows(dt) {
  if (nemesis.state === 'attack' && nemesis.phase === 'windup') {
    if (roundStats.enemyWindupAt == null) {
      roundStats.enemyWindupAt = performance.now();
      roundStats.defendedThis = false;
      const rng = nemesis.attackType === 'special' ? 400 : ATTACKS[nemesis.attackType].range + 50;
      if (Math.abs(nemesis.x - player.x) < rng) profile.defChances++;
    }
  } else if (roundStats.enemyWindupAt != null && nemesis.state !== 'attack') {
    roundStats.enemyWindupAt = null;
  }
  if (player.ctl.move !== 0) {
    const toward = Math.sign(nemesis.x - player.x) === Math.sign(player.ctl.move);
    profile.ema('moveBias', toward ? 1 : 0, 0.02);
  }
  profile.ema('airPref', player.grounded ? 0 : 1, 0.008);
  if (roundStats.comboWatch > 0) {
    roundStats.comboWatch -= dt * 1000;
    if (roundStats.comboWatch <= 0) profile.ema('comboFollowup', 0, 0.2);
  }
}

function endRound() {
  const won = player.hp > 0;
  engine.roundEnd(Math.max(0, player.hp), Math.max(0, nemesis.hp));
  profile.rounds++;
  profile.save();
  game.state = 'roundend';
  game.banner = won ? 'ROUND WON' : 'NEMESIS WINS';
  game.bannerSub = won ? 'It studies your victory. It will not fall the same way twice.'
                       : 'It beat you with your own style.';
  // final gore
  const loser = won ? nemesis : player;
  spawnBlood(loser.x, loser.centerY, 60, -loser.facing, loser === nemesis);
  game.shake = 20; game.slowmo = 500;
  document.getElementById('nem-log').innerHTML =
    ai.learnSummary().map(l => '&gt; ' + l).join('<br>');
}

// ---------- gore & fx ----------
function spawnBlood(x, y, n, dir, isNemesis) {
  // nemesis bleeds dark ichor; you bleed red
  const cols = isNemesis ? ['#a4103a', '#6e0b28', '#4a0a1e'] : ['#d21c2c', '#a01020', '#7a0c18'];
  for (let i = 0; i < n; i++) {
    game.particles.push({
      kind: 'blood',
      x: x + rnd(-8, 8), y: y + rnd(-24, 24),
      vx: dir * rnd(30, 340) + rnd(-120, 120), vy: rnd(-330, 90),
      life: rnd(0.5, 1.4), sz: rnd(2, 5),
      col: cols[(Math.random() * cols.length) | 0],
    });
  }
}
function spawnSparks(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    game.particles.push({
      kind: 'spark', x, y: y + rnd(-16, 16),
      vx: rnd(-280, 280), vy: rnd(-300, 60),
      life: rnd(0.2, 0.5), col,
    });
  }
}
function pushText(text, x, y, col, size) {
  game.texts.push({ text, x, y, col, size, life: 0.9, max: 0.9 });
}
function addStain(x, y, onWall, col) {
  game.stains.push({ x, y, onWall, col, r: rnd(3, 9) });
  if (game.stains.length > 260) game.stains.shift();
}

function updateFx(dt) {
  for (const p of game.particles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.kind === 'blood' ? 1100 : 800) * dt;
    if (p.kind === 'blood') {
      if (p.y >= FLOOR) { addStain(p.x, FLOOR + rnd(0, 40), false, p.col); p.life = 0; }
      else if (p.x <= WALL_L + 3) { addStain(WALL_L + 2, p.y, true, p.col); p.life = 0; }
      else if (p.x >= WALL_R - 3) { addStain(WALL_R - 2, p.y, true, p.col); p.life = 0; }
    }
  }
  game.particles = game.particles.filter(p => p.life > 0);
  for (const r of game.rings) { r.r += r.vr * dt; r.life -= dt; }
  game.rings = game.rings.filter(r => r.life > 0);
  for (const t of game.texts) { t.life -= dt; t.y -= 34 * dt; }
  game.texts = game.texts.filter(t => t.life > 0);
}

// ---------- rendering ----------
function drawArena(t) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80,80,140,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, CEIL); ctx.lineTo(x, FLOOR); ctx.stroke();
  }
  for (let y = CEIL; y <= FLOOR; y += 60) {
    ctx.beginPath(); ctx.moveTo(WALL_L, y); ctx.lineTo(WALL_R, y); ctx.stroke();
  }
  // floor
  ctx.fillStyle = '#101020';
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  // boundary glow — climbable surfaces
  ctx.strokeStyle = 'rgba(120,120,220,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(W, FLOOR); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,120,220,0.3)';
  ctx.beginPath(); ctx.moveTo(WALL_L, CEIL); ctx.lineTo(WALL_L, FLOOR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(WALL_R, CEIL); ctx.lineTo(WALL_R, FLOOR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(WALL_L, CEIL); ctx.lineTo(WALL_R, CEIL); ctx.stroke();
  // grip notches on walls & ceiling
  ctx.strokeStyle = 'rgba(120,120,220,0.18)';
  for (let y = CEIL + 20; y < FLOOR; y += 34) {
    ctx.beginPath(); ctx.moveTo(WALL_L, y); ctx.lineTo(WALL_L + 8, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(WALL_R, y); ctx.lineTo(WALL_R - 8, y); ctx.stroke();
  }
  for (let x = WALL_L + 20; x < WALL_R; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, CEIL); ctx.lineTo(x, CEIL + 8); ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const x = ((t * 0.02 + i * 140) % (W + 140)) - 70;
    ctx.strokeStyle = 'rgba(90,90,180,0.10)';
    ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x - 40, H); ctx.stroke();
  }
}

function drawStains() {
  for (const s of game.stains) {
    ctx.fillStyle = s.col;
    ctx.globalAlpha = 0.55;
    if (s.onWall) {
      ctx.fillRect(s.x - 1.5, s.y, 3, s.r * 2.6);   // dripping down the wall
    } else {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * 1.7, s.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFighter(f, isNemesis) {
  const t = f.anim / 1000;
  const bob = f.grounded ? Math.sin(t * 6) * 3 : 0;
  const passes = isNemesis ? [[3, 'rgba(255,0,80,0.25)'], [-3, 'rgba(0,180,255,0.18)'], [0, null]] : [[0, null]];

  for (const [off, ghostCol] of passes) {
    ctx.save();
    // anchor: feet — flipped when hanging from the ceiling
    if (f.cling === 'C') { ctx.translate(f.x + off, CEIL); ctx.scale(1, -1); }
    else {
      ctx.translate(f.x + off, f.y);
      if (f.cling === 'L') ctx.rotate(-0.1);
      if (f.cling === 'R') ctx.rotate(0.1);
    }

    const col = ghostCol || (f.flash > 0 ? '#ffffff' : f.color);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = ghostCol ? 0 : 18;

    const hipY = -55 + bob, headY = -BODY_H + bob;
    const lean = f.state === 'attack' ? f.facing * 8 : 0;

    // legs
    const airborne = !f.grounded && !f.cling;
    const step = f.ctl.move !== 0 && f.grounded ? Math.sin(t * 14) * 14
               : airborne ? 10 : f.cling ? 6 : 0;
    ctx.beginPath();
    ctx.moveTo(0, hipY); ctx.lineTo(-12 + step, airborne ? -12 : 0);
    ctx.moveTo(0, hipY); ctx.lineTo(12 - step, airborne ? -6 : 0);
    ctx.stroke();
    // torso
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(lean, headY + 22); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(lean, headY, 13, 0, Math.PI * 2); ctx.stroke();
    if (isNemesis && !ghostCol) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(lean + f.facing * 3, headY - 2, 5, 3);
    }

    // arms
    const sh = headY + 32;
    ctx.beginPath();
    if (f.state === 'attack' && f.attackType === 'special') {
      // both hands forward, gathering the blast
      const a = ATTACKS.special;
      const prog = f.phase === 'windup' ? 1 - f.t / a.windup : 1;
      ctx.moveTo(lean, sh); ctx.lineTo(lean + f.facing * 24, sh - 4);
      ctx.moveTo(lean, sh); ctx.lineTo(lean + f.facing * 24, sh + 6);
      ctx.stroke();
      if (f.phase === 'windup') {           // charging orb
        const r = 4 + prog * 14;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(lean + f.facing * 30, sh, r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(lean + f.facing * 30, sh, r, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (f.state === 'attack') {
      const a = ATTACKS[f.attackType];
      const prog = f.phase === 'windup' ? 1 - f.t / a.windup
                 : f.phase === 'active' ? 1 : 1 - (1 - f.t / a.recover) * 0.6;
      const reach = f.phase === 'windup' ? lerp(-18, -30, prog)
                  : f.phase === 'active' ? a.range - 14 : 30;
      ctx.moveTo(lean, sh); ctx.lineTo(lean + f.facing * reach, sh + (f.phase === 'active' ? -6 : 8));
      ctx.moveTo(lean, sh); ctx.lineTo(lean - f.facing * 16, sh + 22);
      ctx.stroke();
      if (f.phase === 'active') {
        ctx.strokeStyle = f.attackType === 'heavy' ? '#fff' : col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(lean + f.facing * (a.range - 24), sh - 6, f.attackType === 'heavy' ? 26 : 16,
                -1.1 * f.facing, 1.1 * f.facing, f.facing < 0);
        ctx.stroke();
      }
    } else if (f.state === 'block') {
      ctx.moveTo(0, sh); ctx.lineTo(f.facing * 22, sh - 18);
      ctx.moveTo(0, sh); ctx.lineTo(f.facing * 22, sh + 14);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,210,77,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.facing * 30, sh, 30, -0.9, 0.9);
      ctx.stroke();
    } else if (f.state === 'hitstun') {
      ctx.moveTo(0, sh); ctx.lineTo(-f.facing * 20, sh + 18);
      ctx.moveTo(0, sh); ctx.lineTo(-f.facing * 8, sh + 24);
      ctx.stroke();
    } else if (f.state === 'dodge') {
      ctx.globalAlpha = 0.55;
      ctx.moveTo(0, sh); ctx.lineTo(-f.facing * 24, sh + 6);
      ctx.moveTo(0, sh); ctx.lineTo(f.facing * 10, sh + 20);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.cling === 'L' || f.cling === 'R') {
      // gripping the wall
      const wd = f.cling === 'L' ? -1 : 1;
      ctx.moveTo(0, sh); ctx.lineTo(wd * 16, sh - 22);
      ctx.moveTo(0, sh); ctx.lineTo(wd * 14, sh + 10);
      ctx.stroke();
    } else {
      const g = Math.sin(t * 6) * 3;
      ctx.moveTo(0, sh); ctx.lineTo(f.facing * 18, sh + 16 + g);
      ctx.moveTo(0, sh); ctx.lineTo(-f.facing * 12, sh + 20 - g);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawProjectiles() {
  for (const p of game.projectiles) {
    ctx.save();
    ctx.shadowColor = p.col; ctx.shadowBlur = 26;
    const pulse = 1 + Math.sin(p.age * 24) * 0.18;
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawFx() {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life * 2.2, 0, 1);
    ctx.fillStyle = p.col;
    const s = p.sz || 4;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  for (const r of game.rings) {
    ctx.globalAlpha = clamp(r.life * 2.4, 0, 1);
    ctx.strokeStyle = r.col;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of game.texts) {
    ctx.globalAlpha = clamp(t.life / t.max * 1.4, 0, 1);
    ctx.fillStyle = t.col;
    ctx.font = `bold ${t.size}px Courier New`;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  const bw = 380;
  drawBars(40, 24, bw, player, '#4db8ff', 'YOU', false);
  drawBars(W - 40 - bw, 24, bw, nemesis, '#ff4d6a', 'NEMESIS  ·  SKILL ' + pct(engine.skill), true);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('ROUND ' + game.round, W / 2, 36);
  ctx.fillStyle = '#6a6a85';
  ctx.font = '11px Courier New';
  ctx.fillText('SYNC ' + pct(profile.sync), W / 2, 52);
}

function drawBars(x, y, w, f, color, label, rightAlign) {
  // hp
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x, y, w, 16);
  const fill = clamp(f.hp / MAX_HP, 0, 1) * (w - 4);
  ctx.fillStyle = color;
  ctx.fillRect(rightAlign ? x + w - 2 - fill : x + 2, y + 2, fill, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x, y, w, 16);
  // energy
  const ew = w * 0.6;
  const ex = rightAlign ? x + w - ew : x;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(ex, y + 19, ew, 6);
  const ready = f.energy >= SPECIAL_COST;
  ctx.fillStyle = ready ? '#ffd24d' : '#7a6a2e';
  const efill = clamp(f.energy / ENERGY_MAX, 0, 1) * (ew - 2);
  ctx.fillRect(rightAlign ? ex + ew - 1 - efill : ex + 1, y + 20, efill, 4);
  if (ready) {
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 9px Courier New';
    ctx.textAlign = rightAlign ? 'left' : 'right';
    ctx.fillText('◆ SPECIAL', rightAlign ? ex - 6 : ex + ew + 6, y + 25);
  }
  ctx.fillStyle = color;
  ctx.font = 'bold 12px Courier New';
  ctx.textAlign = rightAlign ? 'right' : 'left';
  ctx.fillText(label, rightAlign ? x + w : x, y - 6);
}

function drawCenterText(lines) {
  ctx.textAlign = 'center';
  let y = H / 2 - lines.length * 14;
  for (const [txt, size, col] of lines) {
    ctx.fillStyle = col;
    ctx.font = `bold ${size}px Courier New`;
    ctx.fillText(txt, W / 2, y);
    y += size + 16;
  }
}

// ---------- HUD panels (DOM) ----------
function updatePanels() {
  const set = (id, v) => document.getElementById(id).textContent = v;
  const bar = (id, v) => document.getElementById(id).style.width = pct(clamp(v, 0, 1));
  set('p-agg', pct(profile.aggression)); bar('p-agg-bar', profile.aggression);
  set('p-def', pct(profile.defenseRate)); bar('p-def-bar', profile.defenseRate);
  set('p-acc', pct(profile.accuracy)); bar('p-acc-bar', profile.accuracy);
  set('p-air', pct(profile.airPref)); bar('p-air-bar', profile.airPref);
  set('sync', pct(profile.sync)); bar('sync-bar', profile.sync);
  set('rating', Math.round(engine.rating));
  set('nskill', pct(engine.skill));
  set('score', engine.wins + ' : ' + engine.losses);
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game.slowmo > 0) { game.slowmo -= dt * 1000; dt *= 0.35; }

  ctx.save();
  if (game.shake > 0) {
    ctx.translate(rnd(-game.shake, game.shake), rnd(-game.shake, game.shake));
    game.shake *= 0.85;
    if (game.shake < 0.5) game.shake = 0;
  }

  drawArena(now);

  if (game.state === 'title') {
    drawCenterText([
      ['NEMESIS ARENA', 44, '#ffffff'],
      ['Your opponent watches. Learns. Becomes you.', 15, '#6a6a85'],
      ['Climb the walls. Charge your special. Draw blood.', 13, '#6a6a85'],
      ['PRESS ENTER TO FIGHT', 18, '#ffd24d'],
    ]);
  } else if (game.state === 'fight' || game.state === 'roundend') {
    if (game.state === 'fight') {
      // player intent from held keys
      player.ctl.move = (keys.KeyA ? -1 : 0) + (keys.KeyD ? 1 : 0);
      player.ctl.up = !!keys.KeyW;
      player.ctl.down = !!keys.KeyS;
      player.facing = Math.sign(nemesis.x - player.x) || player.facing;

      ai.think(dt, player);
      player.update(dt);
      nemesis.update(dt);
      if (player.pendingShot)  { player.pendingShot = false;  fireSpecial(player); }
      if (nemesis.pendingShot) { nemesis.pendingShot = false; fireSpecial(nemesis); }

      trackDefenseWindows(dt);
      resolveMelee(player, nemesis, true);
      resolveMelee(nemesis, player, false);
      updateProjectiles(dt);

      if (player.hp <= 0 || nemesis.hp <= 0) endRound();
    }

    updateFx(dt);

    drawStains();
    drawProjectiles();
    drawFighter(player, false);
    drawFighter(nemesis, true);
    drawFx();
    drawHud();

    if (game.state === 'roundend') {
      ctx.fillStyle = 'rgba(5,5,12,0.7)';
      ctx.fillRect(0, 0, W, H);
      drawCenterText([
        [game.banner, 42, game.banner === 'ROUND WON' ? '#4db8ff' : '#ff4d6a'],
        [game.bannerSub, 14, '#aaaacc'],
        ['NEMESIS SKILL NOW ' + pct(engine.skill) + '  ·  YOUR RATING ' + Math.round(engine.rating), 13, '#ffd24d'],
        ['PRESS ENTER — NEXT ROUND', 16, '#ffffff'],
      ]);
    }
  }

  ctx.restore();
  updatePanels();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
