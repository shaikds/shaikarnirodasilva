import type { AlertView } from '@rv/shared';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Table 12" for table alerts, "Entrance" for queue alerts, "Table 12 freed – needs cleaning"
 * for `table_freed` (1.3). */
export function alertTitle(alert: AlertView, t: T): string {
  if (alert.kind === 'table_freed' && alert.table_label)
    return t('common:tableFreed', { label: alert.table_label });
  return alert.table_label
    ? t('common:table.name', { label: alert.table_label })
    : t('alerts.entrance');
}
