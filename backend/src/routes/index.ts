import { Router } from "express";
import authRoutes from "./auth.routes";
import trendRoutes from "./trend.routes";
import supplierRoutes from "./supplier.routes";
import dashboardRoutes from "./dashboard.routes";
import jobRoutes from "./jobs.routes";
import outreachRoutes from "./outreach.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/trends", trendRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/jobs", jobRoutes);
router.use("/outreach", outreachRoutes);

export default router;
