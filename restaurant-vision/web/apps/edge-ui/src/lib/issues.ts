// Validation issues in plain language, naming the camera / table / zone they concern.
import type { SiteConfig } from '@rv/shared';
import type { Issue } from './validation';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Table 4", "camera Dining room", "zone Table 4 (Dining room)". */
export function entityName(issue: Issue, config: SiteConfig | null, t: T): string {
  if (!config) return issue.id;
  switch (issue.entity) {
    case 'site':
      return t('validation.entity.site');
    case 'camera': {
      const cam = config.cameras.find((c) => c.camera_id === issue.id);
      return t('validation.entity.camera', { name: cam?.name || issue.id });
    }
    case 'table': {
      const tb = config.tables.find((x) => x.table_id === issue.id);
      return t('common:table.name', { label: tb?.label || issue.id });
    }
    case 'zone': {
      const z = config.zones.find((x) => x.zone_id === issue.id);
      if (!z) return t('validation.entity.zone', { name: issue.id });
      const cam = config.cameras.find((c) => c.camera_id === z.camera_id)?.name ?? z.camera_id;
      const tb = z.table_id ? config.tables.find((x) => x.table_id === z.table_id)?.label : null;
      const what = tb ? t('common:table.name', { label: tb }) : t(`zoneKind.${z.kind}`);
      return t('validation.entity.zoneOn', { what, camera: cam });
    }
  }
}

export function issueMessage(issue: Issue, config: SiteConfig | null, t: T): string {
  return t(`validation.${issue.code}`, {
    ...issue.params,
    field: issue.params?.field ? t(`validation.field.${issue.params.field}`) : undefined,
    name: entityName(issue, config, t),
  });
}
