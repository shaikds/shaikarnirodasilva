export enum TrendSource {
  REDDIT = "REDDIT",
  GOOGLE_TRENDS = "GOOGLE_TRENDS",
}

export enum TrendStatus {
  ACTIVE = "ACTIVE",
  STALE = "STALE",
  ARCHIVED = "ARCHIVED",
}

export interface ITrend {
  id: string;
  keyword: string;
  source: TrendSource;
  sourceUrl: string | null;
  volume: number;
  growthRate: number;
  category: string | null;
  detectedAt: Date;
  status: TrendStatus;
}

export interface ITrendSupplier {
  id: string;
  trendId: string;
  supplierId: string;
  matchScore: number;
  createdAt: Date;
}
