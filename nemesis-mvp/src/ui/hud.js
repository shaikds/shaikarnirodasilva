// HUD: fighter bars, energy meters, combo counter, floating damage numbers,
// center announcements. DOM-based (crisp text, zero WebGL cost), world
// positions projected per frame. Combat readability, not decoration
// (AC-4.5.2, AC-4.5.3, AC-4.4.1).

import * as THREE from 'three';
import { ENERGY } from '../combat/attacks.js';

const CSS = `
#hud .bars { position: fixed; width: 320px; }
#hud .bars.me { left: 24px; bottom: 24px; }
#hud .bars.foe { right: 24px; top: 20px; display: none; }
#hud .name { font-size: 12px; letter-spacing: 2px; margin-bottom: 4px; }
#hud .bars.me .name { color: var(--player); }
#hud .bars.foe .name { color: var(--rival); text-align: right; }
#hud .hp, #hud .en { height: 12px; background: #16162a; border: 1px solid #33334f; }
#hud .en { height: 6px; margin-top: 3px; }
#hud .hp > div { height: 100%; transition: width 0.12s; }
#hud .bars.me .hp > div { background: var(--player); }
#hud .bars.foe .hp > div { background: var(--rival); float: right; }
#hud .en > div { height: 100%; background: #7a6a2e; transition: width 0.2s, background 0.2s; }
#hud .en.ready > div { background: var(--gold); }
#hud .en .tag { font-size: 9px; color: var(--gold); letter-spacing: 1px; position: relative; top: -1px; }
#hud .combo {
  position: fixed; right: 8vw; top: 32vh; font-weight: bold;
  color: #fff; text-shadow: 0 0 12px var(--player); opacity: 0;
}
#hud .dmg {
  position: fixed; font-weight: bold; pointer-events: none;
  text-shadow: 0 0 6px currentColor; transform: translate(-50%, -50%);
}
#hud .announce {
  position: fixed; left: 0; right: 0; top: 26vh; text-align: center;
  font-weight: bold; letter-spacing: 6px; color: #fff;
  text-shadow: 0 0 24px rgba(255,77,106,0.9); opacity: 0;
  transition: opacity 0.3s; font-size: 42px;
}
`;

export class Hud {
  constructor({ camera }) {
    this.camera = camera;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.getElementById('hud');
    root.innerHTML = `
      <div class="bars me">
        <div class="name">YOU</div>
        <div class="hp"><div></div></div>
        <div class="en"><div></div></div>
      </div>
      <div class="bars foe">
        <div class="name">???</div>
        <div class="hp"><div></div></div>
        <div class="en"><div></div></div>
      </div>
      <div class="combo"></div>
      <div class="announce"></div>`;
    this.me = null; this.foe = null;
    this.el = {
      me: root.querySelector('.bars.me'),
      foe: root.querySelector('.bars.foe'),
      foeName: root.querySelector('.bars.foe .name'),
      combo: root.querySelector('.combo'),
      announce: root.querySelector('.announce'),
    };
    this.numbers = [];        // {el, world, t}
    this.comboShownT = 0;
    this._announceT = 0;
  }

  track(me, foe) { this.me = me; this.foe = foe; }
  showFoe(name) {
    this.el.foe.style.display = 'block';
    if (name) this.el.foeName.textContent = name;
  }
  hideFoe() { this.el.foe.style.display = 'none'; }

  announce(text, ms = 1800) {
    this.el.announce.textContent = text;
    this.el.announce.style.opacity = 1;
    this._announceT = ms / 1000;
  }

  consume(events) {
    for (const e of events) {
      if (e.type === 'hit') {
        this.spawnNumber(e.pos, `-${Math.round(e.amount)}`,
          e.kind === 'light' ? '#fff' : '#ffd24d', e.kind === 'light' ? 16 : 22);
        if (e.combo >= 2) this.showCombo(e.combo, e.att);
      } else if (e.type === 'blocked') {
        this.spawnNumber(e.pos, e.broke ? 'GUARD BROKEN' : 'BLOCK', '#ffd24d', 13);
      } else if (e.type === 'parried') {
        this.spawnNumber(e.pos, 'PARRY!', '#4dffb8', 20);
      } else if (e.type === 'dodged') {
        this.spawnNumber(e.pos, 'dodge', '#8a8aa5', 12);
      }
    }
    events.length = 0;
  }

  spawnNumber(world, text, color, size) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.textContent = text;
    document.getElementById('hud').appendChild(el);
    this.numbers.push({
      el, t: 0.8,
      world: new THREE.Vector3(world.x, world.y, world.z),
      drift: (Math.random() - 0.5) * 40,
    });
  }

  showCombo(n, attacker) {
    const el = this.el.combo;
    el.textContent = `${n} HITS`;
    el.style.fontSize = Math.min(20 + n * 4, 46) + 'px';
    el.style.textShadow = `0 0 14px ${attacker === this.me ? 'var(--player)' : 'var(--rival)'}`;
    el.style.opacity = 1;
    this.comboShownT = 1.0;
  }

  update(dt) {
    const bar = (rootEl, f) => {
      rootEl.querySelector('.hp > div').style.width = (f.hp / f.maxHp * 100) + '%';
      const en = rootEl.querySelector('.en');
      en.classList.toggle('ready', f.energy >= ENERGY.specialCost);
      en.firstElementChild.style.width = (f.energy / ENERGY.max * 100) + '%';
    };
    if (this.me) bar(this.el.me, this.me);
    if (this.foe && this.el.foe.style.display !== 'none') bar(this.el.foe, this.foe);

    // floating numbers: project world -> screen
    for (const n of this.numbers) {
      n.t -= dt;
      n.world.y += dt * 1.2;
      const p = n.world.clone().project(this.camera);
      n.el.style.left = ((p.x * 0.5 + 0.5) * innerWidth + n.drift * (0.8 - n.t)) + 'px';
      n.el.style.top = ((-p.y * 0.5 + 0.5) * innerHeight) + 'px';
      n.el.style.opacity = Math.max(0, Math.min(1, n.t * 2.5));
      if (n.t <= 0 || p.z > 1) { n.el.remove(); n.dead = true; }
    }
    this.numbers = this.numbers.filter(n => !n.dead);

    if (this.comboShownT > 0) {
      this.comboShownT -= dt;
      if (this.comboShownT <= 0) this.el.combo.style.opacity = 0;
    }
    if (this._announceT > 0) {
      this._announceT -= dt;
      if (this._announceT <= 0) this.el.announce.style.opacity = 0;
    }
  }
}
