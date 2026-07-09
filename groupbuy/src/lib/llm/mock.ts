import type { LlmProvider, OpportunityInput, RankingResponse } from "./types";
import { RankingResponseSchema } from "./types";

/**
 * Deterministic provider used in development, CI, and evals.
 * Mirrors what a well-behaved model should do, using only the trusted
 * numeric fields — untrusted supplier text is ignored entirely.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async rankOpportunities(opportunities: OpportunityInput[]): Promise<RankingResponse> {
    const ranked = [...opportunities]
      .map((o) => {
        const priority = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              0.35 * Math.min(o.demandCount * 10, 100) +
                0.25 * o.fairnessScore +
                0.2 * o.supplierTrustScore +
                0.2 * Math.min(o.achievableDiscountPct * 2.5, 100)
            )
          )
        );
        // Target the demand we can already see; growth beyond it is upside.
        const targetSize = Math.max(2, Math.min(o.stock, o.demandCount, 500));
        return {
          productRef: o.productRef,
          priority,
          targetSize,
          rationale: `High interest (${o.demandCount} requests) in ${o.category} with a verified ${Math.round(
            o.achievableDiscountPct
          )}% group discount from a trusted supplier.`,
        };
      })
      .sort((a, b) => b.priority - a.priority);

    return RankingResponseSchema.parse({ opportunities: ranked });
  }
}
