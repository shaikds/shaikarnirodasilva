import { env } from "../config/env";
import { logger } from "../utils/logger";
import type { IMessagingClient, MessagingPayload, MessagingSendResult } from "./interfaces/messaging.interface";

interface GreenApiResponse {
  idMessage?: string;
  error?: string;
}

export class GreenApiWhatsAppClient implements IMessagingClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = `https://api.green-api.com/waInstance${env.GREENAPI_INSTANCE_ID}`;
  }

  async send(payload: MessagingPayload): Promise<MessagingSendResult> {
    const chatId = this.formatChatId(payload.to);
    const url = `${this.baseUrl}/sendMessage/${env.GREENAPI_API_TOKEN}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message: payload.message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("GreenAPI send failed", {
          to: payload.to,
          status: response.status,
          error: errorText,
        });
        return { id: "", success: false };
      }

      const data = (await response.json()) as GreenApiResponse;

      if (data.error) {
        logger.error("GreenAPI error response", {
          to: payload.to,
          error: data.error,
        });
        return { id: "", success: false };
      }

      logger.info("WhatsApp message sent via GreenAPI", {
        to: payload.to,
        messageId: data.idMessage,
      });

      return {
        id: data.idMessage || "",
        success: true,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("GreenAPI WhatsApp error", { to: payload.to, error: errMsg });
      return { id: "", success: false };
    }
  }

  private formatChatId(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, "");
    return `${cleaned}@c.us`;
  }
}
