import {
  Card,
  ConnectionBadge,
  EmptyState,
  LoadingBlock,
  PageHeader,
  cn,
  isDeviceOnline,
  safeGetItem,
  safeSetItem,
  useNow,
  useSiteConfig,
  useSiteLive,
  useTranslation,
} from '@rv/shared';
import { LayoutGrid, List, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FloorLegend, FloorList, FloorPlan, layoutTables } from '../components/FloorPlan';
import { AlertsPanel, DevicesPanel, OccupancyPanel, QueuePanel } from '../components/LivePanels';
import { useSiteMeta } from '../lib/useSiteMeta';

type View = 'plan' | 'list';
const VIEW_KEY = 'rv-dashboard-floor-view';

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const { t } = useTranslation();
  const options: { v: View; label: string; Icon: typeof List }[] = [
    { v: 'plan', label: t('live.planView'), Icon: LayoutGrid },
    { v: 'list', label: t('live.listView'), Icon: List },
  ];
  return (
    <div role="group" aria-label={t('live.viewLabel')} className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-sm font-medium',
            value === v ? 'bg-primary text-primary-fg' : 'hover:bg-surface-2',
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function SiteLivePage() {
  const { siteId } = useParams();
  const { t } = useTranslation();
  const now = useNow();
  const meta = useSiteMeta(siteId);
  const config = useSiteConfig(siteId);
  const live = useSiteLive(siteId);
  const [view, setView] = useState<View>(() => (safeGetItem(VIEW_KEY) === 'list' ? 'list' : 'plan'));
  const changeView = (v: View) => {
    setView(v);
    safeSetItem(VIEW_KEY, v);
  };

  const cameraNames = useMemo(
    () => new Map((config.data?.cameras ?? []).map((c) => [c.camera_id, c.name])),
    [config.data],
  );

  if (live.isLoading) return <LoadingBlock />;
  if (!live.data) {
    return <EmptyState title={t('common:errors.generic')} />;
  }
  const data = live.data;
  const plan = meta.settings?.floor_plan ?? [];
  const { unplacedCount } = layoutTables(data.tables, plan);
  const edgeOnline = data.devices.some((d) => isDeviceOnline(d, now));

  return (
    <>
      <PageHeader
        title={t('live.title')}
        subtitle={meta.name}
        actions={
          <>
            <ConnectionBadge status={live.connection.status} />
            <ViewToggle value={view} onChange={changeView} />
          </>
        }
      />
      {!edgeOnline && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {t('live.stale')}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title={t('live.floorPlan')} className="min-w-0">
          {data.tables.length === 0 ? (
            <EmptyState title={t('live.noTables')} description={t('live.noTablesBody')} />
          ) : view === 'plan' ? (
            <>
              <FloorPlan tables={data.tables} layout={plan} now={now} siteName={meta.name} />
              <FloorLegend />
              {unplacedCount > 0 && <p className="mt-2 text-xs text-muted">{t('live.unplaced', { count: unplacedCount })}</p>}
            </>
          ) : (
            <FloorList tables={data.tables} now={now} />
          )}
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <AlertsPanel live={data} now={now} />
          <OccupancyPanel live={data} now={now} />
          <QueuePanel live={data} />
          <DevicesPanel live={data} now={now} cameraNames={cameraNames} />
        </div>
      </div>
    </>
  );
}
