import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { PrismaUserRepository } from "../repositories/prisma-user.repository";
import type { ApiResponse } from "@trendsupply/shared";

const authService = new AuthService(new PrismaUserRepository());

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: "Registration successful",
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: "Login successful",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(userId, currentPassword, newPassword);
      const response: ApiResponse<null> = {
        success: true,
        data: null,
        message: "Password changed successfully",
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userRepo = new PrismaUserRepository();
      const user = await userRepo.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
        return;
      }
      const { passwordHash: _, ...publicUser } = user;
      const response: ApiResponse<typeof publicUser> = {
        success: true,
        data: publicUser,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}
