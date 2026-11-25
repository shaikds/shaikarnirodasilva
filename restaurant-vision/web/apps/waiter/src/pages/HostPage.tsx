import {
  cn,
  hostTableStatus,
  longestSittingId,
  LoadingBlock,
  nextFreeText,
  useFormatters,
  useHostView,
  useNow,
  useTranslation,
} from '@rv/shared';
import { DoorOpen, Hourglass } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { useWaiterSite } from '../lib/useSite';

/** Compact host screen (1.3): next table to free, the door queue and the table order. */
export function HostPage() {
  const { t } = useTranslation();
  const f = useFormatters();
  const { me, site } = useWaiterSite();
  const now = useNow();
  // Waiters get alert events only, so the host view is polled.
  const host = useHostView(site?.site_id, { refetchInterval: 15_000 });

  if (me.isLoading) return <LoadingBlock />;
  if (!site) return <Navigate to="/sites" replace />;
  const view = host.data;
  const longest = view ? longestSittingId(view.tables) : null;

  return (
    <Shell title={site.name}>
      <h1 className="mb-3 text-xl font-semibold">{t('common:host.title')}</h1>
      {!view ? (
        <LoadingBlock />
      ) : (
        <>
          <section
            aria-label={t('common:host.nextFree')}
            className="mb-3 rounded-2xl border border-s-8 border-success/60 border-s-success bg-surface p-4 shadow-card"
          >
            <p className="text-sm text-muted">{t('common:host.nextFree')}</p>
            <p className="text-2xl font-bold" data-testid="next-free" dir="auto">
              {nextFreeText(view, now, t)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t('common:host.freeNow', { count: view.free_tables })}
            </p>
          </section>
          <p className="mb-4 flex items-center gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
            <DoorOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>
              {t('common:host.queue')}:{' '}
              {t('common:host.queueValue', {
                people: view.queue.people,
                parties: view.queue.parties_est,
              })}
              {view.queue.people > 0 &&
                ` · ${t('common:host.longestWait', { duration: f.duration(view.queue.longest_wait_s) })}`}
            </span>
          </p>
          <h2 className="mb-2 text-base font-semibold">{t('common:host.tables')}</h2>
          <ul className="flex flex-col gap-2" aria-label={t('common:host.tables')}>
            {view.tables.map((table) => (
              <li
                key={table.table_id}
                data-testid={`host-row-${table.table_id}`}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-2',
                  table.table_id === longest ? 'border-warning' : 'border-border',
                )}
              >
                <span className="font-semibold" dir="auto">
                  {t('common:table.name', { label: table.label })}
                  <span className="ms-2 text-xs font-normal text-muted">
                    {t('common:table.seats', { count: table.seats })}
                  </span>
                </span>
                <span className="text-end text-sm">
                  {hostTableStatus(table, now, t)}
                  {table.table_id === longest && (
                    <span className="ms-2 inline-flex items-center gap-1 text-xs font-semibold text-warning">
                      <Hourglass aria-hidden="true" className="h-3 w-3" />
                      {t('common:host.sittingLongest')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">{t('common:host.prediction')}</p>
        </>
      )}
    </Shell>
  );
}
