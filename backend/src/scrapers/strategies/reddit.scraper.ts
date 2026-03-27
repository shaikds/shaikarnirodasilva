import type { ITrendScraper, ScrapedTrendData, ScraperResult } from "../interfaces/scraper.strategy";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

interface RedditPost {
  title: string;
  score: number;
  num_comments: number;
  url: string;
  subreddit: { display_name: string };
  created_utc: number;
}

export class RedditScraper implements ITrendScraper {
  readonly name = "reddit";

  async execute(params: Record<string, unknown>): Promise<ScraperResult<ScrapedTrendData>> {
    const subreddits = (params.subreddits as string[]) || [
      "ecommerce",
      "dropshipping",
      "FulfillmentByAmazon",
      "Entrepreneur",
    ];
    const limit = (params.limit as number) || 50;
    const errors: string[] = [];
    const trendData: ScrapedTrendData[] = [];

    try {
      const Snoowrap = await import("snoowrap");
      const reddit = new Snoowrap.default({
        userAgent: "TrendSupply Scraper v1.0",
        clientId: env.REDDIT_CLIENT_ID,
        clientSecret: env.REDDIT_CLIENT_SECRET,
        username: env.REDDIT_USERNAME,
        password: env.REDDIT_PASSWORD,
      });

      for (const subreddit of subreddits) {
        try {
          const posts = await reddit.getSubreddit(subreddit).getHot({ limit });
          const keywordCounts = new Map<string, { volume: number; urls: string[]; category: string }>();

          for (const post of posts) {
            const redditPost = post as unknown as RedditPost;
            const keywords = this.extractKeywords(redditPost.title);
            for (const keyword of keywords) {
              const existing = keywordCounts.get(keyword);
              if (existing) {
                existing.volume += redditPost.score + redditPost.num_comments;
                existing.urls.push(redditPost.url);
              } else {
                keywordCounts.set(keyword, {
                  volume: redditPost.score + redditPost.num_comments,
                  urls: [redditPost.url],
                  category: subreddit,
                });
              }
            }
          }

          for (const [keyword, data] of keywordCounts) {
            if (data.volume >= 10) {
              trendData.push({
                keyword,
                volume: data.volume,
                growthRate: this.estimateGrowthRate(data.volume),
                sourceUrl: data.urls[0] || null,
                category: data.category,
              });
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to scrape r/${subreddit}: ${errMsg}`);
          logger.warn(`Reddit scraper error for r/${subreddit}`, { error: errMsg });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Reddit API initialization failed: ${errMsg}`);
      logger.error("Reddit scraper initialization failed", { error: errMsg });
    }

    logger.info(`Reddit scraper completed: ${trendData.length} trends found`, {
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      data: trendData,
      errors,
      scrapedAt: new Date(),
    };
  }

  private extractKeywords(title: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "need", "dare", "ought",
      "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
      "as", "into", "through", "during", "before", "after", "above", "below",
      "between", "out", "off", "over", "under", "again", "further", "then",
      "once", "here", "there", "when", "where", "why", "how", "all", "both",
      "each", "few", "more", "most", "other", "some", "such", "no", "nor",
      "not", "only", "own", "same", "so", "than", "too", "very", "just",
      "don", "now", "and", "but", "or", "if", "this", "that", "it", "i",
      "my", "me", "we", "you", "your", "what", "which", "who", "whom",
    ]);

    const cleaned = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
    const words = cleaned.split(/\s+/).filter(
      (w) => w.length > 2 && !stopWords.has(w) && !/^\d+$/.test(w)
    );

    const phrases: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      phrases.push(`${words[i]} ${words[i + 1]}`);
    }

    return [...words.slice(0, 5), ...phrases.slice(0, 3)];
  }

  private estimateGrowthRate(volume: number): number {
    if (volume > 1000) return 200 + Math.random() * 100;
    if (volume > 500) return 100 + Math.random() * 100;
    if (volume > 100) return 50 + Math.random() * 50;
    return 10 + Math.random() * 40;
  }
}
