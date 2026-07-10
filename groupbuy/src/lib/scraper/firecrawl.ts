import { ScrapeError, ScrapedTrendingItemSchema, sanitizeScraped } from "./types";
import type { DiscoverySource, ScrapedTrendingItem, ScraperProvider } from "./types";

/**
 * Live scraper.
 *  - KSP exposes an internal JSON API (the site is a React SPA), so it is
 *    fetched directly — no Firecrawl credits spent.
 *  - Super-Pharm and Zap sit behind bot protection (403 to plain fetchers),
 *    so they go through Firecrawl's /v1/scrape with JSON-schema extraction.
 *
 * Every extracted record is sanitized and zod-validated; anything that does
 * not fit the schema is dropped, never stored.
 */

const KSP_BESTSELLERS_URL = "https://ksp.co.il/m_action/api/category/..%2Fdocs?sort=5"; // sort=5: best sellers
const SUPER_PHARM_BESTSELLERS_URL = "https://shop.super-pharm.co.il/best-sellers";
const ZAP_SEARCH_URL = (q: string) => `https://www.zap.co.il/search.aspx?keyword=${encodeURIComponent(q)}`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Product name" },
          category: { type: "string", description: "Product category, short slug" },
          priceIls: { type: "number", description: "Current price in ILS (₪), numeric" },
          rating: { type: "number", description: "Star rating 0-5, null if absent" },
          reviewCount: { type: "integer", description: "Number of reviews, null if absent" },
          externalId: { type: "string", description: "Site product id / SKU" },
          sourceUrl: { type: "string", description: "Absolute product page URL" },
        },
        required: ["title", "priceIls", "externalId", "sourceUrl"],
      },
    },
  },
  required: ["products"],
} as const;

const ZAP_PRICE_SCHEMA = {
  type: "object",
  properties: {
    lowestPriceIls: {
      type: "number",
      description: "The lowest store price in ILS shown for the first matching product, numeric only",
    },
  },
  required: ["lowestPriceIls"],
} as const;

interface RawProduct {
  title?: unknown;
  category?: unknown;
  priceIls?: unknown;
  rating?: unknown;
  reviewCount?: unknown;
  externalId?: unknown;
  sourceUrl?: unknown;
}

export class FirecrawlProvider implements ScraperProvider {
  readonly name = "firecrawl";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.firecrawl.dev",
    private readonly timeoutMs = 60_000,
  ) {}

  async fetchTrending(source: DiscoverySource): Promise<ScrapedTrendingItem[]> {
    if (source === "KSP") return this.fetchKspDirect();
    return this.fetchViaFirecrawl(SUPER_PHARM_BESTSELLERS_URL, "SUPER_PHARM");
  }

  async fetchZapLowestPrice(query: string): Promise<number | null> {
    try {
      const json = await this.firecrawlExtract(ZAP_SEARCH_URL(query), ZAP_PRICE_SCHEMA, "ZAP");
      const price = Number((json as { lowestPriceIls?: unknown }).lowestPriceIls);
      return Number.isFinite(price) && price > 0 ? price : null;
    } catch {
      return null; // missing Zap price is survivable; the item just stays unverified
    }
  }

  /** KSP's SPA JSON API — a plain fetch with browser-ish headers. */
  private async fetchKspDirect(): Promise<ScrapedTrendingItem[]> {
    const res = await fetch(KSP_BESTSELLERS_URL, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; GroupBuyBot/1.0)" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new ScrapeError(`KSP API responded ${res.status}`, "KSP");
    const body = (await res.json()) as { result?: { items?: Array<Record<string, unknown>> } };
    const items = body.result?.items ?? [];
    return this.validate(
      items.map((it) => ({
        title: it.name,
        category: it.tag_name ?? "electronics",
        priceIls: it.price,
        rating: it.rating ?? null,
        reviewCount: it.reviews ?? null,
        externalId: it.uin != null ? `ksp-${String(it.uin)}` : undefined,
        sourceUrl: it.uin != null ? `https://ksp.co.il/web/item/${String(it.uin)}` : undefined,
      })),
      "KSP",
    );
  }

  private async fetchViaFirecrawl(url: string, source: string): Promise<ScrapedTrendingItem[]> {
    const json = await this.firecrawlExtract(url, EXTRACT_SCHEMA, source);
    const products = (json as { products?: RawProduct[] }).products ?? [];
    return this.validate(products, source);
  }

  private async firecrawlExtract(url: string, schema: object, source: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/v1/scrape`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            url,
            formats: ["json"],
            onlyMainContent: true,
            jsonOptions: { schema },
            timeout: this.timeoutMs,
          }),
          signal: AbortSignal.timeout(this.timeoutMs + 10_000),
        });
        if (!res.ok) throw new ScrapeError(`Firecrawl responded ${res.status} for ${source}`, source);
        const body = (await res.json()) as { success?: boolean; data?: { json?: unknown } };
        if (!body.success || body.data?.json == null) {
          throw new ScrapeError(`Firecrawl returned no JSON for ${source}`, source);
        }
        return body.data.json;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new ScrapeError(String(lastError), source);
  }

  private validate(raw: RawProduct[], source: string): ScrapedTrendingItem[] {
    const out: ScrapedTrendingItem[] = [];
    for (const r of raw) {
      const parsed = ScrapedTrendingItemSchema.safeParse({
        title: typeof r.title === "string" ? sanitizeScraped(r.title) : r.title,
        category: typeof r.category === "string" ? sanitizeScraped(r.category, 60).toLowerCase() : "general",
        priceIls: typeof r.priceIls === "string" ? Number.parseFloat(r.priceIls) : r.priceIls,
        rating: r.rating == null ? null : Number(r.rating),
        reviewCount: r.reviewCount == null ? null : Number(r.reviewCount),
        externalId: r.externalId,
        sourceUrl: r.sourceUrl,
      });
      if (parsed.success) out.push(parsed.data);
    }
    if (out.length === 0) throw new ScrapeError(`No valid products extracted from ${source}`, source);
    return out;
  }
}
