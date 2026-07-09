/**
 * Anti-fake-discount fairness verification.
 *
 * Suppliers could game a group-buying platform by inflating their "regular"
 * list price so a mediocre deal looks like a huge discount. This engine
 * neutralizes that:
 *
 *  1. Reference price = min(claimed list price,
 *                           90-day minimum historical list price,   // EU Omnibus-style
 *                           market reference price for the category+country)
 *     All discount math elsewhere uses this verified reference, so an
 *     inflated list price simply doesn't matter.
 *  2. Hard blocks: recent price hikes before a deal, list price far above
 *     market, or a floor price above fair market value.
 *  3. A fairness score (0-100) that feeds the supplier's trust score.
 *
 * Pure and deterministic — the LLM has no influence here.
 */

export interface PricePoint {
  listPrice: number;
  recordedAt: Date;
}

export interface FairnessInput {
  claimedListPrice: number;
  floorPrice: number;
  /** Historical list prices, any order. */
  priceHistory: PricePoint[];
  /** Typical market price for this category in the buyer's country; null if unknown. */
  marketReferencePrice: number | null;
  now?: Date;
}

export interface FairnessResult {
  fair: boolean;
  /** Verified price that discounts must be measured against. */
  referencePrice: number;
  /** 0-100; < 50 is blocked. */
  score: number;
  flags: string[];
}

const DAY = 86_400_000;
/** List price more than this fraction above market reference => inflated. */
const MARKET_INFLATION_TOLERANCE = 0.25;
/** A hike of more than this fraction within the hike window is suspicious. */
const HIKE_THRESHOLD = 0.15;
const HIKE_WINDOW_DAYS = 30;
const REFERENCE_WINDOW_DAYS = 90;

export function verifyFairness(input: FairnessInput): FairnessResult {
  const now = input.now ?? new Date();
  const flags: string[] = [];
  const { claimedListPrice, floorPrice, marketReferencePrice } = input;

  if (!Number.isFinite(claimedListPrice) || claimedListPrice <= 0 || floorPrice <= 0) {
    return { fair: false, referencePrice: 0, score: 0, flags: ["INVALID_PRICES"] };
  }

  const windowStart = now.getTime() - REFERENCE_WINDOW_DAYS * DAY;
  const recent = input.priceHistory
    .filter((p) => p.recordedAt.getTime() >= windowStart && p.listPrice > 0)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  // --- Verified reference price ---
  const candidates = [claimedListPrice];
  if (recent.length > 0) candidates.push(Math.min(...recent.map((p) => p.listPrice)));
  if (marketReferencePrice != null && marketReferencePrice > 0) candidates.push(marketReferencePrice);
  const referencePrice = Math.min(...candidates);

  let score = 100;
  let hardBlock = false;

  // --- Inflated vs market ---
  if (marketReferencePrice != null && marketReferencePrice > 0) {
    const inflation = claimedListPrice / marketReferencePrice - 1;
    if (inflation > MARKET_INFLATION_TOLERANCE) {
      flags.push("LIST_PRICE_INFLATED_VS_MARKET");
      // 25% over market costs 0 points at the boundary, scales up steeply.
      score -= Math.min(60, Math.round((inflation - MARKET_INFLATION_TOLERANCE) * 100));
    }
    if (floorPrice > marketReferencePrice) {
      // Any group price must be >= floor, so buyers could never beat the
      // market price — win-win is impossible. Hard block.
      flags.push("FLOOR_ABOVE_MARKET");
      score -= 40;
      hardBlock = true;
    }
  } else {
    flags.push("NO_MARKET_REFERENCE");
    score -= 10; // unknown market => mild caution, rely on history
  }

  // --- Pre-deal price hike (inflate-then-discount pattern) ---
  const hikeWindowStart = now.getTime() - HIKE_WINDOW_DAYS * DAY;
  const before = recent.filter((p) => p.recordedAt.getTime() < hikeWindowStart);
  const after = recent.filter((p) => p.recordedAt.getTime() >= hikeWindowStart);
  if (before.length > 0 && after.length > 0) {
    const prevTypical = Math.min(...before.map((p) => p.listPrice));
    const latest = after[after.length - 1].listPrice;
    const hike = latest / prevTypical - 1;
    if (hike > HIKE_THRESHOLD) {
      flags.push("RECENT_PRICE_HIKE");
      score -= Math.min(50, Math.round(hike * 100));
    }
  }

  // --- Claimed price far above verified reference => the "discount" is fiction ---
  if (claimedListPrice > referencePrice * (1 + MARKET_INFLATION_TOLERANCE)) {
    if (!flags.includes("LIST_PRICE_INFLATED_VS_MARKET")) flags.push("CLAIMED_PRICE_ABOVE_REFERENCE");
  }

  score = Math.max(0, Math.min(100, score));
  return { fair: !hardBlock && score >= 50, referencePrice, score, flags };
}
