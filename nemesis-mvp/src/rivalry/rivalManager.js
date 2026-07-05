// Rivalry Manager (FR-2.1/2.2/2.3, FR-6.1): the rival's persistent
// identity — profile document, ledger, XP/level progression that invests
// level-ups in countering the player's dominant style, appearance tags
// that mark every defeat, and the 0–100 hate scale.

import * as THREE from 'three';
import { Ledger } from './ledger.js';
import { SAIYAN } from '../combat/attacks.js';

const KEY = 'nemesis-rival-v1';
const NAMES = ['VEXAR', 'MORDRETH', 'SERAK', 'NYXIM', 'DRAVUS', 'KHARGOTH'];

// hate deltas per event (AC-2.1.4; duel_lost_by_rival documented in plan §6)
export const HATE = {
  player_fled_first_duel: 25,
  rival_fled_first_duel: 40,     // humiliation
  duel_lost_by_rival: 15,
  duel_won_by_rival: -10,
  player_escaped_duel: 10,
  taunt_ignored: 5,
};

// style-relative growth (AC-2.3.3): dominant player style -> stat investment
const GROWTH = {
  blocking: { attack: 0.08, hpMult: 0.00, speed: 0.00 },   // break through
  aggressive: { attack: 0.00, hpMult: 0.08, speed: 0.00 }, // outlast
  special: { attack: 0.00, hpMult: 0.00, speed: 0.05 },    // close distance
  balanced: { attack: 0.03, hpMult: 0.03, speed: 0.015 },
};

// appearance tags: the rival carries the mark of every defeat (AC-2.1.3)
const TAG_RULES = [
  { tag: 'Scarred', when: (m) => m.doc.record.losses >= 1 },
  { tag: 'OneEye', when: (m) => m.doc.record.losses >= 3 },
  { tag: 'Burning', when: (m) => m.doc.emotionalState >= 90 },
];

export class RivalManager {
  constructor({ store, profile, sync }) {
    this.store = store;
    this.playerProfile = profile;
    this.sync = sync;
    this.doc = null;
    this.ledger = null;
    this._tagMeshes = [];
  }

  get exists() { return this.store.getJSON(KEY) != null; }

  loadOrCreate() {
    const saved = this.store.getJSON(KEY);
    if (saved) {
      this.doc = saved.profile;
      this.ledger = new Ledger(saved.ledger);
      // restore the shared minds (AC-6.1.2)
      Object.assign(this.playerProfile, this.doc.styleProfile || {});
      this.sync.rating = this.doc.rating ?? 1000;
      return 'restored';
    }
    this.doc = {
      name: NAMES[(Math.random() * NAMES.length) | 0],
      level: 1,
      xp: 0,
      stats: { hp: 100, attack: 1.0, speed: 1.0 },
      appearanceTags: [],
      emotionalState: 0,
      record: { wins: 0, losses: 0, escapes: 0 },
      styleProfile: {},
      rating: 1000,
      createdAt: new Date().toISOString(),
    };
    this.ledger = new Ledger();
    return 'created';
  }

  save() {
    this.doc.styleProfile = this.playerProfile.toJSON();
    this.doc.rating = +this.sync.rating.toFixed(1);
    this.store.setJSON(KEY, { profile: this.doc, ledger: this.ledger.toJSON() });
  }

  reset() {
    this.store.remove(KEY);
  }

  hate(delta) {
    this.doc.emotionalState = Math.max(0, Math.min(100, this.doc.emotionalState + delta));
  }

  record(event, label, data) {
    if (event in HATE) this.hate(HATE[event]);
    const entry = this.ledger.add(event, label, data);
    this.save();
    return entry;
  }

  // one style observation per completed duel (AC-2.2.2)
  styleObservation() {
    const p = this.playerProfile;
    const pct = v => Math.round(v * 100) + '%';
    const traits = [
      [p.defenseRate, `Player defended ${pct(p.defenseRate)} of my attacks`],
      [p.heavyPref, `Player favors heavy strikes (${pct(p.heavyPref)})`],
      [p.aggression, `Player attacks relentlessly (${pct(p.aggression)} aggression)`],
      [p.specialPref * 3, `Player leans on their special (${pct(p.specialPref)} of attacks)`],
      [1 - p.aggression, `Player hides and waits (${pct(1 - p.aggression)} passive)`],
    ];
    traits.sort((a, b) => b[0] - a[0]);
    return traits[0][1];
  }

  // called exactly once per finished duel (FR-2.3)
  onDuelEnd({ playerHp, rivalHp }) {
    const playerWon = this.sync.roundEnd(playerHp, rivalHp);
    this.playerProfile.rounds++;
    if (playerWon) {
      this.doc.record.losses++;
      this.record('duel_lost', `Defeated by the player (${Math.round(playerHp)} HP left).`);
    } else {
      this.doc.record.wins++;
      this.record('duel_won', `Crushed the player (${Math.round(rivalHp)} HP left).`);
    }
    if (playerWon) this.hate(HATE.duel_lost_by_rival);
    else this.hate(HATE.duel_won_by_rival);
    this.ledger.add('observation', this.styleObservation());

    // Zenkai (AC-7.4.3): the player grows every duel — MORE from defeat
    this.doc.playerPower = Math.min(SAIYAN.zenkai.powerCap,
      (this.doc.playerPower ?? 0) + (playerWon ? SAIYAN.zenkai.win : SAIYAN.zenkai.loss));

    // XP + level-ups (AC-2.3.2): the rival grows win or lose
    this.doc.xp += playerWon ? 40 : 25;
    while (this.doc.xp >= 100 * this.doc.level) {
      this.doc.xp -= 100 * this.doc.level;
      this.doc.level++;
      const g = GROWTH[this.dominantPlayerStyle()];
      this.doc.stats.attack = +(this.doc.stats.attack + g.attack).toFixed(3);
      this.doc.stats.hpMult = +((this.doc.stats.hpMult ?? 1) + g.hpMult).toFixed(3);
      this.doc.stats.hp = Math.round(100 * this.doc.stats.hpMult);
      this.doc.stats.speed = +(this.doc.stats.speed + g.speed).toFixed(3);
      this.ledger.add('rival_trained', `Reached level ${this.doc.level}. It studied your ${this.dominantPlayerStyle()} style.`);
    }
    this.refreshTags();
    this.save();
    return playerWon;
  }

  dominantPlayerStyle() {
    const p = this.playerProfile;
    if (p.defenseRate > 0.45) return 'blocking';
    if (p.specialPref > 0.15) return 'special';
    if (p.aggression > 0.65) return 'aggressive';
    return 'balanced';
  }

  refreshTags() {
    for (const r of TAG_RULES) {
      if (r.when(this) && !this.doc.appearanceTags.includes(r.tag)) {
        this.doc.appearanceTags.push(r.tag);
      }
    }
  }

  // zenkai power -> the player Fighter (AC-7.4.3): gentle, capped
  applyPlayerGrowth(f) {
    const p = this.doc.playerPower ?? 0;
    f.power = p;
    f.stats.attack = 1 + Math.min(p, SAIYAN.zenkai.powerCap) * SAIYAN.zenkai.dmgPerPower;
  }

  // stats + tags -> the actual Fighter (called on spawn/duel start)
  applyToFighter(f) {
    const hpMult = this.doc.stats.hpMult ?? 1;
    f.maxHp = Math.round(100 * hpMult);
    f.hp = Math.min(f.hp, f.maxHp);
    f.stats.attack = this.doc.stats.attack;
    f.stats.speed = this.doc.stats.speed;
    this.applyTagVisuals(f);
  }

  applyTagVisuals(f) {
    for (const m of this._tagMeshes) f.mesh.remove(m);
    this._tagMeshes = [];
    const add = (mesh) => { f.mesh.add(mesh); this._tagMeshes.push(mesh); };
    for (const tag of this.doc.appearanceTags) {
      if (tag === 'Scarred') {
        const scar = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.7, 0.06),
          new THREE.MeshBasicMaterial({ color: 0xff2244 })
        );
        scar.position.set(0.18, 1.1, 0.38);
        scar.rotation.z = 0.5;
        add(scar);
      } else if (tag === 'OneEye') {
        const patch = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.1, 0.06),
          new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        patch.position.set(-0.09, 1.76, 0.2);
        add(patch);
      } else if (tag === 'Burning') {
        const aura = new THREE.Mesh(
          new THREE.SphereGeometry(0.75, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.16 })
        );
        aura.position.y = 1.1;
        add(aura);
      }
    }
  }
}
