// TauntEngine (FR-3.1): rule-based speech composed from the ledger,
// emotional state, and trigger. The interface is LLM-shaped on purpose
// (async, single context object) so a model backend can replace the
// template backend post-MVP without touching any caller (spec §9.1).

import {
  TAUNTS, MEMORY_LINES, bandOf,
  CANONICAL_FIRST_REENCOUNTER, CANONICAL_RIVAL_FLED,
} from './tauntFragments.js';

export class TauntEngine {
  constructor({ manager }) {
    this.manager = manager;
    this._bags = new Map();        // poolKey -> shuffled remaining lines
    this._lastLine = new Map();    // poolKey -> last line (no immediate repeat)
    this._saidCanonical = false;
    this.lastKey = null;           // exposed for tests (band verification)
  }

  // context: { trigger, doc?, ledger? } — doc/ledger default to the manager's
  async generateTaunt(context) {
    const doc = context.doc ?? this.manager.doc;
    const ledger = context.ledger ?? this.manager.ledger;
    const trigger = context.trigger;
    const band = bandOf(doc.emotionalState);

    // AC-3.1.2: the first re-encounter names the flight, guaranteed
    if (trigger === 'encounter_start' && !this._saidCanonical) {
      if (ledger.has('player_fled_first_duel')) {
        this._saidCanonical = true;
        this.lastKey = 'canonical';
        return this._draw('canonical', CANONICAL_FIRST_REENCOUNTER);
      }
      if (ledger.has('rival_fled_first_duel')) {
        this._saidCanonical = true;
        this.lastKey = 'canonical_rival';
        return this._draw('canonical_rival', CANONICAL_RIVAL_FLED);
      }
    }

    const pool = TAUNTS[trigger]?.[band];
    if (!pool) return null;
    this.lastKey = `${trigger}:${band}`;
    const template = this._draw(this.lastKey, pool);
    return this._render(template, doc, ledger);
  }

  _render(template, doc, ledger) {
    return template
      .replace('{level}', doc.level)
      .replace('{memory}', () => {
        const m = ledger.lastSignificant();
        if (!m) return 'I know you';
        if (m.event === 'observation') return m.label.toLowerCase().replace(/\.$/, '');
        return MEMORY_LINES[m.event] ?? 'I remember everything';
      });
  }

  // shuffle-bag draw: variety with no immediate repeats (AC-3.1.3)
  _draw(key, source) {
    let bag = this._bags.get(key);
    if (!bag || bag.length === 0) {
      bag = [...source].sort(() => Math.random() - 0.5);
      if (bag.length > 1 && bag[0] === this._lastLine.get(key)) {
        bag.push(bag.shift());
      }
      this._bags.set(key, bag);
    }
    const line = bag.shift();
    this._lastLine.set(key, line);
    return line;
  }
}
