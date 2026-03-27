import type { Trend, TrendSupplier } from "@prisma/client";
import type {
  ITrendRepository,
  TrendQueryOptions,
  TrendCreateData,
  TrendUpdateData,
} from "../repositories/interfaces/trend.repository.interface";
import { NotFoundError, ConflictError } from "../middleware/errorHandler.middleware";
import { eventBus } from "../events/eventBus";

export class TrendService {
  constructor(private readonly trendRepository: ITrendRepository) {}

  async getTrendById(id: string): Promise<Trend> {
    const trend = await this.trendRepository.findById(id);
    if (!trend) {
      throw new NotFoundError("Trend");
    }
    return trend;
  }

  async getTrends(options: TrendQueryOptions): Promise<{ data: Trend[]; total: number }> {
    return this.trendRepository.findMany(options);
  }

  async createTrend(data: TrendCreateData): Promise<Trend> {
    const existing = await this.trendRepository.findByKeyword(data.keyword);
    if (existing) {
      throw new ConflictError(`Trend with keyword "${data.keyword}" already exists`);
    }

    const trend = await this.trendRepository.create(data);

    eventBus.emit("trend:detected", {
      trendId: trend.id,
      keyword: trend.keyword,
      source: trend.source,
      volume: trend.volume,
      growthRate: trend.growthRate,
    });

    return trend;
  }

  async updateTrend(id: string, data: TrendUpdateData): Promise<Trend> {
    const existing = await this.trendRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Trend");
    }
    return this.trendRepository.update(id, data);
  }

  async deleteTrend(id: string): Promise<void> {
    const existing = await this.trendRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Trend");
    }
    await this.trendRepository.delete(id);
  }

  async linkSupplier(trendId: string, supplierId: string, matchScore: number): Promise<TrendSupplier> {
    const link = await this.trendRepository.linkSupplier(trendId, supplierId, matchScore);

    eventBus.emit("supplier:matched", {
      trendId,
      supplierId,
      matchScore,
    });

    return link;
  }

  async getSuppliersByTrendId(trendId: string): Promise<TrendSupplier[]> {
    const trend = await this.trendRepository.findById(trendId);
    if (!trend) {
      throw new NotFoundError("Trend");
    }
    return this.trendRepository.getSuppliersByTrendId(trendId);
  }

  async getStatusCounts(): Promise<Record<string, number>> {
    return this.trendRepository.countByStatus();
  }
}
