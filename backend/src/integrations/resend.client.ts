import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import type { IEmailClient, EmailMessage, EmailSendResult } from "./interfaces/email.interface";

export class ResendEmailClient implements IEmailClient {
  private readonly client: Resend;
  private readonly fromEmail: string;

  constructor() {
    this.client = new Resend(env.RESEND_API_KEY);
    this.fromEmail = env.RESEND_FROM_EMAIL;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const result = await this.client.emails.send({
        from: this.fromEmail,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (result.error) {
        logger.error("Resend email failed", {
          to: message.to,
          error: result.error.message,
        });
        return { id: "", success: false };
      }

      logger.info("Email sent successfully via Resend", {
        to: message.to,
        id: result.data?.id,
      });

      return {
        id: result.data?.id || "",
        success: true,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("Resend email error", { to: message.to, error: errMsg });
      return { id: "", success: false };
    }
  }
}
