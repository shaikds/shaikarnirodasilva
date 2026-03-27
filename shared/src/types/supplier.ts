export enum SupplierSource {
  LOCAL = "LOCAL",
  ALIBABA = "ALIBABA",
}

export interface SupplierScore {
  rating: number;
  reviews: number;
  responseTime: number;
  verified: number;
  consistency: number;
  total: number;
}

export interface ISupplier {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  rating: number | null;
  reviewCount: number;
  responseTime: number | null;
  minOrderQty: number | null;
  priceRange: string | null;
  country: string | null;
  reliabilityScore: number;
  verified: boolean;
  contactEmail: string | null;
  lastScrapedAt: Date | null;
  createdAt: Date;
}
