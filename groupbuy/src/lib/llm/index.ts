import { MockProvider } from "./mock";
import { OpenAICompatProvider } from "./openaiCompat";
import type { LlmProvider } from "./types";

export function getLlmProvider(env: Record<string, string | undefined> = process.env): LlmProvider {
  if (env.LLM_PROVIDER === "openai-compat" && env.LLM_BASE_URL && env.LLM_MODEL) {
    return new OpenAICompatProvider(env.LLM_BASE_URL, env.LLM_MODEL, env.LLM_API_KEY || undefined);
  }
  return new MockProvider();
}

export { MockProvider } from "./mock";
export { OpenAICompatProvider } from "./openaiCompat";
export * from "./types";
