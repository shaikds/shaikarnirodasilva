export interface ScrapedTrendData {
  keyword: string;
  volume: number;
  growthRate: number;
  sourceUrl: string | null;
  category: string | null;
}

export interface ScrapedSupplierData {
  name: string;
  sourceUrl: string;
  rating: number | null;
  reviewCount: number;
  responseTime: number | null;
  minOrderQty: number | null;
  priceRange: string | null;
  country: string | null;
  contactEmail: string | null;
  verified: boolean;
}

export interface ScraperResult<T> {
  success: boolean;
  data: T[];
  errors: string[];
  scrapedAt: Date;
}

export interface IScraperStrategy<T> {
  readonly name: string;
  execute(params: Record<string, unknown>): Promise<ScraperResult<T>>;
}

export interface ITrendScraper extends IScraperStrategy<ScrapedTrendData> {}
export interface ISupplierScraper extends IScraperStrategy<ScrapedSupplierData> {}
