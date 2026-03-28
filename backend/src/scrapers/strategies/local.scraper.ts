import type { ISupplierScraper, ScrapedSupplierData, ScraperResult } from "../interfaces/scraper.strategy";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";

export class LocalSupplierScraper implements ISupplierScraper {
  readonly name = "local";

  async execute(params: Record<string, unknown>): Promise<ScraperResult<ScrapedSupplierData>> {
    const keywords = (params.keywords as string[]) || ["electronics supplier", "wholesale products", "manufacturer"];
    const region = (params.region as string) || "IL";
    const errors: string[] = [];
    const supplierData: ScrapedSupplierData[] = [];

    if (!env.SERPAPI_KEY) {
      return { success: false, data: [], errors: ["SERPAPI_KEY not configured"], scrapedAt: new Date() };
    }

    for (const keyword of keywords) {
      try {
        // Search for local suppliers using SerpAPI Google Search
        const url = new URL("https://serpapi.com/search.json");
        url.searchParams.set("engine", "google");
        url.searchParams.set("q", `${keyword} supplier Israel`);
        url.searchParams.set("gl", region.toLowerCase());
        url.searchParams.set("hl", "en");
        url.searchParams.set("num", "10");
        url.searchParams.set("api_key", env.SERPAPI_KEY);

        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(env.SCRAPE_REQUEST_TIMEOUT),
        });

        if (!response.ok) {
          errors.push(`SerpAPI error for "${keyword}": HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();

        // Extract from organic results
        const organicResults = data.organic_results || [];
        for (const result of organicResults) {
          const name = result.title || "";
          const sourceUrl = result.link || "";
          const snippet = result.snippet || "";

          // Skip non-supplier results
          if (!name || !sourceUrl) continue;

          // Try to extract email from snippet
          const emailMatch = snippet.match(/[\w.-]+@[\w.-]+\.\w+/);

          supplierData.push({
            name: name.replace(/ - .*$/, "").trim(), // Clean title
            sourceUrl,
            rating: null,
            reviewCount: 0,
            responseTime: null,
            minOrderQty: null,
            priceRange: null,
            country: "Israel",
            contactEmail: emailMatch ? emailMatch[0] : null,
            verified: false,
          });
        }

        // Also extract from local/map results if available
        const localResults = data.local_results?.places || [];
        for (const place of localResults) {
          supplierData.push({
            name: place.title || place.name || "",
            sourceUrl: place.link || place.website || "",
            rating: place.rating || null,
            reviewCount: place.reviews || 0,
            responseTime: null,
            minOrderQty: null,
            priceRange: null,
            country: "Israel",
            contactEmail: null,
            verified: !!place.rating,
          });
        }

        logger.info(`Local scraper: "${keyword}" - found ${organicResults.length} organic + ${localResults.length} local results`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to search for "${keyword}": ${errMsg}`);
        logger.error(`Local supplier scraper error for "${keyword}"`, { error: errMsg });
      }
    }

    logger.info(`Local supplier scraper completed: ${supplierData.length} suppliers found`, { errors: errors.length });

    return {
      success: errors.length === 0,
      data: supplierData,
      errors,
      scrapedAt: new Date(),
    };
  }
}
