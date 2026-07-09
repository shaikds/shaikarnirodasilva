import { z } from "zod";

/**
 * The LLM's only job in the pipeline: rank deal opportunities and explain
 * them to humans. It receives anonymized aggregates (no PII) and its output
 * is schema-validated. Prices, fairness, and guardrails are computed by
 * deterministic code elsewhere and cannot be affected by this output.
 */

export const OpportunityInputSchema = z.object({
  productRef: z.string(), // opaque id
  category: z.string(),
  demandCount: z.number().int().min(0),
  stock: z.number().int().min(0),
  achievableDiscountPct: z.number(),
  fairnessScore: z.number(),
  supplierTrustScore: z.number(),
  /** Supplier-authored text. UNTRUSTED: delimited + length-capped by the prompt builder. */
  productName: z.string(),
  productDescription: z.string(),
});
export type OpportunityInput = z.infer<typeof OpportunityInputSchema>;

export const RankedOpportunitySchema = z.object({
  productRef: z.string(),
  priority: z.number().min(0).max(100),
  targetSize: z.number().int().min(2).max(500),
  rationale: z.string().max(600),
});

export const RankingResponseSchema = z.object({
  opportunities: z.array(RankedOpportunitySchema).max(50),
});
export type RankingResponse = z.infer<typeof RankingResponseSchema>;

export interface LlmProvider {
  readonly name: string;
  /** Returns schema-validated ranking or throws LlmError. */
  rankOpportunities(opportunities: OpportunityInput[]): Promise<RankingResponse>;
}

export class LlmError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LlmError";
  }
}
