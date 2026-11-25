// Host view (contracts 1.3): "Next free table: 5 in ~6 min", the door queue and every table in
// the order a host seats guests (free, needs cleaning, then soonest to free). Refreshes on live
// table and queue events, and every 30 s.
import {
  Badge,
  Card,
  ConnectionBadge,
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatTile,
  TableStateChip,
  cn,
  hostTableStatus,
  longestSittingId,
  nextFreeText,
  queryKeys,
  useHostView,
  useNow,
  useSiteLive,
  useTranslation,
  type EdgeEvent,
} from '@rv/shared';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Hourglass, Timer } from 'lucide-react';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useFmt } from '../lib/useFmt';
import { useSiteMeta } from '../lib/useSiteMeta';

const REFRESH_ON: ReadonlySet<EdgeEvent['type']> = new Set([
  'table.state_changed',
  'table.session_closed',
  'queue.snapshot',
]);

export function HostPage() {
  const { siteId } = useParams();
  const { t } = useTranslation();
  const f = useFmt();
  const meta = useSiteMeta(siteId);
  const now = useNow();
  const qc = useQueryClient();
  const onEvent = useCallback(
    (e: EdgeEvent) => {
      if (siteId && REFRESH_ON.has(e.type))
        void qc.invalidateQueries({ queryKey: queryKeys.host(siteId) });
    },
    [qc, siteId],
  );
  const live = useSiteLive(siteId, { onEvent });
  const host = useHostView(siteId);
  const view = host.data;

  if (!siteId) return null;
  const longest = view ? longestSittingId(view.tables) : null;

  return (
    <>
      <PageHeader
        title={t('common:host.title')}
        subtitle={meta.name}
        actions={<ConnectionBadge status={live.connection.status} />}
      />
      {host.isLoading || !view ? (
        <LoadingBlock />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section
            aria-labelledby="next-free-title"
            className="rounded-xl border border-s-8 border-border border-s-success bg-surface p-5 shadow-card lg:col-span-2"
          >
            <h2 id="next-free-title" className="text-sm font-medium text-muted">
              {t('common:host.nextFree')}
            </h2>
            <p className="mt-1 text-3xl font-bold" data-testid="next-free" dir="auto">
              {nextFreeText(view, now, t)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{t('common:host.freeNow', { count: view.free_tables })}</span>
              {view.next_free && view.next_free.state !== 'needs_bussing' && (
                <Badge tone={view.next_free.confidence === 'high' ? 'success' : 'neutral'}>
                  {t(`common:confidence.${view.next_free.confidence}`)}
                </Badge>
              )}
            </p>
          </section>
          <StatTile
            label={t('common:host.queue')}
            icon={<DoorOpen className="h-5 w-5" />}
            value={t('common:host.queueValue', {
              people: view.queue.people,
              parties: view.queue.parties_est,
            })}
            hint={
              view.queue.people > 0
                ? t('common:host.longestWait', { duration: f.duration(view.queue.longest_wait_s) })
                : undefined
            }
            tone={view.queue.people > 0 ? 'warning' : 'default'}
          />
          <Card
            title={t('common:host.tables')}
            description={t('common:host.prediction')}
            className="lg:col-span-3"
          >
            {view.tables.length === 0 ? (
              <EmptyState title={t('host.noTables')} />
            ) : (
              <ol className="divide-y divide-border" aria-label={t('common:host.tables')}>
                {view.tables.map((table, i) => {
                  const isLongest = table.table_id === longest;
                  return (
                    <li
                      key={table.table_id}
                      data-testid={`host-row-${table.table_id}`}
                      className={cn(
                        'flex flex-wrap items-center gap-3 py-2.5',
                        isLongest && 'rounded-lg bg-warning-soft px-2',
                      )}
                    >
                      <span className="w-6 text-end text-xs text-muted rv-num">{i + 1}</span>
                      <span className="min-w-[7rem] font-semibold" dir="auto">
                        {t('common:table.name', { label: table.label })}
                      </span>
                      <span className="text-xs text-muted">
                        {t('common:table.seats', { count: table.seats })}
                      </span>
                      <TableStateChip state={table.state} size="sm" />
                      {table.seated_since !== null && (
                        <span className="flex items-center gap-1 text-sm text-muted">
                          <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                          {t('common:host.seatedFor', {
                            duration: f.duration(Math.max(0, now - table.seated_since)),
                          })}
                        </span>
                      )}
                      <span className="ms-auto flex items-center gap-2 text-sm font-medium">
                        {isLongest && (
                          <Badge tone="warning">
                            <Hourglass aria-hidden="true" className="h-3.5 w-3.5" />
                            {t('common:host.sittingLongest')}
                          </Badge>
                        )}
                        {hostTableStatus(table, now, t)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
