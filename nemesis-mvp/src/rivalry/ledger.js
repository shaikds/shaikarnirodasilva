// Interaction Ledger (FR-2.2): append-only memory of the rivalry.
// Capped at 100 entries; genesis entries are never dropped — a nemesis
// never forgets how it was born (AC-2.2.4).

const CAP = 100;
const GENESIS_EVENTS = new Set(['player_fled_first_duel', 'rival_fled_first_duel']);

// significance ranking for taunt memory selection (P6)
const RANK = (e) =>
  GENESIS_EVENTS.has(e.event) ? 3 :
  ['duel_won', 'duel_lost', 'player_escaped_duel', 'ambush_sprung'].includes(e.event) ? 2 : 1;

export class Ledger {
  constructor(entries = []) {
    this.entries = entries;
  }

  add(event, label, data = {}) {
    const entry = { ts: Date.now(), event, label, data };
    this.entries.push(entry);
    if (this.entries.length > CAP) {
      const idx = this.entries.findIndex(e => !GENESIS_EVENTS.has(e.event));
      if (idx >= 0) this.entries.splice(idx, 1);
      else this.entries.pop();     // pathological: everything is genesis
    }
    return entry;
  }

  last(n = 5) { return this.entries.slice(-n).reverse(); }

  // most recent significant memory, for taunts (AC-3.1.1)
  lastSignificant() {
    let best = null;
    for (const e of this.entries) {
      if (!best || RANK(e) >= RANK(best)) best = e;   // later wins ties
    }
    return best;
  }

  has(event) { return this.entries.some(e => e.event === event); }
  toJSON() { return this.entries; }
}
