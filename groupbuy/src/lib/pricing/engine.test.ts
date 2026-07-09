import { describe, expect, it } from "vitest";
import { computeGroupPrice, targetDiscountPct } from "./engine";

const base = {
  floorPrice: 280,
  referencePrice: 450,
  groupSize: 10,
  pppFactor: 0.88,
  maxDiscountPct: 35,
  minRealDiscountPct: 10,
};

describe("computeGroupPrice", () => {
  it("produces a price between floor and reference", () => {
    const r = computeGroupPrice(base);
    expect(r.ok).toBe(true);
    expect(r.groupPrice).toBeGreaterThanOrEqual(base.floorPrice);
    expect(r.groupPrice).toBeLessThan(base.referencePrice);
  });

  it("never goes below floor even for huge groups and low PPP", () => {
    const r = computeGroupPrice({ ...base, groupSize: 100000, pppFactor: 0.1, maxDiscountPct: 95 });
    expect(r.groupPrice).toBeGreaterThanOrEqual(base.floorPrice);
  });

  it("discount is monotonically non-decreasing in group size", () => {
    let prev = -1;
    for (const size of [2, 5, 10, 25, 50, 100]) {
      const r = computeGroupPrice({ ...base, groupSize: size });
      expect(r.discountPct).toBeGreaterThanOrEqual(prev);
      prev = r.discountPct;
    }
  });

  it("lower purchasing power => deeper (or equal) discount", () => {
    const israel = computeGroupPrice({ ...base, pppFactor: 0.88 });
    const india = computeGroupPrice({ ...base, pppFactor: 0.3 });
    const us = computeGroupPrice({ ...base, pppFactor: 1.0 });
    expect(india.discountPct).toBeGreaterThanOrEqual(israel.discountPct);
    expect(israel.discountPct).toBeGreaterThanOrEqual(us.discountPct);
  });

  it("respects the supplier's max discount", () => {
    const r = computeGroupPrice({ ...base, groupSize: 10000, pppFactor: 0.2, maxDiscountPct: 20 });
    expect(r.discountPct).toBeLessThanOrEqual(20);
  });

  it("fails when floor is above reference (no win-win possible)", () => {
    const r = computeGroupPrice({ ...base, floorPrice: 500 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("FLOOR_ABOVE_REFERENCE");
  });

  it("fails when the achievable discount is below the platform minimum", () => {
    // Floor so close to reference that only ~2% discount is possible.
    const r = computeGroupPrice({ ...base, floorPrice: 440 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("DISCOUNT_BELOW_MINIMUM");
  });

  it("rejects invalid inputs", () => {
    expect(computeGroupPrice({ ...base, referencePrice: NaN }).ok).toBe(false);
    expect(computeGroupPrice({ ...base, floorPrice: -5 }).ok).toBe(false);
    expect(computeGroupPrice({ ...base, groupSize: 0 }).ok).toBe(false);
  });
});

describe("targetDiscountPct", () => {
  it("is bounded by maxDiscountPct", () => {
    expect(targetDiscountPct(1_000_000, 0.1, 30)).toBeLessThanOrEqual(30);
  });
  it("is zero for empty groups", () => {
    expect(targetDiscountPct(0, 1, 50)).toBe(0);
  });
});
