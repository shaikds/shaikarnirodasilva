import { Router } from "express";
import { SupplierController } from "../controllers/supplier.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierQuerySchema,
} from "@trendsupply/shared";

const router = Router();

router.get(
  "/",

  validate(supplierQuerySchema, "query"),
  SupplierController.getAll
);

router.get("/:id", authenticate, SupplierController.getById);

router.post(
  "/",

  validate(createSupplierSchema),
  SupplierController.create
);

router.patch(
  "/:id",

  validate(updateSupplierSchema),
  SupplierController.update
);

router.delete("/:id", authenticate, SupplierController.delete);

router.post(
  "/:id/recalculate-score",

  SupplierController.recalculateScore
);

export default router;
