// Builds the notification for an alert, in the page (local notifications) and in the service
// worker (Web Push). The push body is an `AlertPush` (contracts 1.1: `{alert_id, site_id, kind,
// severity, table_label, raised_at, condition_since_ts}`); an AlertView or `{alert: AlertView}`
// works too. Plain data only (runs in the SW); unknown or missing fields degrade gracefully.
import type { AlertPush } from '@rv/shared/contracts';
import { commonEn, commonHe } from '@rv/shared/i18n/resources';
import { waiterEn } from '../locales/en';
import { waiterHe } from '../locales/he';

/** A parsed push body: the `AlertPush` fields that were present and well-typed. */
export type AlertPushPayload = Partial<Omit<AlertPush, 'kind' | 'severity'>> & {
  kind?: string;
  severity?: string;
};

export interface BuiltNotification {
  title: string;
  options: NotificationOptions & { renotify?: boolean; vibrate?: number[]; timestamp?: number };
}

const STRINGS = {
  he: { common: commonHe, waiter: waiterHe, dir: 'rtl' as const },
  en: { common: commonEn, waiter: waiterEn, dir: 'ltr' as const },
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

export function normalizePayload(data: unknown): AlertPushPayload {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const inner = (d.alert && typeof d.alert === 'object' ? d.alert : d) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    alert_id: str(inner.alert_id),
    site_id: str(inner.site_id),
    kind: str(inner.kind),
    severity: str(inner.severity),
    table_label: str(inner.table_label) ?? null,
    raised_at: num(inner.raised_at),
    condition_since_ts: num(inner.condition_since_ts) ?? null,
  };
}

/** When the guests started waiting (epoch ms), for the notification timestamp. */
function waitingSinceMs(payload: AlertPushPayload): number | undefined {
  const since = payload.condition_since_ts ?? payload.raised_at;
  return since === undefined || since === null ? undefined : since * 1000;
}

export function buildNotification(
  payload: AlertPushPayload,
  lang: 'he' | 'en',
  iconUrl = '/icon.svg',
): BuiltNotification {
  const s = STRINGS[lang];
  const kinds = s.common.alertKind as Record<string, string>;
  const kind = payload.kind ? (kinds[payload.kind] ?? payload.kind) : null;
  const target = payload.table_label
    ? fill(s.common.table.name, { label: payload.table_label })
    : payload.kind === 'long_queue'
      ? s.waiter.alerts.entrance
      : null;
  const title =
    kind && target
      ? fill(s.waiter.push.title, { target, kind })
      : (kind ?? s.waiter.push.fallbackTitle);
  const urgent = payload.severity === 'urgent';
  const timestamp = waitingSinceMs(payload);
  return {
    title,
    options: {
      // Shown as the notification's time by most platforms: when the guests sat down.
      ...(timestamp !== undefined ? { timestamp } : {}),
      body: urgent ? s.waiter.push.bodyUrgent : s.waiter.push.body,
      tag: payload.alert_id ?? 'rv-alert',
      renotify: true,
      requireInteraction: urgent,
      icon: iconUrl,
      badge: iconUrl,
      lang,
      dir: s.dir,
      vibrate: urgent ? [220, 120, 220, 120, 320] : [220, 120, 220],
      data: { url: '/', alert_id: payload.alert_id ?? null, site_id: payload.site_id ?? null },
    },
  };
}
