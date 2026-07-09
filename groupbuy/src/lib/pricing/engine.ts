/**
 * Deterministic win-win pricing engine.
 *
 * The LLM never sets prices. This pure function is the only place a group
 * price is computed, so every guarantee below is enforced by code:
 *
 *  - Supplier win: price is never below the supplier's floor price.
 *  - Buyer win: price always reflects a real discount against the VERIFIED
 *    reference price (not the supplier's claimed list price).
 *  - Location-aware: lower purchasing power (PPP factor) => deeper target
 *    discount, so "cheap" means cheap for that country.
 *  - Group effect: more members => deeper discount, with diminishing returns.
 */

export interface PricingInput {
  /** Supplier's minimum acceptable unit price. */
  floorPrice: number;
  /** Verified fair reference price (see fairness engine), NOT claimed list price. */
  referencePrice: number;
  /** Number of members the group targets. */
  groupSize: number;
  /** Country purchasing-power factor, 1.0 = baseline, lower = less purchasing power. */
  pppFactor: number;
  /** Supplier's stated maximum discount percent (0-100). */
  maxDiscountPct: number;
  /** Platform-wide minimum real discount percent for a deal to be worth opening. */
  minRealDiscountPct: number;
}

export interface PricingResult {
  ok: boolean;
  /** Final unit price for every group member, rounded to 2 decimals. */
  groupPrice: number;
  /** Real discount percent vs the verified reference price. */
  discountPct: number;
  reasons: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Target discount grows logarithmically with group size (diminishing returns)
 * and is scaled up for lower-purchasing-power countries.
 */
export function targetDiscountPct(groupSize: number, pppFactor: number, maxDiscountPct: number): number {
  if (groupSize < 1) return 0;
  // 5% base + ~7 points per doubling of group size.
  const sizeComponent = 5 + 7 * Math.log2(Math.max(groupSize, 1));
  // pppFactor 1.0 => x1.0; pppFactor 0.3 => x1.49. Bounded so it never explodes.
  const pppMultiplier = clamp(1 + (1 - pppFactor) * 0.7, 1, 1.6);
  return clamp(sizeComponent * pppMultiplier, 0, maxDiscountPct);
}

export function computeGroupPrice(input: PricingInput): PricingResult {
  const reasons: string[] = [];
  const { floorPrice, referencePrice, groupSize, pppFactor, maxDiscountPct, minRealDiscountPct } = input;

  if (
    [floorPrice, referencePrice, groupSize, pppFactor, maxDiscountPct, minRealDiscountPct].some(
      (v) => !Number.isFinite(v)
    )
  ) {
    return { ok: false, groupPrice: 0, discountPct: 0, reasons: ["INVALID_INPUT"] };
  }
  if (floorPrice <= 0 || referencePrice <= 0 || groupSize < 1) {
    return { ok: false, groupPrice: 0, discountPct: 0, reasons: ["INVALID_INPUT"] };
  }
  if (floorPrice > referencePrice) {
    // Supplier's floor is above the fair market reference — no win for buyers possible.
    return { ok: false, groupPrice: 0, discountPct: 0, reasons: ["FLOOR_ABOVE_REFERENCE"] };
  }

  const target = targetDiscountPct(groupSize, pppFactor, clamp(maxDiscountPct, 0, 95));
  const rawPrice = referencePrice * (1 - target / 100);

  // Never below the supplier's floor — their win is guaranteed here.
  const groupPrice = Math.round(Math.max(rawPrice, floorPrice) * 100) / 100;
  const discountPct = Math.round((1 - groupPrice / referencePrice) * 100);

  if (discountPct < minRealDiscountPct) {
    reasons.push("DISCOUNT_BELOW_MINIMUM");
    return { ok: false, groupPrice, discountPct, reasons };
  }

  return { ok: true, groupPrice, discountPct, reasons };
}
