// Combat resolver: melee arcs, block/parry outcomes, combo scaling,
// hitstop, camera feedback. One rulebook for every fighter pair.
// Emits events consumed by the HUD (and the profiler in P3).

import { ATTACKS, DEFENSE, COMBO, ENERGY, FEEL, SAIYAN, CHARGE } from './attacks.js';

export class Resolver {
  constructor({ loop, rig }) {
    this.loop = loop;
    this.rig = rig;
    this.events = [];          // drained by HUD each render
    this.listeners = [];       // (event) => void  — profiler/rivalry hooks
  }

  on(fn) { this.listeners.push(fn); }
  _emit(e) {
    this.events.push(e);
    for (const fn of this.listeners) fn(e);
  }

  // call once per tick with every attacker/defender pair
  meleePair(att, def) {
    if (att.state !== 'attack' || att.phase !== 'active' || att.hitLanded) return;
    const a = ATTACKS[att.attackType];
    if (!a || a.kind === 'special') return;    // specials resolve via projectiles
    if (!def.alive) return;

    // frontal arc test (AC-4.2.5) + vertical reach (AC-7.1.3: flyers can't
    // melee targets far above/below them)
    const dx = def.pos.x - att.pos.x, dz = def.pos.z - att.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > a.range + def.radius) return;
    if (Math.abs(def.pos.y - att.pos.y) > SAIYAN.flight.meleeReachY) return;
    const toDef = Math.atan2(dx, dz);
    let dyaw = toDef - att.yaw;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    if (Math.abs(dyaw) > (a.arcDeg / 2) * Math.PI / 180) return;

    att.hitLanded = true;
    this.strike(att, def, a, { x: dx / (dist || 1), z: dz / (dist || 1) },
      att.attackCharge ?? 0);
  }

  // shared outcome logic (projectiles reuse this with their own attack def)
  strike(att, def, a, dir, charge = 0) {
    const kind = a.kind;
    const hitPos = { x: def.pos.x, y: def.pos.y + 1.2, z: def.pos.z };

    // 1) dodge i-frames beat everything (AC-4.3.3)
    if (def.invulnerable) {
      this._emit({ type: 'dodged', att, def, pos: hitPos, kind });
      return 'dodged';
    }

    // 2) parry: block younger than the parry window (AC-4.3.2)
    if (def.blocking && def.blockT <= DEFENSE.parryWindow) {
      att.stagger(DEFENSE.parryAttackerStagger);
      def.blockT = DEFENSE.parryWindow + 0.001;   // one parry per block press
      this.loop.hitstop(FEEL.hitstopMs.parried);
      this.rig?.shake(FEEL.shake.parried);
      this._emit({ type: 'parried', att, def, pos: hitPos, kind });
      return 'parried';
    }

    // combo-scaled damage (AC-4.5.1), rival stat hook (FR-2.3),
    // surge transformation multiplier (AC-7.4.1)
    const scale = 1 + Math.min(att.combo * COMBO.dmgPerStep, COMBO.dmgCap);
    let dmg = a.dmg * scale * (att.stats?.attack ?? 1) * (att.surgeMult ?? 1);
    // FR-8.3: held power — tap x1 ... full x2.2 (linear in between)
    if (charge > 0) dmg *= 1 + (CHARGE.dmgMultAtFull - 1) * charge;

    // 3) block
    if (def.blocking) {
      dmg *= 1 - DEFENSE.blockReduce[kind];
      def.applyDamage(dmg);
      def.gainEnergy(ENERGY.onHitTaken * 0.5);
      def.knockback(dir.x, dir.z, a.knock * 0.4);
      if (a.blockBreak) def.stagger(DEFENSE.blockedHeavyStagger);   // AC-4.2.2
      this.loop.hitstop(FEEL.hitstopMs.blocked);
      this.rig?.shake(FEEL.shake.blocked);
      this._emit({ type: 'blocked', att, def, pos: hitPos, kind, amount: dmg, broke: !!a.blockBreak });
      return 'blocked';
    }

    // 4) clean hit
    def.applyDamage(dmg);
    def.gainEnergy(ENERGY.onHitTaken);
    att.gainEnergy(a.energyGain ?? ENERGY.onHitLanded);
    // Saiyans feed on battle (AC-7.4.1): both meters climb
    att.gainSurge?.(dmg * SAIYAN.surge.gainDealt);
    def.gainSurge?.(dmg * SAIYAN.surge.gainTaken);
    def.combo = 0;                                   // their chain breaks
    att.combo++; att.comboT = COMBO.window;
    // FR-8.3.2: a charged BLAST sends them FLYING until they get up
    const blast = a.chargeable && charge >= CHARGE.blastAt && def.alive;
    if (def.alive) {
      if (blast) {
        def.enterFlyaway(dir.x, dir.z, charge);
      } else {
        if (kind === 'light') def.flinch();
        else def.stagger(DEFENSE.heavyStagger);      // AC-4.6.5
        def.knockback(dir.x, dir.z, a.knock);
        if (a.launcher) {                            // heavy LAUNCHES: the
          def.vy = Math.max(def.vy, a.launchVy ?? 3.6);  // Sparking smash->pursuit loop
          def.grounded = false;
          def.flying = false;
        }
      }
    }
    this.loop.hitstop(blast ? FEEL.hitstopMs.heavy * 1.6 : FEEL.hitstopMs[kind]);
    this.rig?.shake(blast ? FEEL.shake.special * 1.5 : FEEL.shake[kind]);
    if (kind !== 'light') this.rig?.impulse(dir.x * FEEL.impulse, 0.05, dir.z * FEEL.impulse);
    if (att.combo >= COMBO.slowmoAt) this.loop.slowmo(COMBO.slowmoMs, COMBO.slowmoFactor);
    if (blast) this._emit({ type: 'blast', att, def, pos: hitPos, charge });
    this._emit({
      type: 'hit', att, def, pos: hitPos, kind,
      amount: dmg, combo: att.combo, killed: !def.alive,
    });
    return 'hit';
  }
}
