// Training dummy brain: deliberately simple scripted modes used by the
// tutorial (FR-1.1) and as scaffolding for combat tests. Not the rival —
// the rival's brain is ai/rivalAgent.js.

export class DummyBrain {
  constructor(fighter, target) {
    this.f = fighter;
    this.target = target;
    this.mode = 'idle';          // idle | block | attack
    this.attackEvery = 1.6;      // s, in attack mode
    this._t = 0;
  }

  update(dt) {
    const f = this.f;
    if (!f.alive) return;
    f.intent.move.x = 0; f.intent.move.z = 0;
    f.intent.face = this.target ? f.yawTo(this.target) : null;

    if (this.mode === 'block') {
      if (!f.blocking && f.canStart('block')) f.startBlock();
    } else if (f.blocking) {
      f.blockT = 1;              // scripted dummy never parries by accident
      f.stopBlock();
    }

    if (this.mode === 'attack') {
      this._t -= dt;
      if (this._t <= 0 && f.canStart('light')) {
        f.startAttack('light');
        this._t = this.attackEvery;
      }
    }
  }
}
