import {
  EmptyState,
  LoadingBlock,
  useAckAlert,
  useNow,
  useSiteLive,
  useTranslation,
} from '@rv/shared';
import { CircleCheck, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCard } from '../components/AlertCard';
import { OfflineBanner } from '../components/OfflineBanner';
import { Shell } from '../components/Shell';
import { useOffline } from '../lib/offline';
import { useWaiterSettings } from '../lib/settings';
import { sortAlertsForWaiter } from '../lib/sortAlerts';
import { audioLocked, installAudioUnlock } from '../lib/sound';
import { useNewAlerts } from '../lib/useNewAlerts';
import { useWaiterSite } from '../lib/useSite';

function useAudioReady(): boolean {
  const [ready, setReady] = useState(() => !audioLocked());
  useEffect(() => installAudioUnlock(() => setReady(true)), []);
  return ready;
}

export function AlertsPage() {
  const { t } = useTranslation();
  const { me, site } = useWaiterSite();
  const siteId = site?.site_id;
  const now = useNow();
  const live = useSiteLive(siteId);
  const ack = useAckAlert(siteId ?? '');
  const [failedId, setFailedId] = useState<string | null>(null);
  const offline = useOffline(siteId ? live.connection : undefined);
  const edgeUrl = useWaiterSettings((s) => s.edgeUrl);
  const soundOn = useWaiterSettings((s) => s.sound);
  const audioReady = useAudioReady();
  const announcement = useNewAlerts(live.data?.open_alerts, siteId);

  if (me.isLoading) return <LoadingBlock />;
  if (!site) return <Navigate to="/sites" replace />;

  const { open, taken } = sortAlertsForWaiter(live.data?.open_alerts ?? []);
  const onAck = (id: string) => {
    setFailedId(null);
    ack.mutate(id, { onError: () => setFailedId(id) });
  };

  return (
    <Shell
      title={site.name}
      status={live.connection.status}
      banner={offline ? <OfflineBanner edgeUrl={edgeUrl} /> : null}
    >
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>
      {soundOn && !audioReady && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
          <Volume2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t('alerts.enableSound')}
        </p>
      )}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('alerts.title')}</h1>
        {open.length > 0 && (
          <span className="text-sm text-muted">{t('alerts.count', { count: open.length })}</span>
        )}
      </div>
      {live.isLoading ? (
        <LoadingBlock />
      ) : open.length === 0 && taken.length === 0 ? (
        <EmptyState
          icon={<CircleCheck className="h-12 w-12 text-success" />}
          title={t('alerts.none')}
          description={t('alerts.noneBody')}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3" aria-label={t('alerts.title')}>
            {open.map((a) => (
              <li key={a.alert_id}>
                <AlertCard
                  alert={a}
                  now={now}
                  onAck={onAck}
                  pending={ack.isPending && ack.variables === a.alert_id}
                  failed={failedId === a.alert_id}
                />
              </li>
            ))}
          </ul>
          {taken.length > 0 && (
            <section aria-labelledby="taken-title" className="mt-6">
              <h2 id="taken-title" className="mb-2 text-base font-semibold text-muted">
                {t('alerts.inProgress')}
              </h2>
              <ul className="flex flex-col gap-3">
                {taken.map((a) => (
                  <li key={a.alert_id}>
                    <AlertCard alert={a} now={now} onAck={onAck} pending={false} failed={false} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="mt-8 text-center text-xs text-muted">{t('settings.privacy')}</p>
    </Shell>
  );
}
