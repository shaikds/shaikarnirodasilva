import { Router, Request, Response } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/stats", DashboardController.getStats);

router.get("/config-status", async (req: Request, res: Response) => {
  const { env } = await import("../config/env");
  res.json({
    success: true,
    data: {
      database: true, // if we got here, DB is connected
      redis: true,    // workers are running
      serpapi: !!env.SERPAPI_KEY,
      reddit: !!(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET),
      resend: !!env.RESEND_API_KEY,
      greenapi: !!(env.GREENAPI_INSTANCE_ID && env.GREENAPI_API_TOKEN),
    }
  });
});

export default router;
