// Fighter: the single combat rulebook shared by player and rival.
// P1: kinematics (move/jump/dodge with i-frames, facing, collision).
// P2: combat states — attack (chains/cancels), block, parry, stagger,
//     hitstun, death — all driven by the data in attacks.js.
//
// A Fighter consumes an INTENT each tick:
//   { move: {x,z}, face: yaw|null, jump, dodge }
// and exposes canStart()/startAttack()/startBlock() for its producer
// (PlayerController or RivalAgent) to call at actionable moments — that,
// plus the Input press-buffer, is what makes buffering frame-perfect.

import * as THREE from 'three';
import { MOVE } from '../core/tuning.js';
import { ATTACKS, DEFENSE, ENERGY, SAIYAN } from './attacks.js';
import { softDot } from '../fx/textures.js';

export class Fighter {
  constructor({ scene, color = 0x4db8ff, emissive = 0x0a2438, pos = [0, 0, 0], name = 'fighter' }) {
    this.name = name;
    this.pos = new THREE.Vector3(...pos);
    this.prevPos = this.pos.clone();
    this.vy = 0;
    this.yaw = 0;
    this.maxHp = 100; this.hp = 100;
    this.energy = 30;
    this.stats = { attack: 1.0, hpMult: 1.0, speed: 1.0 };   // rival progression hooks (FR-2.3)

    this.state = 'idle';   // idle|dodge|attack|block|parryRecover|stagger|hitstun|dead
    this.stateT = 0;
    this.attackType = null;
    this.phase = null;     // windup|active|recover
    this.hitLanded = false;
    this.blockT = 0;       // seconds since block started (parry window)
    this.iframeT = 0;
    this.dodgeCd = 0;
    this.grounded = true;
    this.dodgeVec = new THREE.Vector2();
    this.kb = new THREE.Vector2();          // knockback velocity
    this.combo = 0; this.comboT = 0;
    this.radius = MOVE.radius;
    this.height = MOVE.height;
    this.intent = { move: { x: 0, z: 0 }, face: null, jump: false, dodge: false, rise: 0, dash: false };
    this.trace = [];       // state-transition log for tests/debug (capped)
    this.deadT = 0;
    // M7 Saiyan combat (FR-7.x)
    this.canFly = false;   // unlocked by the Genesis Flow (AC-7.1.2)
    this.flying = false;
    this.dashTarget = null;      // Fighter | null: dash homes on this in 3D
    this.kiCd = 0;
    this.pendingKi = false;
    this.surge = false;
    this.surgeMeter = 0;
    this.power = 0;              // zenkai power level (persisted for the player)

    // body — readable blockout silhouette with a bit of armor shape
    this.mesh = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.55, metalness: 0.15 });
    this.baseColor = new THREE.Color(color);
    this.mat = mat;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 6, 12), mat);
    this.body.position.y = 0.95;
    this.body.castShadow = true;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat.clone());
    this.head.position.y = 1.72;
    this.head.castShadow = true;
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    nose.position.set(0, 1.72, 0.3);
    // shoulder pads: break up the pure-capsule silhouette
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.4, metalness: 0.4 });
    const padGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const padL = new THREE.Mesh(padGeo, padMat); padL.position.set(-0.38, 1.42, 0);
    const padR = new THREE.Mesh(padGeo, padMat); padR.position.set(0.38, 1.42, 0);
    padL.castShadow = padR.castShadow = true;
    // weapon: hilt + blade, swings on attacks — reads as an actual weapon now
    this.arm = new THREE.Group();
    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.28, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 0.7 })
    );
    hilt.rotation.z = Math.PI / 2; hilt.position.z = -0.1;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.03, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e8, emissive: 0x333344, roughness: 0.25, metalness: 0.75 })
    );
    blade.position.z = 0.45;
    this.arm.add(hilt, blade);
    this.arm.castShadow = true;
    this.arm.position.set(0.45, 1.15, 0.3);
    // team-color rim light: makes the silhouette pop against a dark arena
    this.rim = new THREE.PointLight(color, 1.1, 3.5, 2);
    this.rim.position.set(0, 1.3, -0.3);
    this.mesh.add(this.body, this.head, nose, padL, padR, this.arm, this.rim);
    scene.add(this.mesh);
    this.flashT = 0;
    this.syncMesh(1);
  }

  _trace(evt) {
    this.trace.push({ t: this._now ?? 0, ...evt });
    if (this.trace.length > 300) this.trace.shift();
  }
  _setState(s) {
    this.state = s;
    this._trace({ state: s, type: this.attackType, phase: this.phase });
  }

  get busy() {
    return this.state === 'attack' || this.state === 'dodge' ||
           this.state === 'stagger' || this.state === 'hitstun' ||
           this.state === 'parryRecover' || this.state === 'dead';
  }
  get blocking() { return this.state === 'block'; }
  get invulnerable() { return this.iframeT > 0; }
  get alive() { return this.state !== 'dead'; }

  // ---- action legality: the cancel/chain rulebook (AC-4.6.2) ----
  canStart(action) {
    if (!this.alive) return false;
    if (this.state === 'idle' || this.state === 'block') {
      if (action === 'special') return this.energy >= ENERGY.specialCost;
      return true;
    }
    if (this.state === 'attack') {
      const def = ATTACKS[this.attackType];
      if (this.phase !== 'recover') return false;        // windup/active commit
      if (action === 'light' && def.chain) return true;  // chain link
      if (action === 'dodge' && def.cancelRecover.includes('dodge')) return true;
      if (action === 'block' && def.cancelRecover.includes('block')) return true;
      return false;
    }
    return false;
  }

  startAttack(action) {
    // resolve chain step: pressing light mid-string continues the string
    let key = action;
    if (action === 'light') {
      key = (this.state === 'attack' && this.phase === 'recover' &&
             ATTACKS[this.attackType]?.chain)
        ? ATTACKS[this.attackType].chain : 'light1';
    }
    const def = ATTACKS[key];
    if (!def) return false;
    if (def.kind === 'special') {
      if (this.energy < ENERGY.specialCost) return false;
      this.energy -= ENERGY.specialCost;
    }
    this.attackType = key;
    this.phase = 'windup';
    this.stateT = def.windup;
    this.hitLanded = false;
    this._setState('attack');
    this.onAction?.(def.kind);          // profiler hook (FR-3.3)
    return true;
  }

  startBlock() {
    if (this.state !== 'idle' &&
        !(this.state === 'attack' && this.canStart('block'))) return false;
    this.blockT = 0;
    this.attackType = null; this.phase = null;
    this._setState('block');
    this.onAction?.('block');
    return true;
  }
  stopBlock() {
    if (this.state !== 'block') return;
    if (this.blockT <= DEFENSE.parryWindow) {
      // whiffed parry attempt: a read, not a mash (AC-4.3.2)
      this.stateT = DEFENSE.parryWhiffRecover;
      this._setState('parryRecover');
    } else {
      this._setState('idle');
    }
  }

  startDodge(dirX, dirZ) {
    if (this.dodgeCd > 0 || !this.grounded) return false;
    if (this.state !== 'idle' && this.state !== 'block' &&
        !(this.state === 'attack' && this.canStart('dodge'))) return false;
    this.attackType = null; this.phase = null;
    this.stateT = MOVE.dodge.dur;
    this.iframeT = MOVE.dodge.iframes;
    this.dodgeCd = MOVE.dodge.cooldown;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.01) this.dodgeVec.set(dirX / len, dirZ / len);
    else this.dodgeVec.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
    this._setState('dodge');
    this.onAction?.('dodge');
    return true;
  }

  // ---- incoming hit reactions (resolver calls these) ----
  // hpFloor > 0 makes death impossible (AC-1.3.5, First Blood): the clamp
  // must live HERE, where damage lands — clamping a tick later in the flow
  // races a killing blow, which marks the fighter dead before the clamp
  // and nothing un-dies a state machine.
  hpFloor = 0;
  applyDamage(amount) {
    this.hp = Math.max(this.hpFloor, this.hp - amount);
    this.flashT = 0.12;
    if (this.hp <= 0 && this.alive) {
      this.attackType = null; this.phase = null;
      this.deadT = 0;
      this.flying = false;                 // AC-7.1.4: the body falls
      this._setAura?.(null);
      this._setState('dead');
    }
  }
  flinch(dur = DEFENSE.flinch) {
    if (!this.alive) return;
    this.attackType = null; this.phase = null;
    this.stateT = dur;
    this._setState('hitstun');
  }
  stagger(dur) {
    if (!this.alive) return;
    this.attackType = null; this.phase = null;
    this.stateT = dur;
    this._setState('stagger');
  }
  knockback(dirX, dirZ, power) {
    this.kb.set(dirX * power, dirZ * power);
  }
  gainEnergy(n) { this.energy = Math.min(ENERGY.max, this.energy + n); }

  // ---- M7: flight / dash / ki / surge (FR-7.x) ----
  toggleFlight() {
    if (!this.canFly || !this.alive) return false;
    if (this.flying) {
      this.flying = false;                 // gravity takes over
      this._setAura(this.surge ? 'gold' : null);
    } else {
      this.flying = true;
      this.grounded = false;
      this.vy = 0;
      if (this.pos.y < 0.6) this.pos.y = 0.6;
      this._setAura(this.surge ? 'gold' : 'white');
      this._trace({ state: 'fly' });
    }
    return true;
  }

  fireKi() {
    if (!this.alive || this.busy || this.kiCd > 0) return false;
    if (this.energy < ATTACKS.ki.cost) return false;
    this.energy -= ATTACKS.ki.cost;
    this.kiCd = ATTACKS.ki.cooldown;
    this.pendingKi = true;                 // main loop spawns the projectile
    this.onAction?.('special');            // profiled as ranged pressure
    return true;
  }

  gainSurge(n) {
    if (this.surge) return;
    this.surgeMeter = Math.min(SAIYAN.surge.max, this.surgeMeter + n);
  }

  transform() {
    if (this.surge || !this.alive) return false;
    this.surge = true;
    this._setAura('gold');
    this._trace({ state: 'surge' });
    this.justTransformed = true;           // main loop announces + bursts
    return true;
  }
  get surgeMult() { return this.surge ? SAIYAN.surge.dmgMult : 1; }
  get speedMult() { return this.stats.speed * (this.surge ? SAIYAN.surge.speedMult : 1); }

  _setAura(kind) {
    if (!this._aura) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDot, color: 0xffffff, transparent: true, opacity: 0.22,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sprite.scale.set(1.7, 2.3, 1);
      sprite.position.y = 1.0;
      const light = new THREE.PointLight(0xffffff, 0, 3.5, 2);
      light.position.y = 1.2;
      this.mesh.add(sprite, light);
      this._aura = { sprite, light };
    }
    const a = this._aura;
    if (kind === 'gold') {
      a.sprite.visible = true;
      a.sprite.material.color.setHex(0xffd24d);
      a.sprite.material.opacity = 0.35;
      a.light.color.setHex(0xffd24d);
      a.light.intensity = 1.6;
    } else if (kind === 'white') {
      a.sprite.visible = true;
      a.sprite.material.color.setHex(0xbfd8ff);
      a.sprite.material.opacity = 0.18;
      a.light.color.setHex(0xbfd8ff);
      a.light.intensity = 0.7;
    } else {
      a.sprite.visible = false;
      a.light.intensity = 0;
    }
  }

  // back on their feet: used by the Genesis Flow for respawns/rematches
  revive(pos = null) {
    this.hp = this.maxHp;
    this.energy = 30;
    this.state = 'idle'; this.stateT = 0;
    this.attackType = null; this.phase = null;
    this.combo = 0; this.comboT = 0;
    this.kb.set(0, 0); this.iframeT = 0; this.dodgeCd = 0;
    this.deadT = 0; this.vy = 0; this.grounded = true;
    this.flying = false;
    this.surge = false; this.surgeMeter = 0; this.kiCd = 0;
    this._setAura(null);
    if (pos) { this.pos.set(pos.x, 0, pos.z); this.prevPos.copy(this.pos); }
    this.mesh.rotation.z = 0;
    this.mesh.position.y = 0;
    this._trace({ state: 'revive' });
  }

  // ---- per-tick simulation ----
  update(dt, zone, now = 0) {
    this._now = now;
    this.prevPos.copy(this.pos);
    this.iframeT = Math.max(0, this.iframeT - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.alive) this.gainEnergy(ENERGY.passivePerS * dt);
    const it = this.intent;

    switch (this.state) {
      case 'dodge': {
        const speed = MOVE.dodge.dist / MOVE.dodge.dur;
        this.pos.x += this.dodgeVec.x * speed * dt;
        this.pos.z += this.dodgeVec.y * speed * dt;
        this.stateT -= dt;
        if (this.stateT <= 0) this._setState('idle');
        break;
      }
      case 'attack': {
        const def = ATTACKS[this.attackType];
        // soft target tracking during windup only (AC-4.2.4)
        if (this.phase === 'windup' && it.face != null) {
          let d = it.face - this.yaw;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          const max = def.track * dt;
          this.yaw += Math.max(-max, Math.min(max, d));
        }
        // forward lunge across active frames sells the strike
        if (this.phase === 'active' && def.lunge) {
          const v = def.lunge / def.active;
          this.pos.x += Math.sin(this.yaw) * v * dt;
          this.pos.z += Math.cos(this.yaw) * v * dt;
        }
        this.stateT -= dt;
        if (this.stateT <= 0) {
          if (this.phase === 'windup') {
            this.phase = 'active'; this.stateT = def.active;
            if (def.projectile) this.pendingShot = true;   // P3 consumes
            this._trace({ state: 'attack', type: this.attackType, phase: 'active' });
          } else if (this.phase === 'active') {
            this.phase = 'recover'; this.stateT = def.recover;
            this._trace({ state: 'attack', type: this.attackType, phase: 'recover' });
          } else {
            this.attackType = null; this.phase = null;
            this._setState('idle');
          }
        }
        break;
      }
      case 'block': {
        this.blockT += dt;
        this.pos.x += it.move.x * MOVE.speed * DEFENSE.blockMoveMult * this.stats.speed * dt;
        this.pos.z += it.move.z * MOVE.speed * DEFENSE.blockMoveMult * this.stats.speed * dt;
        if (it.face != null) this._turnToward(it.face, dt);
        break;
      }
      case 'parryRecover':
      case 'stagger':
      case 'hitstun': {
        this.stateT -= dt;
        if (this.stateT <= 0) this._setState('idle');
        break;
      }
      case 'dead': {
        this.deadT += dt;
        break;
      }
      case 'idle': {
        if (it.dodge) { it.dodge = false; this.startDodge(it.move.x, it.move.z); break; }

        // ki dash (FR-7.2): full-3D rush toward the dash target
        if (it.dash && this.energy > SAIYAN.dash.minEnergy) {
          const t = this.dashTarget;
          let dir;
          if (t?.alive) {
            dir = new THREE.Vector3(
              t.pos.x - this.pos.x, (t.pos.y - this.pos.y) * (this.flying ? 1 : 0),
              t.pos.z - this.pos.z);
            if (dir.length() < SAIYAN.dash.stopRange) { it.dash = false; break; }
          } else {
            dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          }
          dir.normalize();
          this.pos.addScaledVector(dir, SAIYAN.dash.speed * dt);
          this.energy = Math.max(0, this.energy - SAIYAN.dash.energyPerS * dt);
          if (it.face != null) this._turnToward(it.face, dt);
          break;
        }

        if (this.flying) {
          // free flight (FR-7.1): planar + vertical, no gravity
          const spd = SAIYAN.flight.speed * this.speedMult;
          this.pos.x += it.move.x * spd * dt;
          this.pos.z += it.move.z * spd * dt;
          this.pos.y += (it.rise ?? 0) * SAIYAN.flight.rise * dt;
        } else {
          const ctl = (this.grounded ? 1 : MOVE.airCtl) * this.speedMult;
          this.pos.x += it.move.x * MOVE.speed * ctl * dt;
          this.pos.z += it.move.z * MOVE.speed * ctl * dt;
          if (it.jump && this.grounded) { this.vy = MOVE.jumpV; this.grounded = false; }
        }
        it.jump = false;
        let targetYaw = null;
        if (it.face != null) targetYaw = it.face;
        else if (Math.hypot(it.move.x, it.move.z) > 0.05) {
          targetYaw = Math.atan2(it.move.x, it.move.z);
        }
        if (targetYaw != null) this._turnToward(targetYaw, dt, true);
        break;
      }
    }

    // knockback decay applies in any state except dead
    if (this.alive && this.kb.lengthSq() > 0.0001) {
      this.pos.x += this.kb.x * dt;
      this.pos.z += this.kb.y * dt;
      this.kb.multiplyScalar(Math.exp(-7 * dt));
    }

    // vertical physics (suspended while flying)
    if (this.flying) {
      this.pos.y = Math.max(0.4, Math.min(SAIYAN.flight.maxAlt, this.pos.y));
    } else if (!this.grounded) {
      this.vy -= MOVE.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    }

    // ki cooldown + auto-transform at full surge (AC-7.4.1)
    this.kiCd = Math.max(0, this.kiCd - dt);
    if (!this.surge && this.surgeMeter >= SAIYAN.surge.max && this.alive) this.transform();

    zone.collide(this.pos, this.radius, this.height);
    // flyers must respect the zone bounds too (walls are only 3m tall)
    this.pos.x = Math.max(-49.4, Math.min(49.4, this.pos.x));
    this.pos.z = Math.max(-51.4, Math.min(19.4, this.pos.z));
  }

  _turnToward(targetYaw, dt, smooth = false) {
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    this.yaw += smooth ? d * Math.min(1, MOVE.turnRate * dt) : d * Math.min(1, 14 * dt);
  }

  // ---- render sync: pose tells per state (blockout-readable) ----
  syncMesh(alpha) {
    this.mesh.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.mesh.rotation.y = this.yaw;
    this.mat.emissive.setHex(this.flashT > 0 ? 0x664444 : this._baseEmissive ?? this.mat.emissive.getHex());
    if (this._baseEmissive == null) this._baseEmissive = this.mat.emissive.getHex();

    let armX = 0.45, armY = 1.15, armRotX = 0, bodyRotX = 0, bodyRotZ = 0;
    if (this.state === 'attack') {
      const def = ATTACKS[this.attackType] || {};
      if (this.phase === 'windup') { armRotX = 0.9; armY = 1.5; }            // raised: the telegraph
      else if (this.phase === 'active') { armRotX = -1.1; armY = 1.0; }      // swung through
      else { armRotX = -0.4; }
      if (def.kind === 'heavy') bodyRotX = this.phase === 'windup' ? -0.12 : 0.15;
      if (def.kind === 'special') { armRotX = 0.2; armX = 0.2; armY = 1.3; } // both-hands charge
    } else if (this.state === 'block') {
      armRotX = 0.35; armX = 0.15; armY = 1.35;                              // guard up
    } else if (this.state === 'dodge') {
      bodyRotX = (1 - this.stateT / MOVE.dodge.dur) * Math.PI * 0.12;
    } else if (this.state === 'stagger' || this.state === 'hitstun') {
      bodyRotZ = 0.18;
    } else if (this.state === 'dead') {
      const k = Math.min(1, this.deadT / 0.5);
      bodyRotZ = k * Math.PI / 2;
      this.mesh.position.y = -k * 0.2;
    }
    this.arm.rotation.x = armRotX;
    this.arm.position.set(armX, armY, 0.3);
    this.body.rotation.x = bodyRotX;
    this.mesh.rotation.z = bodyRotZ;
  }

  distanceTo(other) {
    const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
    return Math.hypot(dx, dz);
  }
  yawTo(other) {
    return Math.atan2(other.pos.x - this.pos.x, other.pos.z - this.pos.z);
  }
}
