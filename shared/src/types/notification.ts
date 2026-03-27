export enum NotificationType {
  TREND_DETECTED = "TREND_DETECTED",
  SUPPLIER_MATCHED = "SUPPLIER_MATCHED",
  OUTREACH_SENT = "OUTREACH_SENT",
  OUTREACH_RESPONDED = "OUTREACH_RESPONDED",
  RELIABILITY_UPDATED = "RELIABILITY_UPDATED",
  SYSTEM_ALERT = "SYSTEM_ALERT",
}

export interface INotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}
