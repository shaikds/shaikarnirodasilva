import type { Supplier } from "@prisma/client";
import type {
  ISupplierRepository,
  SupplierQueryOptions,
  SupplierCreateData,
  SupplierUpdateData,
} from "../repositories/interfaces/supplier.repository.interface";
import { NotFoundError } from "../middleware/errorHandler.middleware";
import { calculateReliabilityScore } from "../utils/scoring";
import { eventBus } from "../events/eventBus";

export class SupplierService {
  constructor(private readonly supplierRepository: ISupplierRepository) {}

  async getSupplierById(id: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundError("Supplier");
    }
    return supplier;
  }

  async getSuppliers(options: SupplierQueryOptions): Promise<{ data: Supplier[]; total: number }> {
    return this.supplierRepository.findMany(options);
  }

  async createSupplier(data: SupplierCreateData): Promise<Supplier> {
    const score = calculateReliabilityScore({
      rating: data.rating ?? null,
      reviewCount: data.reviewCount ?? 0,
      responseTime: data.responseTime ?? null,
      verified: data.verified ?? false,
    });

    return this.supplierRepository.create({
      ...data,
      reviewCount: data.reviewCount ?? 0,
      verified: data.verified ?? false,
    });
  }

  async updateSupplier(id: string, data: SupplierUpdateData): Promise<Supplier> {
    const existing = await this.supplierRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Supplier");
    }
    return this.supplierRepository.update(id, data);
  }

  async deleteSupplier(id: string): Promise<void> {
    const existing = await this.supplierRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Supplier");
    }
    await this.supplierRepository.delete(id);
  }

  async recalculateReliabilityScore(id: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new NotFoundError("Supplier");
    }

    const score = calculateReliabilityScore({
      rating: supplier.rating,
      reviewCount: supplier.reviewCount,
      responseTime: supplier.responseTime,
      verified: supplier.verified,
    });

    const updated = await this.supplierRepository.update(id, {
      reliabilityScore: score.total,
    });

    eventBus.emit("reliability:updated", {
      supplierId: id,
      score: score.total,
      breakdown: score,
    });

    return updated;
  }

  async findBySourceUrl(sourceUrl: string): Promise<Supplier | null> {
    return this.supplierRepository.findBySourceUrl(sourceUrl);
  }

  async getSourceCounts(): Promise<Record<string, number>> {
    return this.supplierRepository.countBySource();
  }
}
