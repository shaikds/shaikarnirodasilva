import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env";
import { generalRateLimiter } from "./middleware/rateLimiter.middleware";
import { errorHandler } from "./middleware/errorHandler.middleware";
import routes from "./routes/index";
import { API_PREFIX } from "@trendsupply/shared";
import type { ApiResponse } from "@trendsupply/shared";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(generalRateLimiter);

app.get("/health", (_req, res) => {
  const response: ApiResponse<{ status: string; timestamp: string; uptime: number }> = {
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  };
  res.status(200).json(response);
});

app.use(API_PREFIX, routes);

app.use(errorHandler);

export default app;
