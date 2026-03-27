import { eventBus } from "../eventBus";
import type { OutreachSentEvent, OutreachRespondedEvent, SupplierMatchedEvent } from "../events";
import { logger } from "../../utils/logger";

export function registerWhatsAppListeners(): void {
  eventBus.on("outreach:sent", (data: OutreachSentEvent) => {
    if (data.channel === "WHATSAPP") {
      logger.info("WhatsApp outreach sent confirmation", {
        outreachId: data.outreachId,
        supplierId: data.supplierId,
        sentAt: data.sentAt,
      });
    }
  });

  eventBus.on("outreach:responded", (data: OutreachRespondedEvent) => {
    logger.info("WhatsApp notification: outreach response received", {
      outreachId: data.outreachId,
      supplierId: data.supplierId,
      respondedAt: data.respondedAt,
    });
  });

  eventBus.on("supplier:matched", (data: SupplierMatchedEvent) => {
    logger.info("WhatsApp notification: new supplier matched", {
      trendId: data.trendId,
      supplierId: data.supplierId,
      matchScore: data.matchScore,
    });
  });

  logger.info("WhatsApp event listeners registered");
}
