import { FlowProducer } from "bullmq";
import { getRedisConfig } from "../../config/redis";
import { QUEUE_NAMES } from "@trendsupply/shared";
import { logger } from "../../utils/logger";

const connection = getRedisConfig();

export const flowProducer = new FlowProducer({ connection });

export async function runDailyTrendPipeline(): Promise<void> {
  logger.info("Starting daily trend pipeline flow");

  const flow = await flowProducer.add({
    name: "daily-pipeline",
    queueName: QUEUE_NAMES.RELIABILITY_SCORING,
    data: { stage: "scoring", triggeredAt: new Date().toISOString() },
    children: [
      {
        name: "supplier-discovery",
        queueName: QUEUE_NAMES.SUPPLIER_DISCOVERY,
        data: { stage: "discovery", triggeredAt: new Date().toISOString() },
        children: [
          {
            name: "trend-scraping-reddit",
            queueName: QUEUE_NAMES.TREND_SCRAPING,
            data: {
              stage: "scraping",
              scraperType: "reddit",
              params: {
                subreddits: ["ecommerce", "dropshipping", "FulfillmentByAmazon", "Entrepreneur"],
                limit: 50,
              },
            },
          },
          {
            name: "trend-scraping-google",
            queueName: QUEUE_NAMES.TREND_SCRAPING,
            data: {
              stage: "scraping",
              scraperType: "google-trends",
              params: {
                keywords: [],
                geo: "US",
              },
            },
          },
        ],
      },
    ],
  });

  logger.info("Daily trend pipeline flow created", {
    flowJobId: flow.job.id,
  });
}
