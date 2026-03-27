import { Worker, Job } from "bullmq";
import { getRedisConfig } from "../../config/redis";
import { QUEUE_NAMES } from "@trendsupply/shared";
import { db } from "../../config/database";
import { calculateReliabilityScore } from "../../utils/scoring";
import { eventBus } from "../../events/eventBus";
import { logger } from "../../utils/logger";

interface ReliabilityScoringJobData {
  stage: string;
  triggeredAt: string;
  supplierId?: string;
}

export function createReliabilityScoringWorker(): Worker {
  const connection = getRedisConfig();

  const worker = new Worker(
    QUEUE_NAMES.RELIABILITY_SCORING,
    async (job: Job<ReliabilityScoringJobData>) => {
      logger.info("Processing reliability scoring job", { jobId: job.id });

      let suppliers;
      if (job.data.supplierId) {
        const supplier = await db.supplier.findUnique({
          where: { id: job.data.supplierId },
        });
        suppliers = supplier ? [supplier] : [];
      } else {
        suppliers = await db.supplier.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        });
      }

      let updatedCount = 0;
      for (const supplier of suppliers) {
        try {
          const score = calculateReliabilityScore({
            rating: supplier.rating,
            reviewCount: supplier.reviewCount,
            responseTime: supplier.responseTime,
            verified: supplier.verified,
          });

          if (Math.abs(supplier.reliabilityScore - score.total) > 0.01) {
            await db.supplier.update({
              where: { id: supplier.id },
              data: { reliabilityScore: score.total },
            });

            eventBus.emit("reliability:updated", {
              supplierId: supplier.id,
              score: score.total,
              breakdown: score,
            });

            updatedCount++;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn(`Failed to update score for supplier: ${supplier.id}`, {
            error: errMsg,
          });
        }
      }

      logger.info(`Reliability scoring completed: ${updatedCount}/${suppliers.length} updated`, {
        jobId: job.id,
      });

      return { totalProcessed: suppliers.length, updatedCount };
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(`Reliability scoring job failed: ${job?.id}`, { error: err.message });
  });

  return worker;
}
