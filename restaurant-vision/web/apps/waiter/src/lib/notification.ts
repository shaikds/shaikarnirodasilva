// Builds the notification for an alert, in the page (local notifications) and in the service
// worker (Web Push). Accepts an AlertView, `{alert: AlertView}`, or a minimal
// `{alert_id, kind, table_label?, severity?}` payload. Plain data only (runs in the SW).
import { commonEn, commonHe } from '@rv/shared/i18n/resources';
import { waiterEn } from '../locales/en';
import { waiterHe } from '../locales/he';

export interface AlertPushPayload {
  alert_id?: string;
  kind?: string;
  table_label?: string | null;
  severity?: string;
  site_id?: string;
}

export interface BuiltNotification {
  title: string;
  options: NotificationOptions & { renotify?: boolean; vibrate?: number[] };
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
  return {
    alert_id: str(inner.alert_id),
    kind: str(inner.kind),
    table_label: str(inner.table_label) ?? null,
    severity: str(inner.severity),
    site_id: str(inner.site_id),
  };
}

export function buildNotification(payload: AlertPushPayload, lang: 'he' | 'en', iconUrl = '/icon.svg'): BuiltNotification {
  const s = STRINGS[lang];
  const kinds = s.common.alertKind as Record<string, string>;
  const kind = payload.kind ? (kinds[payload.kind] ?? payload.kind) : null;
  const target = payload.table_label
    ? fill(s.common.table.name, { label: payload.table_label })
    : payload.kind === 'long_queue'
      ? s.waiter.alerts.entrance
      : null;
  const title = kind && target ? fill(s.waiter.push.title, { target, kind }) : (kind ?? s.waiter.push.fallbackTitle);
  const urgent = payload.severity === 'urgent';
  return {
    title,
    options: {
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
