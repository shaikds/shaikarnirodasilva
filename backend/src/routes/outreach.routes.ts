import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { Request, Response, NextFunction } from "express";
import { db } from "../config/database";
import type { ApiResponse, PaginatedResponse } from "@trendsupply/shared";

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [outreaches, total] = await Promise.all([
      db.outreach.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { supplier: true },
      }),
      db.outreach.count(),
    ]);

    const response: PaginatedResponse<typeof outreaches[0]> = {
      success: true,
      data: outreaches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
