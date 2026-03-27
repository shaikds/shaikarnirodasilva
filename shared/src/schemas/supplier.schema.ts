import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(300),
  source: z.string().min(1).max(50),
  sourceUrl: z.string().url(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).default(0),
  responseTime: z.number().int().min(0).nullable().optional(),
  minOrderQty: z.number().int().min(0).nullable().optional(),
  priceRange: z.string().max(100).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  verified: z.boolean().default(false),
  contactEmail: z.string().email().nullable().optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).optional(),
  responseTime: z.number().int().min(0).nullable().optional(),
  minOrderQty: z.number().int().min(0).nullable().optional(),
  priceRange: z.string().max(100).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  verified: z.boolean().optional(),
  contactEmail: z.string().email().nullable().optional(),
  reliabilityScore: z.number().min(0).max(100).optional(),
});

export const supplierQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  source: z.string().optional(),
  country: z.string().optional(),
  verified: z.coerce.boolean().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sortBy: z.enum(["reliabilityScore", "rating", "reviewCount", "createdAt"]).default("reliabilityScore"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const linkSupplierToTrendSchema = z.object({
  trendId: z.string().uuid(),
  supplierId: z.string().uuid(),
  matchScore: z.number().min(0).max(100),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierQueryInput = z.infer<typeof supplierQuerySchema>;
export type LinkSupplierToTrendInput = z.infer<typeof linkSupplierToTrendSchema>;
