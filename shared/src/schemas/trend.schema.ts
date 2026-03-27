import { z } from "zod";

export const TrendSourceEnum = z.enum(["REDDIT", "GOOGLE_TRENDS"]);
export const TrendStatusEnum = z.enum(["ACTIVE", "STALE", "ARCHIVED"]);

export const createTrendSchema = z.object({
  keyword: z.string().min(1).max(200),
  source: TrendSourceEnum,
  sourceUrl: z.string().url().nullable().optional(),
  volume: z.number().int().min(0),
  growthRate: z.number().min(-100).max(10000),
  category: z.string().max(100).nullable().optional(),
});

export const updateTrendSchema = z.object({
  keyword: z.string().min(1).max(200).optional(),
  volume: z.number().int().min(0).optional(),
  growthRate: z.number().min(-100).max(10000).optional(),
  category: z.string().max(100).nullable().optional(),
  status: TrendStatusEnum.optional(),
});

export const trendQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  source: TrendSourceEnum.optional(),
  status: TrendStatusEnum.optional(),
  keyword: z.string().optional(),
  sortBy: z.enum(["volume", "growthRate", "detectedAt"]).default("detectedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateTrendInput = z.infer<typeof createTrendSchema>;
export type UpdateTrendInput = z.infer<typeof updateTrendSchema>;
export type TrendQueryInput = z.infer<typeof trendQuerySchema>;
