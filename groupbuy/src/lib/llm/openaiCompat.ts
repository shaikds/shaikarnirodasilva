import { buildRankingUserPrompt, SYSTEM_PROMPT } from "./prompt";
import type { LlmProvider, OpportunityInput, RankingResponse } from "./types";
import { LlmError, RankingResponseSchema } from "./types";

/**
 * Provider for any OpenAI-compatible chat-completions endpoint:
 *  - Ollama on the user's machine (recommended: private, e.g. gemma3 12B QAT)
 *  - DeepSeek or others (data leaves your machine — check privacy needs)
 *
 * Uses plain fetch (no SDK dependency). One retry on invalid JSON, then the
 * caller falls back to the deterministic MockProvider — a flaky model can
 * degrade ranking quality but can never take the pipeline down or bypass
 * guardrails.
 */
export class OpenAICompatProvider implements LlmProvider {
  readonly name: string;

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 60_000
  ) {
    this.name = `openai-compat:${model}`;
  }

  async rankOpportunities(opportunities: OpportunityInput[]): Promise<RankingResponse> {
    const userPrompt = buildRankingUserPrompt(opportunities);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.chat(userPrompt);
        const parsed = RankingResponseSchema.safeParse(JSON.parse(extractJson(raw)));
        if (parsed.success) {
          // Drop hallucinated productRefs — the model may only rank what it was given.
          const validRefs = new Set(opportunities.map((o) => o.productRef));
          return { opportunities: parsed.data.opportunities.filter((o) => validRefs.has(o.productRef)) };
        }
        lastError = parsed.error;
      } catch (err) {
        lastError = err;
      }
    }
    throw new LlmError("LLM returned invalid ranking output after retry", lastError);
  }

  private async chat(userPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new LlmError(`LLM endpoint returned ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new LlmError("LLM response had no content");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Tolerates models that wrap JSON in markdown fences or prose. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
