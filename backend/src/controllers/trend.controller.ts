import { Request, Response, NextFunction } from "express";
import { TrendService } from "../services/trend.service";
import { PrismaTrendRepository } from "../repositories/prisma-trend.repository";
import type { ApiResponse, PaginatedResponse } from "@trendsupply/shared";
import type { Trend, TrendSupplier } from "@prisma/client";

const trendService = new TrendService(new PrismaTrendRepository());

export class TrendController {
  static async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data, total } = await trendService.getTrends(req.query as never);
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const response: PaginatedResponse<Trend> = {
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const trend = await trendService.getTrendById(req.params.id);
      const response: ApiResponse<Trend> = {
        success: true,
        data: trend,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const trend = await trendService.createTrend(req.body);
      const response: ApiResponse<Trend> = {
        success: true,
        data: trend,
        message: "Trend created successfully",
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const trend = await trendService.updateTrend(req.params.id, req.body);
      const response: ApiResponse<Trend> = {
        success: true,
        data: trend,
        message: "Trend updated successfully",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await trendService.deleteTrend(req.params.id);
      const response: ApiResponse<null> = {
        success: true,
        data: null,
        message: "Trend deleted successfully",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async linkSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { supplierId, matchScore } = req.body;
      const link = await trendService.linkSupplier(req.params.id, supplierId, matchScore);
      const response: ApiResponse<TrendSupplier> = {
        success: true,
        data: link,
        message: "Supplier linked to trend",
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async getSuppliers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const suppliers = await trendService.getSuppliersByTrendId(req.params.id);
      const response: ApiResponse<TrendSupplier[]> = {
        success: true,
        data: suppliers,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}
