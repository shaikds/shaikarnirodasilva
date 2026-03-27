import { trendScrapingQueue } from "../queues";
import { runDailyTrendPipeline } from "../flows/dailyTrendPipeline.flow";
import { logger } from "../../utils/logger";

export async function setupDailyScheduler(): Promise<void> {
  await trendScrapingQueue.upsertJobScheduler(
    "daily-trend-pipeline",
    {
      pattern: "0 6 * * *",
    },
    {
      name: "scheduled-daily-pipeline",
      data: {
        triggeredBy: "scheduler",
        scheduledAt: new Date().toISOString(),
      },
    }
  );

  logger.info("Daily scheduler configured: runs at 06:00 UTC every day");
}

export async function triggerPipelineManually(): Promise<void> {
  logger.info("Manually triggering daily trend pipeline");
  await runDailyTrendPipeline();
}
