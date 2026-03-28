import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(""),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  REDDIT_CLIENT_ID: z.string().default(""),
  REDDIT_CLIENT_SECRET: z.string().default(""),
  REDDIT_USERNAME: z.string().default(""),
  REDDIT_PASSWORD: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_EMAIL: z.string().email().default("noreply@trendsupply.com"),
  GREENAPI_INSTANCE_ID: z.string().default(""),
  GREENAPI_API_TOKEN: z.string().default(""),
  SERPAPI_KEY: z.string().default(""),
  SCRAPE_CONCURRENCY: z.coerce.number().default(3),
  SCRAPE_REQUEST_TIMEOUT: z.coerce.number().default(30000),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.format();
    const message = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, val]) => {
        const errors = (val as { _errors?: string[] })._errors;
        return `  ${key}: ${errors?.join(", ") ?? "invalid"}`;
      })
      .join("\n");
    throw new Error(`Environment validation failed:\n${message}`);
  }
  return parsed.data;
}

export const env = loadEnv();
