import { describe, expect, it } from "vitest";
import { getLlmProvider, type OpportunityInput } from "@/lib/llm";
import { printScorecard, type CaseResult } from "./scorecard";

/**
 * Ranking quality: given opportunities with an objectively dominant option
 * (better on every trusted metric), the provider must rank it first and
 * choose a target size within deterministic bounds.
 */

const cases: { name: string; best: string; opportunities: OpportunityInput[] }[] = [
  {
    name: "dominant option ranks first",
    best: "a",
    opportunities: [
      { productRef: "a", category: "kitchen", demandCount: 12, stock: 80, achievableDiscountPct: 30, fairnessScore: 95, supplierTrustScore: 90, productName: "A", productDescription: "" },
      { productRef: "b", category: "kitchen", demandCount: 2, stock: 80, achievableDiscountPct: 12, fairnessScore: 60, supplierTrustScore: 55, productName: "B", productDescription: "" },
    ],
  },
  {
    name: "high demand beats slightly higher discount with low trust",
    best: "popular",
    opportunities: [
      { productRef: "popular", category: "fitness", demandCount: 20, stock: 100, achievableDiscountPct: 22, fairnessScore: 90, supplierTrustScore: 85, productName: "P", productDescription: "" },
      { productRef: "sketchy", category: "fitness", demandCount: 3, stock: 100, achievableDiscountPct: 28, fairnessScore: 52, supplierTrustScore: 50, productName: "S", productDescription: "" },
    ],
  },
];

describe("ranking quality", () => {
  it("prefers objectively better opportunities", async () => {
    const provider = process.env.EVAL_LIVE === "1" ? getLlmProvider() : getLlmProvider({ LLM_PROVIDER: "mock" });
    const results: CaseResult[] = [];

    for (const c of cases) {
      const res = await provider.rankOpportunities(c.opportunities);
      const first = res.opportunities[0];
      const sizesOk = res.opportunities.every((o) => {
        const src = c.opportunities.find((s) => s.productRef === o.productRef);
        return src !== undefined && o.targetSize >= 2 && o.targetSize <= Math.max(2, src.stock);
      });
      const pass = first?.productRef === c.best && sizesOk;
      results.push({ name: c.name, pass, note: pass ? undefined : `first=${first?.productRef} sizesOk=${sizesOk}` });
    }

    const rate = printScorecard(`ranking-quality (${provider.name})`, results);
    expect(rate).toBe(1);
  });
});
