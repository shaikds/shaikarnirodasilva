import { Worker, Job } from "bullmq";
import { getRedisConfig } from "../../config/redis";
import { QUEUE_NAMES } from "@trendsupply/shared";
import { ScraperFactory } from "../../scrapers/scraper.factory";
import { ScraperContext } from "../../scrapers/scraper.context";
import { PrismaTrendRepository } from "../../repositories/prisma-trend.repository";
import type { ScrapedTrendData } from "../../scrapers/interfaces/scraper.strategy";
import { logger } from "../../utils/logger";

interface TrendScrapingJobData {
  scraperType: "reddit" | "google-trends";
  params: Record<string, unknown>;
}

export function createTrendScrapingWorker(): Worker {
  const connection = getRedisConfig();
  const trendRepo = new PrismaTrendRepository();

  const worker = new Worker(
    QUEUE_NAMES.TREND_SCRAPING,
    async (job: Job<TrendScrapingJobData>) => {
      const { scraperType, params } = job.data;
      logger.info(`Processing trend scraping job: ${scraperType}`, { jobId: job.id });

      const scraper = ScraperFactory.createTrendScraper(scraperType);
      const context = new ScraperContext(scraper);
      const result = await context.run(params);

      let savedCount = 0;
      for (const trendData of result.data) {
        try {
          const existing = await trendRepo.findByKeyword(trendData.keyword);
          if (existing) {
            await trendRepo.update(existing.id, {
              volume: trendData.volume,
              growthRate: trendData.growthRate,
            });
          } else {
            const source = scraperType === "reddit" ? "REDDIT" : "GOOGLE_TRENDS";
            await trendRepo.create({
              keyword: trendData.keyword,
              source: source as "REDDIT" | "GOOGLE_TRENDS",
              sourceUrl: trendData.sourceUrl,
              volume: trendData.volume,
              growthRate: trendData.growthRate,
              category: trendData.category,
            });
          }
          savedCount++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn(`Failed to save trend: ${trendData.keyword}`, { error: errMsg });
        }
      }

      logger.info(`Trend scraping job completed: ${savedCount}/${result.data.length} saved`, {
        jobId: job.id,
        scraperType,
      });

      return { savedCount, totalScraped: result.data.length, errors: result.errors };
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(`Trend scraping job failed: ${job?.id}`, { error: err.message });
  });

  worker.on("completed", (job) => {
    logger.info(`Trend scraping job completed: ${job.id}`);
  });

  return worker;
}
