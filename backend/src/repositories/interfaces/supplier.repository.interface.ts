import type { Supplier } from "@prisma/client";

export interface SupplierQueryOptions {
  page: number;
  limit: number;
  source?: string;
  country?: string;
  verified?: boolean;
  minRating?: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface SupplierCreateData {
  name: string;
  source: string;
  sourceUrl: string;
  rating?: number | null;
  reviewCount?: number;
  responseTime?: number | null;
  minOrderQty?: number | null;
  priceRange?: string | null;
  country?: string | null;
  verified?: boolean;
  contactEmail?: string | null;
}

export interface SupplierUpdateData {
  name?: string;
  rating?: number | null;
  reviewCount?: number;
  responseTime?: number | null;
  minOrderQty?: number | null;
  priceRange?: string | null;
  country?: string | null;
  verified?: boolean;
  contactEmail?: string | null;
  reliabilityScore?: number;
  lastScrapedAt?: Date;
}

export interface ISupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  findMany(options: SupplierQueryOptions): Promise<{ data: Supplier[]; total: number }>;
  create(data: SupplierCreateData): Promise<Supplier>;
  update(id: string, data: SupplierUpdateData): Promise<Supplier>;
  delete(id: string): Promise<void>;
  findBySourceUrl(sourceUrl: string): Promise<Supplier | null>;
  findByTrendId(trendId: string): Promise<Supplier[]>;
  countBySource(): Promise<Record<string, number>>;
}
