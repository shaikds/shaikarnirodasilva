import { eventBus } from "../eventBus";
import type { TrendDetectedEvent, OutreachSentEvent, OutreachRespondedEvent } from "../events";
import { logger } from "../../utils/logger";

export function registerEmailListeners(): void {
  eventBus.on("trend:detected", (data: TrendDetectedEvent) => {
    logger.info("Email notification: new trend detected", {
      keyword: data.keyword,
      source: data.source,
      growthRate: data.growthRate,
    });
  });

  eventBus.on("outreach:sent", (data: OutreachSentEvent) => {
    if (data.channel === "EMAIL") {
      logger.info("Email outreach sent confirmation", {
        outreachId: data.outreachId,
        supplierId: data.supplierId,
        sentAt: data.sentAt,
      });
    }
  });

  eventBus.on("outreach:responded", (data: OutreachRespondedEvent) => {
    logger.info("Email notification: outreach response received", {
      outreachId: data.outreachId,
      supplierId: data.supplierId,
      respondedAt: data.respondedAt,
    });
  });

  logger.info("Email event listeners registered");
}
