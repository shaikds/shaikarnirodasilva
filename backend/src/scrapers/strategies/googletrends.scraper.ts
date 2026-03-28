import type { ITrendScraper, ScrapedTrendData, ScraperResult } from "../interfaces/scraper.strategy";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";

interface SerpApiTrendResult {
  title?: string;
  query?: string;
  search_volume?: number;
  value?: number;
  extracted_value?: number;
  link?: string;
  serpapi_link?: string;
}

export class GoogleTrendsScraper implements ITrendScraper {
  readonly name = "google-trends";

  async execute(params: Record<string, unknown>): Promise<ScraperResult<ScrapedTrendData>> {
    const keywords = (params.keywords as string[]) || [
      "trending products 2024",
      "viral products",
      "best sellers",
      "new gadgets",
      "popular items",
    ];
    const geo = (params.geo as string) || "US";
    const errors: string[] = [];
    const trendData: ScrapedTrendData[] = [];

    if (!env.SERPAPI_KEY) {
      return {
        success: false,
        data: [],
        errors: ["SERPAPI_KEY not configured"],
        scrapedAt: new Date(),
      };
    }

    for (const keyword of keywords) {
      try {
        // Use SerpAPI Google Trends endpoint
        const url = new URL("https://serpapi.com/search.json");
        url.searchParams.set("engine", "google_trends");
        url.searchParams.set("q", keyword);
        url.searchParams.set("geo", geo);
        url.searchParams.set("data_type", "RELATED_QUERIES");
        url.searchParams.set("api_key", env.SERPAPI_KEY);

        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(env.SCRAPE_REQUEST_TIMEOUT),
        });

        if (!response.ok) {
          errors.push(`SerpAPI error for "${keyword}": HTTP ${response.status}`);
          continue;
        }

        const data = await response.json();

        // Extract related queries (rising/top)
        const risingQueries: SerpApiTrendResult[] = data.related_queries?.rising || [];
        const topQueries: SerpApiTrendResult[] = data.related_queries?.top || [];

        // Each related query becomes a trend
        for (const item of risingQueries.slice(0, 5)) {
          const query = item.query || item.title || "";
          if (!query) continue;

          trendData.push({
            keyword: query,
            volume: item.extracted_value || item.value || 0,
            growthRate: this.parseGrowthRate(item),
            sourceUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}&geo=${geo}`,
            category: keyword,
          });
        }

        for (const item of topQueries.slice(0, 3)) {
          const query = item.query || item.title || "";
          if (!query) continue;

          trendData.push({
            keyword: query,
            volume: item.extracted_value || item.value || 50,
            growthRate: this.estimateGrowthFromVolume(item.extracted_value || item.value || 50),
            sourceUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}&geo=${geo}`,
            category: keyword,
          });
        }

        // Also fetch interest over time for the keyword itself
        const interestUrl = new URL("https://serpapi.com/search.json");
        interestUrl.searchParams.set("engine", "google_trends");
        interestUrl.searchParams.set("q", keyword);
        interestUrl.searchParams.set("geo", geo);
        interestUrl.searchParams.set("data_type", "TIMESERIES");
        interestUrl.searchParams.set("api_key", env.SERPAPI_KEY);

        const interestResponse = await fetch(interestUrl.toString(), {
          signal: AbortSignal.timeout(env.SCRAPE_REQUEST_TIMEOUT),
        });

        if (interestResponse.ok) {
          const interestData = await interestResponse.json();
          const timelineData = interestData.interest_over_time?.timeline_data || [];

          if (timelineData.length > 0) {
            const latest = timelineData[timelineData.length - 1];
            const oldest = timelineData[0];
            const latestValue = latest?.values?.[0]?.extracted_value ?? 0;
            const oldestValue = oldest?.values?.[0]?.extracted_value ?? 1;
            const growth = oldestValue > 0 ? ((latestValue - oldestValue) / oldestValue) * 100 : 0;

            trendData.push({
              keyword,
              volume: latestValue * 100,
              growthRate: Math.round(growth * 10) / 10,
              sourceUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=${geo}`,
              category: null,
            });
          }
        }

        logger.info(`Google Trends: scraped "${keyword}" - found ${risingQueries.length} rising, ${topQueries.length} top queries`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to fetch trends for "${keyword}": ${errMsg}`);
        logger.error(`Google Trends scraper error for "${keyword}"`, { error: errMsg });
      }
    }

    logger.info(`Google Trends scraper completed: ${trendData.length} trends found`, {
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      data: trendData,
      errors,
      scrapedAt: new Date(),
    };
  }

  private parseGrowthRate(item: SerpApiTrendResult): number {
    const value = item.extracted_value || item.value || 0;
    // SerpAPI rising queries show % increase (e.g., 5000 = 5000% increase)
    if (value > 1000) return value;
    if (value > 100) return value;
    return value * 10;
  }

  private estimateGrowthFromVolume(volume: number): number {
    if (volume >= 80) return 150 + Math.random() * 50;
    if (volume >= 50) return 50 + Math.random() * 50;
    if (volume >= 20) return 10 + Math.random() * 30;
    return Math.random() * 10;
  }
}
