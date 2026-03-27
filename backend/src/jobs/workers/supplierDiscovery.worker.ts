import { Worker, Job } from "bullmq";
import { getRedisConfig } from "../../config/redis";
import { QUEUE_NAMES } from "@trendsupply/shared";
import { ScraperFactory } from "../../scrapers/scraper.factory";
import { ScraperContext } from "../../scrapers/scraper.context";
import { PrismaSupplierRepository } from "../../repositories/prisma-supplier.repository";
import { PrismaTrendRepository } from "../../repositories/prisma-trend.repository";
import { calculateReliabilityScore } from "../../utils/scoring";
import { logger } from "../../utils/logger";

interface SupplierDiscoveryJobData {
  stage: string;
  triggeredAt: string;
}

export function createSupplierDiscoveryWorker(): Worker {
  const connection = getRedisConfig();
  const supplierRepo = new PrismaSupplierRepository();
  const trendRepo = new PrismaTrendRepository();

  const worker = new Worker(
    QUEUE_NAMES.SUPPLIER_DISCOVERY,
    async (job: Job<SupplierDiscoveryJobData>) => {
      logger.info("Processing supplier discovery job", { jobId: job.id });

      const { data: trends } = await trendRepo.findMany({
        page: 1,
        limit: 20,
        status: "ACTIVE" as const,
        sortBy: "growthRate",
        sortOrder: "desc",
      });

      const keywords = trends.map((t) => t.keyword);
      let totalSaved = 0;

      for (const scraperType of ["alibaba", "local"] as const) {
        const scraper = ScraperFactory.createSupplierScraper(scraperType);
        const context = new ScraperContext(scraper);
        const result = await context.run({ keywords, maxPages: 1 });

        for (const supplierData of result.data) {
          try {
            const existing = await supplierRepo.findBySourceUrl(supplierData.sourceUrl);
            if (existing) {
              await supplierRepo.update(existing.id, {
                rating: supplierData.rating,
                reviewCount: supplierData.reviewCount,
                lastScrapedAt: new Date(),
              });
            } else {
              const score = calculateReliabilityScore({
                rating: supplierData.rating,
                reviewCount: supplierData.reviewCount,
                responseTime: supplierData.responseTime,
                verified: supplierData.verified,
              });

              const supplier = await supplierRepo.create({
                name: supplierData.name,
                source: scraperType === "alibaba" ? "ALIBABA" : "LOCAL",
                sourceUrl: supplierData.sourceUrl,
                rating: supplierData.rating,
                reviewCount: supplierData.reviewCount,
                responseTime: supplierData.responseTime,
                minOrderQty: supplierData.minOrderQty,
                priceRange: supplierData.priceRange,
                country: supplierData.country,
                contactEmail: supplierData.contactEmail,
                verified: supplierData.verified,
              });

              await supplierRepo.update(supplier.id, {
                reliabilityScore: score.total,
              });

              for (const trend of trends) {
                const matchScore = calculateMatchScore(trend.keyword, supplierData.name);
                if (matchScore > 30) {
                  await trendRepo.linkSupplier(trend.id, supplier.id, matchScore);
                }
              }
            }
            totalSaved++;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.warn(`Failed to save supplier: ${supplierData.name}`, { error: errMsg });
          }
        }
      }

      logger.info(`Supplier discovery completed: ${totalSaved} suppliers processed`, {
        jobId: job.id,
      });

      return { totalSaved, trendCount: trends.length };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(`Supplier discovery job failed: ${job?.id}`, { error: err.message });
  });

  return worker;
}

function calculateMatchScore(keyword: string, supplierName: string): number {
  const keywordLower = keyword.toLowerCase();
  const nameLower = supplierName.toLowerCase();

  if (nameLower.includes(keywordLower)) return 90;

  const keywordWords = keywordLower.split(/\s+/);
  const nameWords = nameLower.split(/\s+/);
  let matchedWords = 0;

  for (const kw of keywordWords) {
    if (nameWords.some((nw) => nw.includes(kw) || kw.includes(nw))) {
      matchedWords++;
    }
  }

  if (keywordWords.length === 0) return 0;
  return Math.round((matchedWords / keywordWords.length) * 80);
}
