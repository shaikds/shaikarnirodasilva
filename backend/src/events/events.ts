import type { SupplierScore } from "@trendsupply/shared";

export interface TrendDetectedEvent {
  trendId: string;
  keyword: string;
  source: string;
  volume: number;
  growthRate: number;
}

export interface SupplierMatchedEvent {
  trendId: string;
  supplierId: string;
  matchScore: number;
}

export interface OutreachSentEvent {
  outreachId: string;
  supplierId: string;
  channel: string;
  sentAt: Date;
}

export interface OutreachRespondedEvent {
  outreachId: string;
  supplierId: string;
  respondedAt: Date;
}

export interface ReliabilityUpdatedEvent {
  supplierId: string;
  score: number;
  breakdown: SupplierScore;
}

export interface AppEvents {
  "trend:detected": TrendDetectedEvent;
  "supplier:matched": SupplierMatchedEvent;
  "outreach:sent": OutreachSentEvent;
  "outreach:responded": OutreachRespondedEvent;
  "reliability:updated": ReliabilityUpdatedEvent;
}

export type AppEventName = keyof AppEvents;
