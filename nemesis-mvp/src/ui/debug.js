// Debug panel (FR-6.2): live rivalry state + forcing actions, enough to
// reproduce every AC in the spec manually. Toggled with ` (Backquote).

export class DebugPanel {
  constructor(game) {
    this.g = game;                 // { manager, profile, sync, rivalAgent, player, rival, loop, macroAgent? }
    this.root = document.getElementById('debug');
    this.open = false;
    this._t = 0;
    this._buildActions();
  }

  toggle() {
    this.open = !this.open;
    this.root.style.display = this.open ? 'block' : 'none';
    if (this.open) this.render();
  }

  _buildActions() {
    this.actions = document.createElement('div');
    this.actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;';
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:10px Courier New;background:#22223a;color:#d8d8e8;border:1px solid #44446a;padding:2px 6px;cursor:pointer;';
      b.addEventListener('click', fn);
      this.actions.appendChild(b);
      return b;
    };
    const g = this.g;
    btn('RESET RIVALRY', () => { g.manager.reset(); location.reload(); });
    btn('HATE +25', () => { g.manager.hate(25); g.manager.save(); });
    btn('HATE =90', () => { g.manager.doc.emotionalState = 90; g.manager.refreshTags(); g.manager.applyTagVisuals(g.rival); g.manager.save(); });
    btn('ENERGY FULL', () => { g.player.energy = 100; g.rival.energy = 100; });
    btn('PLAYER HP 15%', () => { g.player.hp = g.player.maxHp * 0.15; });
    btn('RIVAL HP 15%', () => { g.rival.hp = g.rival.maxHp * 0.15; });
    btn('FORCE HUNT', () => g.macroAgent?.force('Hunt'));
    btn('FORCE TRAIN', () => g.macroAgent?.force('Train'));
    btn('FORCE AMBUSH', () => g.macroAgent?.force('Ambush'));
  }

  render() {
    const g = this.g;
    const p = g.profile;
    const pct = v => Math.round(v * 100) + '%';
    const doc = g.manager.doc;
    this.root.innerHTML = '';
    this.root.appendChild(this.actions);
    const pre = document.createElement('div');
    pre.textContent = [
      `— RIVAL ————————————————`,
      JSON.stringify({ ...doc, styleProfile: '(below)' }, null, 1),
      ``,
      `hp ${g.rival.hp.toFixed(0)}/${g.rival.maxHp}  energy ${g.rival.energy.toFixed(0)}  state ${g.rival.state}`,
      `micro goal: ${g.rivalAgent.currentGoal?.name ?? '-'}  plan: [${g.rivalAgent.currentPlan.join(', ')}]`,
      `macro goal: ${g.macroAgent?.current ?? '-'}`,
      ``,
      `— SYNC —————————————————`,
      `rating ${g.sync.rating.toFixed(0)}  skill ${pct(g.sync.skill)}  W:L(player) ${g.sync.wins}:${g.sync.losses}`,
      ``,
      `— PLAYER STYLE ————————`,
      `aggression ${pct(p.aggression)}  heavyPref ${pct(p.heavyPref)}  dodgePref ${pct(p.dodgePref)}`,
      `defenseRate ${pct(p.defenseRate)}  accuracy ${pct(p.accuracy)}  specialPref ${pct(p.specialPref)}`,
      `reaction ${Math.round(p.reaction)}ms  attackDist ${p.attackDist.toFixed(1)}m  followup ${pct(p.comboFollowup)}`,
      ``,
      `— LEDGER (newest first) —`,
      ...g.manager.ledger.last(12).map(e =>
        `[${new Date(e.ts).toLocaleTimeString()}] ${e.event}: ${e.label}`),
      ``,
      `fps ${g.loop.fps.toFixed(0)}`,
    ].join('\n');
    this.root.appendChild(pre);
  }

  update(dt) {
    if (!this.open) return;
    this._t -= dt;
    if (this._t <= 0) { this.render(); this._t = 0.25; }
  }
}
