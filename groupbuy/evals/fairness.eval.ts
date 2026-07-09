import { describe, expect, it } from "vitest";
import { verifyFairness } from "@/lib/fairness/verify";
import { printScorecard, type CaseResult } from "./scorecard";
import fixtures from "./fixtures/fake-discounts.json";

interface Fixture {
  name: string;
  expectFair?: boolean;
  expectFlags?: string[];
  expectReferenceAtMost?: number;
  input: {
    claimedListPrice: number;
    floorPrice: number;
    marketReferencePrice: number | null;
    history: { listPrice: number; daysAgo: number }[];
  };
}

const now = new Date("2026-07-01T00:00:00Z");

describe("fake-discount detection", () => {
  it("catches every gaming pattern in the golden set", () => {
    const results: CaseResult[] = [];
    for (const f of fixtures as Fixture[]) {
      const r = verifyFairness({
        claimedListPrice: f.input.claimedListPrice,
        floorPrice: f.input.floorPrice,
        marketReferencePrice: f.input.marketReferencePrice,
        priceHistory: f.input.history.map((h) => ({
          listPrice: h.listPrice,
          recordedAt: new Date(now.getTime() - h.daysAgo * 86_400_000),
        })),
        now,
      });
      let pass = true;
      const notes: string[] = [];
      if (f.expectFair !== undefined && r.fair !== f.expectFair) {
        pass = false;
        notes.push(`fair=${r.fair}, expected ${f.expectFair} (score ${r.score})`);
      }
      for (const flag of f.expectFlags ?? []) {
        if (!r.flags.includes(flag)) {
          pass = false;
          notes.push(`missing flag ${flag}`);
        }
      }
      if (f.expectReferenceAtMost !== undefined && r.referencePrice > f.expectReferenceAtMost) {
        pass = false;
        notes.push(`reference ${r.referencePrice} > ${f.expectReferenceAtMost}`);
      }
      results.push({ name: f.name, pass, note: notes.join("; ") || undefined });
    }
    const rate = printScorecard("fake-discount-detection", results);
    expect(rate).toBe(1);
  });
});
