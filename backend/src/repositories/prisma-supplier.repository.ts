import type { Supplier, Prisma } from "@prisma/client";
import { db } from "../config/database";
import type {
  ISupplierRepository,
  SupplierQueryOptions,
  SupplierCreateData,
  SupplierUpdateData,
} from "./interfaces/supplier.repository.interface";

export class PrismaSupplierRepository implements ISupplierRepository {
  async findById(id: string): Promise<Supplier | null> {
    return db.supplier.findUnique({
      where: { id },
      include: { trends: true },
    });
  }

  async findMany(options: SupplierQueryOptions): Promise<{ data: Supplier[]; total: number }> {
    const where: Prisma.SupplierWhereInput = {};

    if (options.source) {
      where.source = options.source;
    }
    if (options.country) {
      where.country = { contains: options.country, mode: "insensitive" };
    }
    if (options.verified !== undefined) {
      where.verified = options.verified;
    }
    if (options.minRating !== undefined) {
      where.rating = { gte: options.minRating };
    }

    const [data, total] = await Promise.all([
      db.supplier.findMany({
        where,
        orderBy: { [options.sortBy]: options.sortOrder },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      db.supplier.count({ where }),
    ]);

    return { data, total };
  }

  async create(data: SupplierCreateData): Promise<Supplier> {
    return db.supplier.create({ data });
  }

  async update(id: string, data: SupplierUpdateData): Promise<Supplier> {
    return db.supplier.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await db.trendSupplier.deleteMany({ where: { supplierId: id } });
    await db.outreach.deleteMany({ where: { supplierId: id } });
    await db.supplier.delete({ where: { id } });
  }

  async findBySourceUrl(sourceUrl: string): Promise<Supplier | null> {
    return db.supplier.findFirst({
      where: { sourceUrl },
    });
  }

  async findByTrendId(trendId: string): Promise<Supplier[]> {
    const trendSuppliers = await db.trendSupplier.findMany({
      where: { trendId },
      include: { supplier: true },
      orderBy: { matchScore: "desc" },
    });
    return trendSuppliers.map((ts) => ts.supplier);
  }

  async countBySource(): Promise<Record<string, number>> {
    const results = await db.supplier.groupBy({
      by: ["source"],
      _count: { source: true },
    });
    const counts: Record<string, number> = {};
    for (const result of results) {
      counts[result.source] = result._count.source;
    }
    return counts;
  }
}
