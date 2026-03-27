import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import type { ApiError } from "@trendsupply/shared";

type RequestField = "body" | "query" | "params";

export function validate(schema: ZodSchema, field: RequestField = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[field]);
      req[field] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const response: ApiError = {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            details: {
              issues: err.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
          },
        };
        res.status(400).json(response);
        return;
      }
      next(err);
    }
  };
}
