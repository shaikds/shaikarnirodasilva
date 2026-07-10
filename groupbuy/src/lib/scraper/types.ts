import { z } from "zod";

/**
 * Trend scraping layer. Two roles:
 *  - DISCOVERY sources (KSP, Super-Pharm) tell us WHAT is trending in Israel.
 *  - PRICE_CHECK (Zap) tells us the verified lowest Israeli market price for
 *    an item — the fairness bar every future group deal must beat.
 *
 * All scraped text is untrusted input: schema-validated, length-capped and
 * control-character-stripped before it is stored or rendered.
 */

export type DiscoverySource = "KSP" | "SUPER_PHARM";

export const ScrapedTrendingItemSchema = z.object({
  title: z.string().min(2).max(200),
  category: z.string().min(2).max(60),
  priceIls: z.number().positive().max(1_000_000),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  externalId: z.string().min(1).max(120),
  sourceUrl: z.string().url().max(500),
});

export type ScrapedTrendingItem = z.infer<typeof ScrapedTrendingItemSchema>;

export interface ScraperProvider {
  readonly name: string;
  /** Best-selling / trending products for one discovery source. */
  fetchTrending(source: DiscoverySource): Promise<ScrapedTrendingItem[]>;
  /** Verified lowest Israeli market price via Zap; null when not found. */
  fetchZapLowestPrice(query: string): Promise<number | null>;
}

export class ScrapeError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

/** Strip HTML tags + control chars and length-cap scraped free text. */
export function sanitizeScraped(text: string, maxLen = 200): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
