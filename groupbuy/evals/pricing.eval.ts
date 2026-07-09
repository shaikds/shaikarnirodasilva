import { describe, expect, it } from "vitest";
import { computeGroupPrice } from "@/lib/pricing/engine";
import { printScorecard, type CaseResult } from "./scorecard";

/**
 * Property-style pricing evals: win-win invariants must hold across a broad
 * sweep of inputs, not just hand-picked examples.
 */
describe("pricing win-win properties", () => {
  it("holds all invariants across a parameter sweep", () => {
    const results: CaseResult[] = [];
    let floorViolations = 0;
    let capViolations = 0;
    let monotonicityViolations = 0;
    let pppViolations = 0;
    let checked = 0;

    const floors = [50, 100, 280, 900];
    const refs = [120, 300, 450, 1200];
    const sizes = [2, 5, 12, 40, 150];
    const ppps = [0.3, 0.45, 0.88, 1.0];
    const maxDiscounts = [15, 35, 60, 95];

    for (const floorPrice of floors) {
      for (const referencePrice of refs) {
        if (floorPrice > referencePrice) continue;
        for (const maxDiscountPct of maxDiscounts) {
          for (const pppFactor of ppps) {
            let prevDiscount = -1;
            for (const groupSize of sizes) {
              const r = computeGroupPrice({
                floorPrice,
                referencePrice,
                groupSize,
                pppFactor,
                maxDiscountPct,
                minRealDiscountPct: 0,
              });
              checked++;
              if (r.groupPrice < floorPrice) floorViolations++;
              if (r.discountPct > maxDiscountPct + 1) capViolations++;
              if (r.discountPct < prevDiscount) monotonicityViolations++;
              prevDiscount = r.discountPct;
            }
            // Lower PPP must never get a worse discount than baseline at same size.
            const low = computeGroupPrice({ floorPrice, referencePrice, groupSize: 20, pppFactor: 0.3, maxDiscountPct, minRealDiscountPct: 0 });
            const high = computeGroupPrice({ floorPrice, referencePrice, groupSize: 20, pppFactor: 1.0, maxDiscountPct, minRealDiscountPct: 0 });
            if (low.discountPct < high.discountPct) pppViolations++;
          }
        }
      }
    }

    results.push({ name: `price >= floor in ${checked} combos`, pass: floorViolations === 0, note: floorViolations ? `${floorViolations} violations` : undefined });
    results.push({ name: "discount <= supplier max", pass: capViolations === 0, note: capViolations ? `${capViolations} violations` : undefined });
    results.push({ name: "discount monotonic in group size", pass: monotonicityViolations === 0, note: monotonicityViolations ? `${monotonicityViolations} violations` : undefined });
    results.push({ name: "lower PPP never worse off", pass: pppViolations === 0, note: pppViolations ? `${pppViolations} violations` : undefined });

    const rate = printScorecard("pricing-win-win", results);
    expect(rate).toBe(1);
  });
});
