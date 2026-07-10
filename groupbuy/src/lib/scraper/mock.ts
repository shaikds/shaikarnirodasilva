import type { DiscoverySource, ScrapedTrendingItem, ScraperProvider } from "./types";

/**
 * Deterministic scraper used in dev/CI/evals and whenever FIRECRAWL_API_KEY
 * is not configured. Fixtures mimic real Israeli trend data (ILS prices).
 */

const FIXTURES: Record<DiscoverySource, ScrapedTrendingItem[]> = {
  KSP: [
    {
      title: "אוזניות אלחוטיות Sony WH-CH720N",
      category: "headphones",
      priceIls: 449,
      rating: 4.6,
      reviewCount: 1830,
      externalId: "ksp-289411",
      sourceUrl: "https://ksp.co.il/web/item/289411",
    },
    {
      title: "שעון חכם Xiaomi Smart Band 9",
      category: "fitness",
      priceIls: 169,
      rating: 4.4,
      reviewCount: 2540,
      externalId: "ksp-301254",
      sourceUrl: "https://ksp.co.il/web/item/301254",
    },
    {
      title: "רמקול חכם Echo Dot דור 5",
      category: "smart-home",
      priceIls: 219,
      rating: 4.7,
      reviewCount: 4120,
      externalId: "ksp-277890",
      sourceUrl: "https://ksp.co.il/web/item/277890",
    },
    {
      title: "מטען GaN אלחוטי Anker 65W",
      category: "smart-home",
      priceIls: 149,
      rating: 4.8,
      reviewCount: 3310,
      externalId: "ksp-312001",
      sourceUrl: "https://ksp.co.il/web/item/312001",
    },
  ],
  SUPER_PHARM: [
    {
      title: "מברשת שיניים חשמלית Oral-B Pro 3",
      category: "kitchen",
      priceIls: 299,
      rating: 4.5,
      reviewCount: 960,
      externalId: "sp-118332",
      sourceUrl: "https://shop.super-pharm.co.il/p/118332",
    },
    {
      title: "מייבש שיער Remington D5715",
      category: "kitchen",
      priceIls: 189,
      rating: 4.2,
      reviewCount: 640,
      externalId: "sp-120775",
      sourceUrl: "https://shop.super-pharm.co.il/p/120775",
    },
  ],
};

/** Zap "lowest local price" fixtures, keyed by externalId-bearing title match. */
const ZAP_PRICES: Array<{ match: RegExp; price: number }> = [
  { match: /Sony WH-CH720N/i, price: 429 },
  { match: /Smart Band 9/i, price: 155 },
  { match: /Echo Dot/i, price: 199 },
  { match: /Anker 65W/i, price: 139 },
  { match: /Oral-B Pro 3/i, price: 279 },
  { match: /Remington D5715/i, price: 175 },
];

export class MockScraperProvider implements ScraperProvider {
  readonly name = "mock";

  async fetchTrending(source: DiscoverySource): Promise<ScrapedTrendingItem[]> {
    return FIXTURES[source] ?? [];
  }

  async fetchZapLowestPrice(query: string): Promise<number | null> {
    const hit = ZAP_PRICES.find((z) => z.match.test(query));
    return hit ? hit.price : null;
  }
}
