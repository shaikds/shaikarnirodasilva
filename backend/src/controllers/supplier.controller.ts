import { Request, Response, NextFunction } from "express";
import { SupplierService } from "../services/supplier.service";
import { PrismaSupplierRepository } from "../repositories/prisma-supplier.repository";
import type { ApiResponse, PaginatedResponse } from "@trendsupply/shared";
import type { Supplier } from "@prisma/client";

const supplierService = new SupplierService(new PrismaSupplierRepository());

export class SupplierController {
  static async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data, total } = await supplierService.getSuppliers(req.query as never);
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const response: PaginatedResponse<Supplier> = {
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
      const supplier = await supplierService.getSupplierById(req.params.id);
      const response: ApiResponse<Supplier> = {
        success: true,
        data: supplier,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supplier = await supplierService.createSupplier(req.body);
      const response: ApiResponse<Supplier> = {
        success: true,
        data: supplier,
        message: "Supplier created successfully",
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supplier = await supplierService.updateSupplier(req.params.id, req.body);
      const response: ApiResponse<Supplier> = {
        success: true,
        data: supplier,
        message: "Supplier updated successfully",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await supplierService.deleteSupplier(req.params.id);
      const response: ApiResponse<null> = {
        success: true,
        data: null,
        message: "Supplier deleted successfully",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async recalculateScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supplier = await supplierService.recalculateReliabilityScore(req.params.id);
      const response: ApiResponse<Supplier> = {
        success: true,
        data: supplier,
        message: "Reliability score recalculated",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}
