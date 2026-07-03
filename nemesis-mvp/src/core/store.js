// Guarded persistence (ported from nemesis-arena/game.js).
// Storage can throw in sandboxed iframes / strict file:// modes; there the
// game degrades to session-only play — the nemesis loses long-term memory,
// nothing else (AC-6.1.1).

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* no memory */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  getJSON(k) {
    const raw = this.get(k);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  setJSON(k, v) { this.set(k, JSON.stringify(v)); },
};
