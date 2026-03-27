import type { NotificationType } from "@trendsupply/shared";
import { logger } from "../utils/logger";
import type { IEmailClient } from "../integrations/interfaces/email.interface";
import type { IMessagingClient } from "../integrations/interfaces/messaging.interface";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  recipients?: {
    email?: string[];
    whatsapp?: string[];
  };
}

export class NotificationService {
  constructor(
    private readonly emailClient: IEmailClient,
    private readonly messagingClient: IMessagingClient
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const promises: Promise<void>[] = [];

    if (payload.recipients?.email && payload.recipients.email.length > 0) {
      for (const email of payload.recipients.email) {
        promises.push(
          this.sendEmail(email, payload.title, payload.message).catch((err: Error) => {
            logger.error("Failed to send email notification", {
              email,
              error: err.message,
            });
          })
        );
      }
    }

    if (payload.recipients?.whatsapp && payload.recipients.whatsapp.length > 0) {
      for (const phone of payload.recipients.whatsapp) {
        promises.push(
          this.sendWhatsApp(phone, `${payload.title}\n\n${payload.message}`).catch((err: Error) => {
            logger.error("Failed to send WhatsApp notification", {
              phone,
              error: err.message,
            });
          })
        );
      }
    }

    await Promise.allSettled(promises);

    logger.info("Notification dispatched", {
      type: payload.type,
      title: payload.title,
      emailCount: payload.recipients?.email?.length ?? 0,
      whatsappCount: payload.recipients?.whatsapp?.length ?? 0,
    });
  }

  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    await this.emailClient.send({
      to,
      subject,
      html: `<div style="font-family: sans-serif; padding: 20px;">
        <h2>${subject}</h2>
        <p>${body}</p>
        <hr />
        <p style="color: #888; font-size: 12px;">TrendSupply Notification System</p>
      </div>`,
    });
  }

  private async sendWhatsApp(phone: string, message: string): Promise<void> {
    await this.messagingClient.send({
      to: phone,
      message,
    });
  }
}
