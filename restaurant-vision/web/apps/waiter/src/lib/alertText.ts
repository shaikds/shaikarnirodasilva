import type { AlertView } from '@rv/shared';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Table 12" for table alerts, "Entrance" for queue alerts. */
export function alertTitle(alert: AlertView, t: T): string {
  return alert.table_label ? t('common:table.name', { label: alert.table_label }) : t('alerts.entrance');
}
