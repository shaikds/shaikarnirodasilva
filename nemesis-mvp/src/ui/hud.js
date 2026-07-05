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
#hud .reticle {
  position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px;
  border: 2px solid var(--rival); border-radius: 50%; opacity: 0;
  box-shadow: 0 0 10px rgba(255,77,106,0.7); transition: opacity 0.15s;
}
#hud .reticle::before, #hud .reticle::after {
  content: ''; position: absolute; background: var(--rival);
}
#hud .reticle::before { left: 50%; top: -7px; width: 2px; height: 7px; margin-left: -1px; }
#hud .reticle::after { left: 50%; bottom: -7px; width: 2px; height: 7px; margin-left: -1px; }
#hud .plate {
  position: fixed; width: 130px; margin-left: -65px; text-align: center;
  opacity: 0; transform: translateY(-100%);
}
#hud .plate .pname {
  font-size: 11px; letter-spacing: 2px; color: var(--rival);
  text-shadow: 0 0 6px rgba(255,77,106,0.8); margin-bottom: 2px;
}
#hud .plate .phbar { height: 4px; background: #16162a; border: 1px solid #33334f; }
#hud .plate .phbar > div { height: 100%; background: var(--rival); transition: width 0.12s; }
#hud .flash {
  position: fixed; inset: 0; pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse at center, rgba(255,20,40,0) 45%, rgba(255,20,40,0.35) 100%);
}
#subtitles .who {
  font: bold 12px 'Courier New', monospace; color: var(--rival);
  letter-spacing: 3px; text-shadow: 0 0 8px rgba(255,77,106,0.8);
}
#subtitles .line {
  font: 16px 'Courier New', monospace; color: #eee; margin-top: 3px;
  text-shadow: 0 0 8px rgba(0,0,0,0.9); padding: 0 18vw;
}
#hud .goalhint {
  position: fixed; left: 0; right: 0; top: 60px; text-align: center;
  font: bold 12px 'Courier New', monospace; color: var(--rival);
  letter-spacing: 4px; opacity: 0; transition: opacity 0.3s;
  text-shadow: 0 0 10px rgba(255,77,106,0.7);
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
      <div class="announce"></div>
      <div class="reticle"></div>
      <div class="goalhint"></div>
      <div class="plate"><div class="pname"></div><div class="phbar"><div></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', '<div class="flash"></div>');
    this.me = null; this.foe = null;
    this.rig = null;
    this.el = {
      me: root.querySelector('.bars.me'),
      foe: root.querySelector('.bars.foe'),
      foeName: root.querySelector('.bars.foe .name'),
      combo: root.querySelector('.combo'),
      announce: root.querySelector('.announce'),
      reticle: root.querySelector('.reticle'),
      goalhint: root.querySelector('.goalhint'),
      plate: root.querySelector('.plate'),
      plateName: root.querySelector('.plate .pname'),
      plateBar: root.querySelector('.plate .phbar > div'),
      flash: document.querySelector('.flash'),
    };
    this.numbers = [];        // {el, world, t}
    this.comboShownT = 0;
    this._announceT = 0;
    this._flashT = 0;
  }

  track(me, foe) { this.me = me; this.foe = foe; }
  trackRig(rig) { this.rig = rig; }
  goalHintEnabled = true;                      // AC-3.4.5, on by default
  setGoalHint(text) {
    if (!this.goalHintEnabled) text = null;
    this.el.goalhint.textContent = text ? `NEMESIS: ${text}` : '';
    this.el.goalhint.style.opacity = text ? 1 : 0;
  }
  flashDamage(amount) {
    this._flashT = Math.min(0.5, this._flashT + amount / 40);
  }

  // project a world point to screen space; null if behind the camera
  _project(world) {
    const p = new THREE.Vector3(world.x, world.y, world.z).project(this.camera);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
  }
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

  // rival speech (AC-3.1.5): timed subtitle with the speaker's name
  subtitle(who, text, ms = 4000) {
    const root = document.getElementById('subtitles');
    root.innerHTML = `<div class="who">${who}</div><div class="line">${text}</div>`;
    root.style.opacity = 1;
    this._subtitleT = ms / 1000;
  }

  consume(events) {
    for (const e of events) {
      if (e.type === 'hit') {
        this.spawnNumber(e.pos, `-${Math.round(e.amount)}`,
          e.kind === 'light' ? '#fff' : '#ffd24d', e.kind === 'light' ? 16 : 22);
        if (e.combo >= 2) this.showCombo(e.combo, e.att);
        if (e.def === this.me) this.flashDamage(e.amount);
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

    // lock-on reticle: follows the locked target's head in screen space
    if (this.rig?.lockTarget?.alive) {
      const t = this.rig.lockTarget;
      const scr = this._project({ x: t.pos.x, y: t.pos.y + 1.72, z: t.pos.z });
      if (scr) {
        this.el.reticle.style.left = scr.x + 'px';
        this.el.reticle.style.top = scr.y + 'px';
        this.el.reticle.style.opacity = 1;
      } else this.el.reticle.style.opacity = 0;
    } else {
      this.el.reticle.style.opacity = 0;
    }

    // floating nameplate + health above the rival, whenever it's on-screen
    if (this.foe?.alive) {
      const scr = this._project({ x: this.foe.pos.x, y: this.foe.pos.y + 2.15, z: this.foe.pos.z });
      if (scr) {
        this.el.plate.style.left = scr.x + 'px';
        this.el.plate.style.top = scr.y + 'px';
        this.el.plate.style.opacity = 1;
        this.el.plateName.textContent = this.el.foeName.textContent;
        this.el.plateBar.style.width = (this.foe.hp / this.foe.maxHp * 100) + '%';
      } else this.el.plate.style.opacity = 0;
    } else {
      this.el.plate.style.opacity = 0;
    }

    // damage-taken screen flash
    if (this._flashT > 0) {
      this._flashT = Math.max(0, this._flashT - dt * 1.6);
      this.el.flash.style.opacity = Math.min(1, this._flashT * 2.2);
    }

    // subtitle timeout
    if (this._subtitleT > 0) {
      this._subtitleT -= dt;
      if (this._subtitleT <= 0) document.getElementById('subtitles').style.opacity = 0;
    }
  }
}
