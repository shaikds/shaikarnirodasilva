import type { Trend, TrendSupplier, TrendSource, TrendStatus } from "@prisma/client";

export interface TrendQueryOptions {
  page: number;
  limit: number;
  source?: TrendSource;
  status?: TrendStatus;
  keyword?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface TrendCreateData {
  keyword: string;
  source: TrendSource;
  sourceUrl?: string | null;
  volume: number;
  growthRate: number;
  category?: string | null;
}

export interface TrendUpdateData {
  keyword?: string;
  volume?: number;
  growthRate?: number;
  category?: string | null;
  status?: TrendStatus;
}

export interface ITrendRepository {
  findById(id: string): Promise<Trend | null>;
  findMany(options: TrendQueryOptions): Promise<{ data: Trend[]; total: number }>;
  create(data: TrendCreateData): Promise<Trend>;
  update(id: string, data: TrendUpdateData): Promise<Trend>;
  delete(id: string): Promise<void>;
  findByKeyword(keyword: string): Promise<Trend | null>;
  linkSupplier(trendId: string, supplierId: string, matchScore: number): Promise<TrendSupplier>;
  getSuppliersByTrendId(trendId: string): Promise<TrendSupplier[]>;
  countByStatus(): Promise<Record<string, number>>;
}
