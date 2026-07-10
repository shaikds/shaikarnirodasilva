import { describe, expect, it } from "vitest";
import { computeGroupPrice } from "@/lib/pricing/engine";
import { computeActivationThreshold, estimateFloorPrice } from "./threshold";

const base = {
  zapLowestPriceIls: 400,
  floorPrice: 280,
  pppFactor: 0.85, // Israel-ish
  maxDiscountPct: 90,
  minRealDiscountPct: 10,
};

describe("computeActivationThreshold", () => {
  it("finds a threshold for a healthy item", () => {
    const n = computeActivationThreshold(base);
    expect(n).not.toBeNull();
    expect(n!).toBeGreaterThanOrEqual(2);
  });

  it("the threshold group size really yields a win-win price that beats the market", () => {
    const n = computeActivationThreshold(base)!;
    const pricing = computeGroupPrice({
      floorPrice: base.floorPrice,
      referencePrice: base.zapLowestPriceIls,
      groupSize: n,
      pppFactor: base.pppFactor,
      maxDiscountPct: base.maxDiscountPct,
      minRealDiscountPct: base.minRealDiscountPct,
    });
    expect(pricing.ok).toBe(true);
    expect(pricing.groupPrice).toBeLessThan(base.zapLowestPriceIls);
    expect(pricing.groupPrice).toBeGreaterThanOrEqual(base.floorPrice);
  });

  it("one below the threshold does NOT satisfy the win-win bar (minimality)", () => {
    const n = computeActivationThreshold(base)!;
    if (n > 2) {
      const below = computeGroupPrice({
        floorPrice: base.floorPrice,
        referencePrice: base.zapLowestPriceIls,
        groupSize: n - 1,
        pppFactor: base.pppFactor,
        maxDiscountPct: base.maxDiscountPct,
        minRealDiscountPct: base.minRealDiscountPct,
      });
      expect(below.ok && below.groupPrice < base.zapLowestPriceIls).toBe(false);
    }
  });

  it("returns null when the floor is at or above the market price", () => {
    expect(computeActivationThreshold({ ...base, floorPrice: 400 })).toBeNull();
    expect(computeActivationThreshold({ ...base, floorPrice: 450 })).toBeNull();
  });

  it("returns null for invalid prices", () => {
    expect(computeActivationThreshold({ ...base, zapLowestPriceIls: 0 })).toBeNull();
    expect(computeActivationThreshold({ ...base, floorPrice: -5 })).toBeNull();
    expect(computeActivationThreshold({ ...base, zapLowestPriceIls: Number.NaN })).toBeNull();
  });

  it("a lower floor never needs MORE votes (monotonic in supplier competitiveness)", () => {
    const tight = computeActivationThreshold({ ...base, floorPrice: 350 });
    const loose = computeActivationThreshold({ ...base, floorPrice: 200 });
    expect(tight).not.toBeNull();
    expect(loose).not.toBeNull();
    expect(loose!).toBeLessThanOrEqual(tight!);
  });

  it("lower purchasing power never needs more votes (PPP fairness)", () => {
    const highPpp = computeActivationThreshold({ ...base, pppFactor: 1.0 });
    const lowPpp = computeActivationThreshold({ ...base, pppFactor: 0.4 });
    expect(lowPpp!).toBeLessThanOrEqual(highPpp!);
  });
});

describe("estimateFloorPrice", () => {
  it("estimates below the market price", () => {
    expect(estimateFloorPrice(400)).toBeLessThan(400);
    expect(estimateFloorPrice(400)).toBeGreaterThan(0);
  });
});
