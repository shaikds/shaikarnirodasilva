import { eventBus } from "../eventBus";
import type { TrendDetectedEvent, SupplierMatchedEvent, ReliabilityUpdatedEvent } from "../events";
import { logger } from "../../utils/logger";

export function registerDashboardListeners(): void {
  eventBus.on("trend:detected", (data: TrendDetectedEvent) => {
    logger.info("Dashboard update: new trend detected", {
      trendId: data.trendId,
      keyword: data.keyword,
      volume: data.volume,
    });
  });

  eventBus.on("supplier:matched", (data: SupplierMatchedEvent) => {
    logger.info("Dashboard update: supplier matched to trend", {
      trendId: data.trendId,
      supplierId: data.supplierId,
      matchScore: data.matchScore,
    });
  });

  eventBus.on("reliability:updated", (data: ReliabilityUpdatedEvent) => {
    logger.info("Dashboard update: supplier reliability score updated", {
      supplierId: data.supplierId,
      score: data.score,
    });
  });

  logger.info("Dashboard event listeners registered");
}
