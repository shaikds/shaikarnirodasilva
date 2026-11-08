// Step 9: live test. The blurred snapshot refreshes every few seconds and the table zones are
// colored by the live table state from `WS /local/ws`, so the installer can sit down at a table
// and watch it turn "seated".
import {
  Button,
  Card,
  cn,
  ConnectionBadge,
  Switch,
  TABLE_STATE_STYLE,
  TableStateChip,
  useFormatters,
  useTranslation,
  type TableLive,
  type Zone,
} from '@rv/shared';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ServerErrors } from '../../components/ServerErrors';
import { ZoneCanvas, type ZoneLook } from '../../components/ZoneCanvas';
import { useEdgeNow, useLocalLive } from '../../live/useLocalLive';
import { useSnapshot } from '../../live/useSnapshot';
import type { StepProps } from './SetupLayout';
import { useSetup } from './setupState';

const AUTO_REFRESH_MS = 3000;

export function LiveStep(_: StepProps) {
  const { t } = useTranslation();
  const f = useFormatters();
  const ctx = useSetup();
  const config = ctx.config!;
  const live = useLocalLive();
  const now = useEdgeNow(live.clockOffsetS);
  const [cameraId, setCameraId] = useState(config.cameras[0]?.camera_id ?? '');
  const [auto, setAuto] = useState(true);
  const snapshot = useSnapshot(cameraId || null, { autoRefreshMs: auto ? AUTO_REFRESH_MS : undefined });
  const camera = config.cameras.find((c) => c.camera_id === cameraId);

  const liveTables = useMemo(
    () => new Map((live.data?.tables ?? []).map((tb) => [tb.table_id, tb])),
    [live.data],
  );
  const zones = config.zones.filter((z) => z.camera_id === cameraId);
  const shownTables = config.tables
    .filter((tb) => zones.some((z) => z.table_id === tb.table_id))
    .map((tb) => liveTables.get(tb.table_id))
    .filter((tb): tb is TableLive => !!tb);

  const look = (zone: Zone): ZoneLook | null => {
    if (zone.kind !== 'table' || !zone.table_id) return null;
    const tb = liveTables.get(zone.table_id);
    if (!tb) return null;
    const style = TABLE_STATE_STYLE[tb.state];
    return {
      stroke: style.stroke,
      fill: style.stroke,
      fillOpacity: tb.state === 'empty' ? 0.12 : 0.35,
      label: `${t('common:table.name', { label: tb.label })} · ${t(`common:tableState.${tb.state}`)}`,
      sublabel: t('common:table.guests', { count: tb.guest_count }),
    };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={t('zones.cameraTabs')} className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
            {config.cameras.map((c) => (
              <button
                key={c.camera_id}
                type="button"
                role="tab"
                aria-selected={c.camera_id === cameraId}
                onClick={() => setCameraId(c.camera_id)}
                className={cn(
                  'min-h-tap rounded-md px-3 text-sm font-medium',
                  c.camera_id === cameraId ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                <span dir="auto">{c.name}</span>
              </button>
            ))}
          </div>
          <ConnectionBadge status={live.status} className="ms-auto" />
        </div>
        <ZoneCanvas
          readOnly
          imageUrl={snapshot.url}
          imageAlt={t('live.alt', { name: camera?.name ?? cameraId })}
          loading={snapshot.loading && !snapshot.url}
          placeholder={snapshot.error ? <ServerErrors error={snapshot.error} title={t('snapshot.failed')} /> : undefined}
          zones={zones}
          tables={config.tables}
          look={look}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[14rem]">
            <Switch checked={auto} onChange={setAuto} label={t('live.autoRefresh')} />
          </div>
          <Button variant="secondary" size="sm" onClick={snapshot.refresh}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {t('snapshot.refresh')}
          </Button>
          {snapshot.takenAt && (
            <span className="text-xs text-muted">
              {t('live.updated', { time: new Date(snapshot.takenAt).toLocaleTimeString(f.lng === 'he' ? 'he-IL' : 'en-US') })}
            </span>
          )}
        </div>
        <p className="text-sm text-muted">{t('live.howTo')}</p>
      </div>

      <Card title={t('live.tablesTitle')} level={3} padded={false}>
        {shownTables.length === 0 ? (
          <p className="p-4 text-sm text-muted">{t('live.noTables')}</p>
        ) : (
          <ul className="divide-y divide-border" aria-live="polite">
            {shownTables.map((tb) => (
              <li key={tb.table_id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0">
                  <span className="block font-medium" dir="auto">
                    {t('common:table.name', { label: tb.label })}
                  </span>
                  <span className="text-xs text-muted">
                    {t('common:table.guests', { count: tb.guest_count })}
                    {tb.since_ts !== null && ` · ${t('common:table.since', { duration: f.duration(now - tb.since_ts) })}`}
                  </span>
                </span>
                <TableStateChip state={tb.state} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
