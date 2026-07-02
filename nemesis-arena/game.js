/* ============================================================
   NEMESIS ARENA
   A combat game where your opponent learns to fight like YOU.

   The Nemesis:
   - Profiles your style: aggression, block/dodge habits, light
     vs heavy preference, spacing, reaction speed.
   - Mirrors that style back at you.
   - An ELO-style sync engine tunes its reaction time, mistake
     rate and aim so it always sits at YOUR skill level.
   - Remembers you between sessions (localStorage).
   ============================================================ */

'use strict';

// ---------- tuning ----------
const W = 960, H = 480, FLOOR = 400;
const WALK_SPEED = 260;
const MAX_HP = 100;

const ATTACKS = {
  light: { windup: 130, active: 90,  recover: 200, range: 78, dmg: 6,  knock: 90  },
  heavy: { windup: 330, active: 110, recover: 340, range: 92, dmg: 14, knock: 220 },
};
const DODGE = { dur: 280, iframes: 200, dist: 150 };
const HITSTUN = 260;
const BLOCK_REDUCE = { light: 0.85, heavy: 0.55 };

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
      lights: 0, heavies: 0, blocks: 0, dodges: 0,
      hits: 0, attacks: 0,
      defChances: 0, defTaken: 0,          // chances to defend vs actually defended
      attackDist: 120,                     // EMA of distance when attacking
      reaction: 400,                       // EMA ms from enemy windup -> defensive input
      moveBias: 0.5,                       // 0 = retreats, 1 = pushes forward
      totalActions: 0,
      rounds: 0,
    }, saved ? JSON.parse(saved) : {});
  }
  save() { localStorage.setItem('nemesis-profile', JSON.stringify(this)); }

  ema(key, value, a = 0.15) { this[key] = lerp(this[key], value, a); }

  // --- derived style metrics (all 0..1) ---
  get heavyPref()  { const t = this.lights + this.heavies; return t ? this.heavies / t : 0.35; }
  get dodgePref()  { const t = this.blocks + this.dodges;  return t ? this.dodges / t : 0.5; }
  get defenseRate(){ return this.defChances ? clamp(this.defTaken / this.defChances, 0, 1) : 0.3; }
  get accuracy()   { return this.attacks ? this.hits / this.attacks : 0.5; }
  get aggression() {
    const off = this.lights + this.heavies, def = this.blocks + this.dodges;
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
    this.x = x; this.color = color; this.facing = facing;
    this.hp = MAX_HP;
    this.state = 'idle';          // idle | attack | block | dodge | hitstun
    this.attackType = null;
    this.phase = null;            // windup | active | recover
    this.t = 0;                   // ms left in current phase/state
    this.vx = 0;
    this.moveIntent = 0;          // -1..1
    this.hitLanded = false;
    this.anim = 0;                // running animation clock
    this.flash = 0;
  }

  get busy() { return this.state === 'attack' || this.state === 'dodge' || this.state === 'hitstun'; }
  get blocking() { return this.state === 'block'; }
  get invulnerable() { return this.state === 'dodge' && this.iframeT > 0; }

  startAttack(type) {
    if (this.busy) return false;
    const a = ATTACKS[type];
    this.state = 'attack'; this.attackType = type;
    this.phase = 'windup'; this.t = a.windup;
    this.hitLanded = false;
    return true;
  }
  startBlock() { if (!this.busy) this.state = 'block'; }
  stopBlock()  { if (this.state === 'block') this.state = 'idle'; }
  startDodge(dir) {
    if (this.busy) return false;
    this.state = 'dodge'; this.t = DODGE.dur; this.iframeT = DODGE.iframes;
    this.vx = (dir || -this.facing) * (DODGE.dist / (DODGE.dur / 1000));
    return true;
  }

  takeHit(dmg, knock, fromDir, type) {
    if (this.invulnerable) return 'dodged';
    if (this.blocking) {
      this.hp -= dmg * (1 - BLOCK_REDUCE[type]);
      this.x += fromDir * knock * 0.25;
      this.flash = 80;
      return 'blocked';
    }
    this.hp -= dmg;
    this.state = 'hitstun'; this.t = HITSTUN;
    this.x += fromDir * knock * 0.35;
    this.vx = fromDir * knock * 1.5;
    this.flash = 140;
    return 'hit';
  }

  update(dt) {
    const ms = dt * 1000;
    this.anim += ms;
    this.flash = Math.max(0, this.flash - ms);

    if (this.state === 'attack') {
      this.t -= ms;
      if (this.t <= 0) {
        const a = ATTACKS[this.attackType];
        if (this.phase === 'windup')      { this.phase = 'active';  this.t = a.active; }
        else if (this.phase === 'active') { this.phase = 'recover'; this.t = a.recover; }
        else { this.state = 'idle'; this.phase = null; }
      }
    } else if (this.state === 'dodge') {
      this.t -= ms; this.iframeT -= ms;
      this.x += this.vx * dt;
      if (this.t <= 0) { this.state = 'idle'; this.vx = 0; }
    } else if (this.state === 'hitstun') {
      this.t -= ms;
      this.x += this.vx * dt; this.vx *= 0.86;
      if (this.t <= 0) { this.state = 'idle'; this.vx = 0; }
    } else if (this.state === 'idle') {
      this.x += this.moveIntent * WALK_SPEED * dt;
    }
    this.x = clamp(this.x, 50, W - 50);
  }
}

// ============================================================
// Nemesis AI — mirrors the player's style at matched skill
// ============================================================
class NemesisAI {
  constructor(fighter, profile, engine) {
    this.f = fighter; this.profile = profile; this.engine = engine;
    this.decideT = 0;
    this.plannedDefense = null;   // reaction to an incoming attack
    this.log = [];
  }

  // skill-scaled parameters
  get reactionMs()  { return lerp(420, 130, this.engine.skill); }
  get mistakeRate() { return lerp(0.38, 0.06, this.engine.skill); }

  // small rubber-band inside the round so fights stay close
  rubberBand(player) {
    const diff = (this.f.hp - player.hp) / MAX_HP;   // + means nemesis winning
    return clamp(this.engine.skill - diff * 0.25, 0.05, 1);
  }

  think(dt, player) {
    const p = this.profile, f = this.f;
    const skill = this.rubberBand(player);
    const dist = Math.abs(player.x - f.x);
    const dir = Math.sign(player.x - f.x) || 1;
    f.facing = dir;

    // --- reactive defense: player is winding up in range ---
    if (player.state === 'attack' && player.phase === 'windup' &&
        dist < ATTACKS[player.attackType].range + 40 && !f.busy && !this.plannedDefense) {
      // defends about as often as YOU defend, reacting about as fast as YOU react
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
        if (m === 'dodge') f.startDodge(-dir);
        else { f.startBlock(); this.blockT = rnd(300, 650); }
        this.plannedDefense = null;
        return;
      }
    }
    // release block after a while
    if (f.blocking) {
      this.blockT -= dt * 1000;
      if (this.blockT <= 0) f.stopBlock();
      return;
    }

    // --- deliberate decisions on a skill-scaled clock ---
    this.decideT -= dt * 1000;
    if (this.decideT > 0 || f.busy) return;
    this.decideT = this.reactionMs * rnd(0.7, 1.3);

    const mistake = Math.random() < this.mistakeRate;
    const wantDist = p.attackDist;          // fights at YOUR preferred spacing

    if (mistake) {
      // fumble: wrong spacing or a whiffed poke — this is what "your level" feels like
      const r = Math.random();
      if (r < 0.4) f.moveIntent = rnd(-1, 1) < 0 ? -dir : dir;
      else if (r < 0.7) f.startAttack('light');
      else f.moveIntent = 0;
      return;
    }

    const inRange = dist < ATTACKS.light.range + 8;
    if (inRange) {
      f.moveIntent = 0;
      // attacks about as often as YOU attack
      if (Math.random() < lerp(0.35, 0.85, p.aggression)) {
        f.startAttack(Math.random() < p.heavyPref ? 'heavy' : 'light');
      } else if (Math.random() < 0.35) {
        f.moveIntent = -dir * 0.7;          // reset spacing
      }
    } else {
      // approach/retreat toward the spacing YOU like to fight at
      f.moveIntent = dist > wantDist ? dir : (Math.random() < p.moveBias ? dir : -dir * 0.6);
      // heavy from just outside range if that's your habit
      if (dist < ATTACKS.heavy.range + 20 && Math.random() < p.heavyPref * 0.5) {
        f.startAttack('heavy');
      }
    }
  }

  learnSummary() {
    const p = this.profile, s = [];
    s.push(`Aggression mirrored at ${pct(p.aggression)}`);
    s.push(p.heavyPref > 0.5 ? `You favor HEAVY strikes (${pct(p.heavyPref)}) — copied`
                             : `You favor LIGHT strikes (${pct(1 - p.heavyPref)}) — copied`);
    s.push(p.dodgePref > 0.5 ? `You escape by DODGING — so will I`
                             : `You hide behind BLOCKS — so will I`);
    s.push(`Your reaction: ~${Math.round(p.reaction)}ms — matching`);
    s.push(`Preferred spacing: ${Math.round(p.attackDist)}px — adopted`);
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
  game.particles = [];
  roundStats.reset();
}

// per-round bookkeeping used to update the profile
const roundStats = {
  reset() {
    this.enemyWindupAt = null;
    this.defendedThis = false;
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
  if (e.code === 'KeyJ' && p.startAttack('light')) recordAttack('light');
  if (e.code === 'KeyK' && p.startAttack('heavy')) recordAttack('heavy');
  if (e.code === 'Space') {
    e.preventDefault();
    const dir = keys.KeyA ? -1 : keys.KeyD ? 1 : -p.facing;
    if (p.startDodge(dir)) recordDefense('dodge');
  }
  if (e.code === 'KeyS') { p.startBlock(); recordDefense('block'); }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'KeyS' && player) player.stopBlock();
});

function recordAttack(type) {
  profile[type === 'heavy' ? 'heavies' : 'lights']++;
  profile.attacks++; profile.totalActions++;
  profile.ema('attackDist', Math.abs(nemesis.x - player.x));
}
function recordDefense(kind) {
  profile[kind === 'dodge' ? 'dodges' : 'blocks']++;
  profile.totalActions++;
  // reaction time: measured from the nemesis' windup start
  if (roundStats.enemyWindupAt != null && !roundStats.defendedThis) {
    profile.ema('reaction', clamp(performance.now() - roundStats.enemyWindupAt, 80, 900), 0.25);
    roundStats.defendedThis = true;
    profile.defTaken++;
  }
}

// ---------- combat resolution ----------
function resolveHits(att, def, isPlayerAttacking) {
  if (att.state !== 'attack' || att.phase !== 'active' || att.hitLanded) return;
  const a = ATTACKS[att.attackType];
  const dist = Math.abs(def.x - att.x);
  const facingOK = Math.sign(def.x - att.x) === att.facing;
  if (dist <= a.range && facingOK) {
    att.hitLanded = true;
    const result = def.takeHit(a.dmg, a.knock, att.facing, att.attackType);
    if (isPlayerAttacking && result === 'hit') profile.hits++;
    spawnHitFx(def.x, FLOOR - 90, result, def.color);
    game.shake = result === 'hit' ? (a.dmg > 8 ? 14 : 8) : 4;
    if (result === 'hit' && a.dmg > 8) game.slowmo = 120;
  }
}

// track windows where the player COULD have defended (for defenseRate/reaction)
function trackDefenseWindows() {
  if (nemesis.state === 'attack' && nemesis.phase === 'windup') {
    if (roundStats.enemyWindupAt == null) {
      roundStats.enemyWindupAt = performance.now();
      roundStats.defendedThis = false;
      if (Math.abs(nemesis.x - player.x) < ATTACKS[nemesis.attackType].range + 50) {
        profile.defChances++;
      }
    }
  } else if (roundStats.enemyWindupAt != null && nemesis.state !== 'attack') {
    roundStats.enemyWindupAt = null;
  }
  // movement bias: are you pushing in or backing off?
  if (player.moveIntent !== 0) {
    const toward = Math.sign(nemesis.x - player.x) === Math.sign(player.moveIntent);
    profile.ema('moveBias', toward ? 1 : 0, 0.02);
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
  document.getElementById('nem-log').innerHTML =
    ai.learnSummary().map(l => '&gt; ' + l).join('<br>');
}

// ---------- particles / fx ----------
function spawnHitFx(x, y, result, color) {
  const n = result === 'hit' ? 18 : 8;
  const col = result === 'blocked' ? '#ffd24d' : result === 'dodged' ? '#8888aa' : color;
  for (let i = 0; i < n; i++) {
    game.particles.push({
      x, y: y + rnd(-20, 20),
      vx: rnd(-260, 260), vy: rnd(-320, 60),
      life: rnd(0.25, 0.6), col,
    });
  }
}

// ---------- rendering ----------
function drawArena(t) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);
  // back wall grid
  ctx.strokeStyle = 'rgba(80,80,140,0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, FLOOR); ctx.stroke();
  }
  for (let y = 60; y <= FLOOR; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // floor
  ctx.fillStyle = '#101020';
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = 'rgba(120,120,220,0.35)';
  ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(W, FLOOR); ctx.stroke();
  // floor glow lines
  for (let i = 0; i < 8; i++) {
    const x = ((t * 0.02 + i * 140) % (W + 140)) - 70;
    ctx.strokeStyle = 'rgba(90,90,180,0.10)';
    ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x - 40, H); ctx.stroke();
  }
}

function drawFighter(f, isNemesis) {
  const x = f.x, y = FLOOR;
  const t = f.anim / 1000;
  const bob = Math.sin(t * 6) * 3;
  const passes = isNemesis ? [[3, 'rgba(255,0,80,0.25)'], [-3, 'rgba(0,180,255,0.18)'], [0, null]] : [[0, null]];

  for (const [off, ghostCol] of passes) {
    ctx.save();
    ctx.translate(x + off, 0);
    const col = ghostCol || (f.flash > 0 ? '#ffffff' : f.color);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = ghostCol ? 0 : 18;

    const hipY = y - 55 + bob, headY = y - 130 + bob;
    const lean = f.state === 'attack' ? f.facing * 8 : 0;

    // legs
    const step = f.moveIntent !== 0 ? Math.sin(t * 14) * 14 : 0;
    ctx.beginPath();
    ctx.moveTo(0, hipY); ctx.lineTo(-12 + step, y);
    ctx.moveTo(0, hipY); ctx.lineTo(12 - step, y);
    ctx.stroke();
    // torso
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(lean, headY + 22); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(lean, headY, 13, 0, Math.PI * 2); ctx.stroke();
    if (isNemesis && !ghostCol) {  // glowing eye
      ctx.fillStyle = '#fff';
      ctx.fillRect(lean + f.facing * 3, headY - 2, 5, 3);
    }

    // arms
    const sh = headY + 32;
    ctx.beginPath();
    if (f.state === 'attack') {
      const a = ATTACKS[f.attackType];
      const prog = f.phase === 'windup' ? 1 - f.t / a.windup
                 : f.phase === 'active' ? 1 : 1 - (1 - f.t / a.recover) * 0.6;
      const reach = f.phase === 'windup' ? lerp(-18, -30, prog)
                  : f.phase === 'active' ? a.range - 14 : 30;
      ctx.moveTo(lean, sh); ctx.lineTo(lean + f.facing * reach, sh + (f.phase === 'active' ? -6 : 8));
      ctx.moveTo(lean, sh); ctx.lineTo(lean - f.facing * 16, sh + 22);
      ctx.stroke();
      if (f.phase === 'active') {   // slash arc
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
      // shield shimmer
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
    } else {
      const g = Math.sin(t * 6) * 3;
      ctx.moveTo(0, sh); ctx.lineTo(f.facing * 18, sh + 16 + g);
      ctx.moveTo(0, sh); ctx.lineTo(-f.facing * 12, sh + 20 - g);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHud() {
  const bw = 380;
  // player hp (left)
  drawHpBar(40, 24, bw, player.hp, '#4db8ff', 'YOU', false);
  drawHpBar(W - 40 - bw, 24, bw, nemesis.hp, '#ff4d6a', 'NEMESIS  ·  SKILL ' + pct(engine.skill), true);
  // round
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('ROUND ' + game.round, W / 2, 36);
  ctx.fillStyle = '#6a6a85';
  ctx.font = '11px Courier New';
  ctx.fillText('SYNC ' + pct(profile.sync), W / 2, 52);
}

function drawHpBar(x, y, w, hp, color, label, rightAlign) {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x, y, w, 16);
  const fill = clamp(hp / MAX_HP, 0, 1) * (w - 4);
  ctx.fillStyle = color;
  ctx.fillRect(rightAlign ? x + w - 2 - fill : x + 2, y + 2, fill, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x, y, w, 16);
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
  const bar = (id, v) => document.getElementById(id).style.width = pct(v);
  set('p-agg', pct(profile.aggression)); bar('p-agg-bar', profile.aggression);
  set('p-def', pct(profile.defenseRate)); bar('p-def-bar', profile.defenseRate);
  set('p-acc', pct(profile.accuracy)); bar('p-acc-bar', profile.accuracy);
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
      ['Every round it mirrors your style at exactly your skill level.', 13, '#6a6a85'],
      ['PRESS ENTER TO FIGHT', 18, '#ffd24d'],
    ]);
  } else if (game.state === 'fight' || game.state === 'roundend') {
    if (game.state === 'fight') {
      // player movement intent
      player.moveIntent = (keys.KeyA ? -1 : 0) + (keys.KeyD ? 1 : 0);
      player.facing = Math.sign(nemesis.x - player.x) || player.facing;

      ai.think(dt, player);
      player.update(dt);
      nemesis.update(dt);
      trackDefenseWindows();
      resolveHits(player, nemesis, true);
      resolveHits(nemesis, player, false);

      if (player.hp <= 0 || nemesis.hp <= 0) endRound();
    }

    // particles
    for (const p of game.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 800 * dt;
    }
    game.particles = game.particles.filter(p => p.life > 0);

    drawFighter(player, false);
    drawFighter(nemesis, true);
    for (const p of game.particles) {
      ctx.globalAlpha = clamp(p.life * 2.5, 0, 1);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
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
