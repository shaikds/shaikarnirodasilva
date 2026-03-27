import { Router } from "express";
import { TrendController } from "../controllers/trend.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createTrendSchema,
  updateTrendSchema,
  trendQuerySchema,
  linkSupplierToTrendSchema,
} from "@trendsupply/shared";

const router = Router();

router.get(
  "/",
  authenticate,
  validate(trendQuerySchema, "query"),
  TrendController.getAll
);

router.get("/:id", authenticate, TrendController.getById);

router.post(
  "/",
  authenticate,
  validate(createTrendSchema),
  TrendController.create
);

router.patch(
  "/:id",
  authenticate,
  validate(updateTrendSchema),
  TrendController.update
);

router.delete("/:id", authenticate, TrendController.delete);

router.post(
  "/:id/suppliers",
  authenticate,
  validate(linkSupplierToTrendSchema),
  TrendController.linkSupplier
);

router.get("/:id/suppliers", authenticate, TrendController.getSuppliers);

export default router;
