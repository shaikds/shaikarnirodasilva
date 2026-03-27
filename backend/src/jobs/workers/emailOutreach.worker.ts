import { Worker, Job } from "bullmq";
import { getRedisConfig } from "../../config/redis";
import { QUEUE_NAMES } from "@trendsupply/shared";
import { db } from "../../config/database";
import { ResendEmailClient } from "../../integrations/resend.client";
import { eventBus } from "../../events/eventBus";
import { logger } from "../../utils/logger";

interface EmailOutreachJobData {
  supplierId: string;
  subject: string;
  htmlBody: string;
  trendKeyword: string;
}

export function createEmailOutreachWorker(): Worker {
  const connection = getRedisConfig();
  const emailClient = new ResendEmailClient();

  const worker = new Worker(
    QUEUE_NAMES.EMAIL_OUTREACH,
    async (job: Job<EmailOutreachJobData>) => {
      const { supplierId, subject, htmlBody } = job.data;
      logger.info("Processing email outreach job", { jobId: job.id, supplierId });

      const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) {
        throw new Error(`Supplier not found: ${supplierId}`);
      }

      if (!supplier.contactEmail) {
        logger.warn("Supplier has no contact email, skipping outreach", { supplierId });
        return { status: "skipped", reason: "no_email" };
      }

      const outreach = await db.outreach.create({
        data: {
          supplierId,
          channel: "EMAIL",
          status: "PENDING",
        },
      });

      try {
        const result = await emailClient.send({
          to: supplier.contactEmail,
          subject,
          html: htmlBody,
        });

        if (result.success) {
          await db.outreach.update({
            where: { id: outreach.id },
            data: { status: "SENT", sentAt: new Date() },
          });

          eventBus.emit("outreach:sent", {
            outreachId: outreach.id,
            supplierId,
            channel: "EMAIL",
            sentAt: new Date(),
          });

          logger.info("Email outreach sent successfully", {
            outreachId: outreach.id,
            supplierId,
            email: supplier.contactEmail,
          });

          return { status: "sent", outreachId: outreach.id };
        } else {
          await db.outreach.update({
            where: { id: outreach.id },
            data: { status: "FAILED" },
          });

          return { status: "failed", outreachId: outreach.id };
        }
      } catch (err) {
        await db.outreach.update({
          where: { id: outreach.id },
          data: { status: "FAILED" },
        });

        throw err;
      }
    },
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000,
      },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(`Email outreach job failed: ${job?.id}`, { error: err.message });
  });

  return worker;
}
