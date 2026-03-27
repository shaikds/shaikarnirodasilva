import { Queue } from "bullmq";
import { getRedisConfig } from "../config/redis";
import { QUEUE_NAMES } from "@trendsupply/shared";

const connection = getRedisConfig();

export const trendScrapingQueue = new Queue(QUEUE_NAMES.TREND_SCRAPING, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export const supplierDiscoveryQueue = new Queue(QUEUE_NAMES.SUPPLIER_DISCOVERY, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export const emailOutreachQueue = new Queue(QUEUE_NAMES.EMAIL_OUTREACH, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
  },
});

export const reliabilityScoringQueue = new Queue(QUEUE_NAMES.RELIABILITY_SCORING, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 3000,
    },
  },
});

export const allQueues = {
  [QUEUE_NAMES.TREND_SCRAPING]: trendScrapingQueue,
  [QUEUE_NAMES.SUPPLIER_DISCOVERY]: supplierDiscoveryQueue,
  [QUEUE_NAMES.EMAIL_OUTREACH]: emailOutreachQueue,
  [QUEUE_NAMES.RELIABILITY_SCORING]: reliabilityScoringQueue,
};
