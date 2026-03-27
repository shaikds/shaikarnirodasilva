import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { disconnectPrisma } from "./config/database";
import { disconnectRedis } from "./config/redis";
import { registerDashboardListeners } from "./events/listeners/dashboard.listener";
import { registerEmailListeners } from "./events/listeners/email.listener";
import { registerWhatsAppListeners } from "./events/listeners/whatsapp.listener";
import { createTrendScrapingWorker } from "./jobs/workers/trendScraping.worker";
import { createSupplierDiscoveryWorker } from "./jobs/workers/supplierDiscovery.worker";
import { createEmailOutreachWorker } from "./jobs/workers/emailOutreach.worker";
import { createReliabilityScoringWorker } from "./jobs/workers/reliabilityScoring.worker";
import { setupDailyScheduler } from "./jobs/schedulers/dailyScheduler";

async function bootstrap(): Promise<void> {
  registerDashboardListeners();
  registerEmailListeners();
  registerWhatsAppListeners();
  logger.info("Event listeners registered");

  const workers = [
    createTrendScrapingWorker(),
    createSupplierDiscoveryWorker(),
    createEmailOutreachWorker(),
    createReliabilityScoringWorker(),
  ];
  logger.info(`${workers.length} BullMQ workers started`);

  await setupDailyScheduler();
  logger.info("Daily scheduler configured");

  const server = app.listen(env.PORT, () => {
    logger.info(`TrendSupply backend running on port ${env.PORT}`, {
      environment: env.NODE_ENV,
      port: env.PORT,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      logger.info("HTTP server closed");
    });

    for (const worker of workers) {
      await worker.close();
    }
    logger.info("BullMQ workers closed");

    await disconnectPrisma();
    await disconnectRedis();

    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to bootstrap application", { error: err.message });
  process.exit(1);
});
