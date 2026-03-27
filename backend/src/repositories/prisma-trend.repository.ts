import type { Trend, TrendSupplier, Prisma } from "@prisma/client";
import { db } from "../config/database";
import type {
  ITrendRepository,
  TrendQueryOptions,
  TrendCreateData,
  TrendUpdateData,
} from "./interfaces/trend.repository.interface";

export class PrismaTrendRepository implements ITrendRepository {
  async findById(id: string): Promise<Trend | null> {
    return db.trend.findUnique({
      where: { id },
      include: { suppliers: true },
    });
  }

  async findMany(options: TrendQueryOptions): Promise<{ data: Trend[]; total: number }> {
    const where: Prisma.TrendWhereInput = {};

    if (options.source) {
      where.source = options.source;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.keyword) {
      where.keyword = { contains: options.keyword, mode: "insensitive" };
    }

    const [data, total] = await Promise.all([
      db.trend.findMany({
        where,
        orderBy: { [options.sortBy]: options.sortOrder },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: { suppliers: true },
      }),
      db.trend.count({ where }),
    ]);

    return { data, total };
  }

  async create(data: TrendCreateData): Promise<Trend> {
    return db.trend.create({ data });
  }

  async update(id: string, data: TrendUpdateData): Promise<Trend> {
    return db.trend.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await db.trendSupplier.deleteMany({ where: { trendId: id } });
    await db.trend.delete({ where: { id } });
  }

  async findByKeyword(keyword: string): Promise<Trend | null> {
    return db.trend.findFirst({
      where: { keyword: { equals: keyword, mode: "insensitive" } },
    });
  }

  async linkSupplier(trendId: string, supplierId: string, matchScore: number): Promise<TrendSupplier> {
    return db.trendSupplier.upsert({
      where: {
        trendId_supplierId: { trendId, supplierId },
      },
      update: { matchScore },
      create: { trendId, supplierId, matchScore },
    });
  }

  async getSuppliersByTrendId(trendId: string): Promise<TrendSupplier[]> {
    return db.trendSupplier.findMany({
      where: { trendId },
      include: { supplier: true },
      orderBy: { matchScore: "desc" },
    });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const results = await db.trend.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    const counts: Record<string, number> = {};
    for (const result of results) {
      counts[result.status] = result._count.status;
    }
    return counts;
  }
}
