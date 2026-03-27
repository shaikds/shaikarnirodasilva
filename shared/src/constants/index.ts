export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 60 * 1000,
    MAX_REQUESTS: 100,
  },
  AUTH: {
    WINDOW_MS: 60 * 1000,
    MAX_REQUESTS: 10,
  },
} as const;

export const JWT_DEFAULTS = {
  EXPIRES_IN: "7d",
} as const;

export const SCORING_WEIGHTS = {
  RATING: 0.3,
  REVIEWS: 0.2,
  RESPONSE_TIME: 0.2,
  VERIFIED: 0.15,
  CONSISTENCY: 0.15,
} as const;

export const QUEUE_NAMES = {
  TREND_SCRAPING: "trend-scraping",
  SUPPLIER_DISCOVERY: "supplier-discovery",
  EMAIL_OUTREACH: "email-outreach",
  RELIABILITY_SCORING: "reliability-scoring",
  DAILY_PIPELINE: "daily-pipeline",
} as const;

export const SCRAPER_TYPES = {
  REDDIT: "reddit",
  GOOGLE_TRENDS: "google-trends",
  ALIBABA: "alibaba",
  LOCAL: "local",
} as const;

export const OUTREACH_CHANNELS = {
  EMAIL: "EMAIL",
  WHATSAPP: "WHATSAPP",
} as const;

export const OUTREACH_STATUSES = {
  PENDING: "PENDING",
  SENT: "SENT",
  RESPONDED: "RESPONDED",
  FAILED: "FAILED",
} as const;
