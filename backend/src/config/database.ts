import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

let prisma: PrismaClient;

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { level: "error", emit: "event" },
      { level: "warn", emit: "event" },
    ],
  });

  client.$on("error", (e) => {
    logger.error("Prisma error", { message: e.message, target: e.target });
  });

  client.$on("warn", (e) => {
    logger.warn("Prisma warning", { message: e.message, target: e.target });
  });

  return client;
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info("Prisma client disconnected");
  }
}

export const db = getPrismaClient();
