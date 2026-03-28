import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { Request, Response, NextFunction } from "express";
import { runDailyTrendPipeline } from "../jobs/flows/dailyTrendPipeline.flow";
import { trendScrapingQueue, supplierDiscoveryQueue, reliabilityScoringQueue } from "../jobs/queues";
import { allQueues } from "../jobs/queues";
import { logger } from "../utils/logger";
import type { ApiResponse } from "@trendsupply/shared";

const router = Router();

// Trigger full daily pipeline
router.post("/trigger/full-pipeline", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await runDailyTrendPipeline();
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "Full daily trend pipeline triggered successfully" },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Trigger individual scraper
router.post("/trigger/scrape/:type", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type } = req.params;
    const validTypes = ["reddit", "google-trends", "alibaba", "local"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ success: false, error: { message: `Invalid scraper type. Valid: ${validTypes.join(", ")}` } });
      return;
    }

    await trendScrapingQueue.add(`manual-scrape-${type}`, {
      stage: "scraping",
      scraperType: type,
      manual: true,
      triggeredAt: new Date().toISOString(),
      params: type === "reddit"
        ? { subreddits: ["ecommerce", "dropshipping", "FulfillmentByAmazon", "Entrepreneur"], limit: 50 }
        : type === "google-trends"
        ? { keywords: [], geo: "US" }
        : type === "alibaba"
        ? { keywords: [], maxResults: 20 }
        : { keywords: [], region: "US" },
    });

    const response: ApiResponse<{ message: string; scraperType: string }> = {
      success: true,
      data: { message: `${type} scraper job queued`, scraperType: type },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Trigger supplier discovery for a specific keyword
router.post("/trigger/discover-suppliers", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { keywords } = req.body;
    await supplierDiscoveryQueue.add("manual-discovery", {
      stage: "discovery",
      manual: true,
      keywords: keywords || [],
      triggeredAt: new Date().toISOString(),
    });

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "Supplier discovery job queued" },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Trigger reliability scoring
router.post("/trigger/score", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await reliabilityScoringQueue.add("manual-scoring", {
      stage: "scoring",
      manual: true,
      triggeredAt: new Date().toISOString(),
    });

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: "Reliability scoring job queued" },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Get queue status (job counts)
router.get("/status", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status: Record<string, { waiting: number; active: number; completed: number; failed: number }> = {};

    for (const [name, queue] of Object.entries(allQueues)) {
      const counts = await queue.getJobCounts("waiting", "active", "completed", "failed");
      status[name] = counts as { waiting: number; active: number; completed: number; failed: number };
    }

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// Get recent jobs from a queue
router.get("/history/:queueName", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { queueName } = req.params;
    const queue = allQueues[queueName as keyof typeof allQueues];
    if (!queue) {
      res.status(400).json({ success: false, error: { message: `Unknown queue: ${queueName}` } });
      return;
    }

    const [completed, failed, active] = await Promise.all([
      queue.getJobs(["completed"], 0, 10),
      queue.getJobs(["failed"], 0, 10),
      queue.getJobs(["active"], 0, 10),
    ]);

    const jobs = [...completed, ...failed, ...active]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 20)
      .map(j => ({
        id: j.id,
        name: j.name,
        data: j.data,
        status: j.finishedOn ? (j.failedReason ? "failed" : "completed") : "active",
        createdAt: j.timestamp ? new Date(j.timestamp).toISOString() : null,
        finishedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
        failedReason: j.failedReason || null,
      }));

    const response: ApiResponse<typeof jobs> = {
      success: true,
      data: jobs,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
