// SyncEngine: ELO-style rating that keeps every fight contested (FR-2.3,
// AC-2.3.1). Ported nearly verbatim from nemesis-arena/game.js. The rival's
// expected score is always 0.5 — win and it sharpens, lose and it eases off.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class SyncEngine {
  constructor(rating = 1000) {
    this.rating = rating;
    this.wins = 0;      // player wins
    this.losses = 0;    // player losses
  }

  // rival skill 0..1, derived from the PLAYER's rating
  get skill() { return clamp((this.rating - 700) / 700, 0.05, 1); }

  roundEnd(playerHp, rivalHp) {
    const won = playerHp > 0 && playerHp >= rivalHp;
    won ? this.wins++ : this.losses++;
    const margin = (playerHp - rivalHp) / 100;                    // -1..1
    const actual = (won ? 1 : 0) * 0.7 + (margin * 0.5 + 0.5) * 0.3;
    this.rating += 90 * (actual - 0.5);
    return won;
  }
}
