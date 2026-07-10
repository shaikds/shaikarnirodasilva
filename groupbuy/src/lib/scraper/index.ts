import { FirecrawlProvider } from "./firecrawl";
import { MockScraperProvider } from "./mock";
import type { ScraperProvider } from "./types";

export function getScraperProvider(env: Record<string, string | undefined> = process.env): ScraperProvider {
  if (env.FIRECRAWL_API_KEY) {
    return new FirecrawlProvider(env.FIRECRAWL_API_KEY, env.FIRECRAWL_BASE_URL || undefined);
  }
  return new MockScraperProvider();
}

export { MockScraperProvider } from "./mock";
export { FirecrawlProvider } from "./firecrawl";
export * from "./types";
