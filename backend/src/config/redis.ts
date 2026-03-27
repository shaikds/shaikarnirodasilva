import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

let redisClient: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      retryStrategy(times: number): number | null {
        if (times > 10) {
          logger.error("Redis: max reconnection attempts reached");
          return null;
        }
        const delay = Math.min(times * 200, 5000);
        logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected");
    });

    redisClient.on("error", (err: Error) => {
      logger.error("Redis connection error", { error: err.message });
    });
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis client disconnected");
  }
}

export function getRedisConfig(): { host: string; port: number; password?: string } {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  };
}
