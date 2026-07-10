import { computeGroupPrice } from "@/lib/pricing/engine";

/**
 * Deterministic activation threshold for a trending item.
 *
 * A trending item becomes claimable only when enough members want it that a
 * win-win group is actually possible: there must exist a group size where the
 * pricing engine can produce a price that
 *   (a) is a real discount vs the verified lowest Israeli market price
 *       (Zap) — which, with mandatory free shipping, means it strictly beats
 *       the best price a member could get alone, and
 *   (b) stays at or above the supplier's floor.
 *
 * Before any offers exist the floor is estimated as a fraction of the market
 * price; once real offers arrive the agent re-runs this with the best actual
 * floor. Pure function — unit-tested, LLM never touches it.
 */

export interface ThresholdInput {
  /** Verified lowest Israeli market price (Zap), incl. shipping since shipping is free. */
  zapLowestPriceIls: number;
  /** Supplier floor: real (from best offer) or estimated pre-offer. */
  floorPrice: number;
  pppFactor: number;
  maxDiscountPct: number;
  minRealDiscountPct: number;
  maxGroupSize?: number;
}

/** Pre-offer heuristic: assume a competitive supplier can go to ~70% of market. */
export const EST_FLOOR_FRACTION = 0.7;

export function estimateFloorPrice(zapLowestPriceIls: number): number {
  return Math.round(zapLowestPriceIls * EST_FLOOR_FRACTION * 100) / 100;
}

/**
 * Smallest group size at which a win-win price exists, or null when no group
 * size up to maxGroupSize can produce one (e.g. floor at/above market).
 */
export function computeActivationThreshold(input: ThresholdInput): number | null {
  const { zapLowestPriceIls, floorPrice, pppFactor, maxDiscountPct, minRealDiscountPct, maxGroupSize = 500 } = input;
  if (!Number.isFinite(zapLowestPriceIls) || zapLowestPriceIls <= 0) return null;
  if (!Number.isFinite(floorPrice) || floorPrice <= 0) return null;

  for (let size = 2; size <= maxGroupSize; size++) {
    const result = computeGroupPrice({
      floorPrice,
      referencePrice: zapLowestPriceIls,
      groupSize: size,
      pppFactor,
      maxDiscountPct,
      minRealDiscountPct,
    });
    if (result.ok && result.groupPrice < zapLowestPriceIls) return size;
  }
  return null;
}
