import { Router } from "express";
import authRoutes from "./auth.routes";
import trendRoutes from "./trend.routes";
import supplierRoutes from "./supplier.routes";
import dashboardRoutes from "./dashboard.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/trends", trendRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
