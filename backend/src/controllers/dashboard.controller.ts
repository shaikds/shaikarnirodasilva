import { Request, Response, NextFunction } from "express";
import { TrendService } from "../services/trend.service";
import { SupplierService } from "../services/supplier.service";
import { UserService } from "../services/user.service";
import { PrismaTrendRepository } from "../repositories/prisma-trend.repository";
import { PrismaSupplierRepository } from "../repositories/prisma-supplier.repository";
import { PrismaUserRepository } from "../repositories/prisma-user.repository";
import type { ApiResponse } from "@trendsupply/shared";

const trendService = new TrendService(new PrismaTrendRepository());
const supplierService = new SupplierService(new PrismaSupplierRepository());
const userService = new UserService(new PrismaUserRepository());

interface DashboardStats {
  trends: {
    statusCounts: Record<string, number>;
  };
  suppliers: {
    sourceCounts: Record<string, number>;
  };
  users: {
    total: number;
  };
}

export class DashboardController {
  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [trendStatusCounts, supplierSourceCounts, userCount] = await Promise.all([
        trendService.getStatusCounts(),
        supplierService.getSourceCounts(),
        userService.getUserCount(),
      ]);

      const stats: DashboardStats = {
        trends: {
          statusCounts: trendStatusCounts,
        },
        suppliers: {
          sourceCounts: supplierSourceCounts,
        },
        users: {
          total: userCount,
        },
      };

      const response: ApiResponse<DashboardStats> = {
        success: true,
        data: stats,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}
