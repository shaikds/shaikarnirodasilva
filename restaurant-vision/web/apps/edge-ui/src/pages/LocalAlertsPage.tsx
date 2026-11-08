// Offline waiter mode (`/local-alerts`): open alerts straight from the edge over the restaurant
// Wi-Fi, no login. Big "On it" buttons, sound + vibration on new alerts. Acks carry no identity.
import {
  Badge,
  Button,
  cn,
  ConnectionBadge,
  EmptyState,
  isApiError,
  LanguageSwitcher,
  LoadingBlock,
  safeGetItem,
  safeSetItem,
  Switch,
  ThemeToggle,
  useFormatters,
  useTranslation,
  type AlertView,
  type LiveSnapshot,
} from '@rv/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CircleCheck, Hand, Users, Volume2, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocalApi } from '../api/context';
import { Logo } from '../components/Logo';
import { alertTitle, freshAlerts, sortAlerts } from '../lib/alerts';
import { audioLocked, installAudioUnlock, playBeep, vibrate } from '../lib/sound';
import { LOCAL_STATE_KEY, useEdgeNow, useLocalLive } from '../live/useLocalLive';

const SOUND_KEY = 'rv-edge-alert-sound';

function useAudioReady(): boolean {
  const [ready, setReady] = useState(() => !audioLocked());
  useEffect(() => installAudioUnlock(() => setReady(true)), []);
  return ready;
}

/** Sound, vibration and a screen-reader message for alerts that appear after the first load. */
function useNewAlertCues(alerts: AlertView[] | undefined, soundOn: boolean): string {
  const { t } = useTranslation();
  const seen = useRef<Set<string> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!alerts) return;
    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a.alert_id));
      return;
    }
    const fresh = freshAlerts(seen.current, alerts);
    alerts.forEach((a) => seen.current!.add(a.alert_id));
    if (fresh.length === 0) return;
    const urgent = fresh.some((a) => a.severity === 'urgent');
    if (soundOn) playBeep(urgent);
    vibrate(urgent);
    const latest = fresh[fresh.length - 1]!;
    setAnnouncement(
      t('alerts.newAlert', { what: `${alertTitle(latest, t)} · ${t(`common:alertKind.${latest.kind}`)}` }),
    );
  }, [alerts, soundOn, t]);
  return announcement;
}

export function LocalAlertsPage() {
  const { t } = useTranslation();
  const api = useLocalApi();
  const qc = useQueryClient();
  const live = useLocalLive();
  const now = useEdgeNow(live.clockOffsetS);
  const [soundOn, setSoundOn] = useState(() => safeGetItem(SOUND_KEY) !== '0');
  const audioReady = useAudioReady();
  const announcement = useNewAlertCues(live.data?.open_alerts, soundOn);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = t('alerts.documentTitle');
    return () => {
      document.title = previous;
    };
  }, [t]);

  const ack = useMutation({
    mutationFn: (alertId: string) => api.ackAlert(alertId),
    onMutate: () => setFailedId(null),
    onSuccess: (view) => {
      qc.setQueryData<LiveSnapshot>(LOCAL_STATE_KEY, (old) =>
        old
          ? {
              ...old,
              open_alerts: old.open_alerts.map((a) => (a.alert_id === view.alert_id ? view : a)),
            }
          : old,
      );
    },
    onError: (err, alertId) => {
      if (isApiError(err) && err.status === 404) {
        // Already resolved on the edge (someone got there first): drop it.
        qc.setQueryData<LiveSnapshot>(LOCAL_STATE_KEY, (old) =>
          old ? { ...old, open_alerts: old.open_alerts.filter((a) => a.alert_id !== alertId) } : old,
        );
        return;
      }
      setFailedId(alertId);
    },
  });

  const { open, taken } = sortAlerts(live.data?.open_alerts ?? []);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#alerts-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        {t('common:nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-3">
          <Logo />
          <span className="min-w-0 truncate font-semibold">{t('alerts.appTitle')}</span>
          <div className="ms-auto flex items-center gap-1">
            <ConnectionBadge status={live.status} className="hidden sm:inline-flex" />
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div
          role="note"
          aria-label={t('alerts.offlineTitle')}
          className="border-t border-info/30 bg-info-soft px-3 py-2 text-info"
        >
          <div className="mx-auto flex max-w-2xl items-start gap-2">
            <Wifi aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('alerts.offlineTitle')}</p>
              <p className="text-xs text-fg">{t('alerts.offlineBody')}</p>
            </div>
            <ConnectionBadge status={live.status} className="ms-auto shrink-0 sm:hidden" />
          </div>
        </div>
      </header>

      <main id="alerts-main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-3 py-4 focus:outline-none">
        <p aria-live="assertive" className="sr-only">
          {announcement}
        </p>
        {soundOn && (
          // The row keeps its place once sound is unlocked: the first tap (often "On it") unlocks
          // audio, and removing the row mid-tap would move the button away from the finger.
          <p
            className={cn(
              'mb-3 flex min-h-[2.5rem] items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              audioReady ? 'border-success/30 bg-success-soft text-success' : 'border-warning/40 bg-warning-soft text-warning',
            )}
          >
            <Volume2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            {audioReady ? t('alerts.soundOn') : t('alerts.enableSound')}
          </p>
        )}
        {live.isError && !live.data && (
          <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {t('alerts.unreachable')}
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
        ) : open.length === 0 ? (
          <EmptyState
            icon={<CircleCheck className="h-12 w-12 text-success" />}
            title={t('alerts.none')}
            description={t('alerts.noneBody')}
          />
        ) : (
          <ul className="flex flex-col gap-3" aria-label={t('alerts.title')}>
            {open.map((a) => (
              <li key={a.alert_id}>
                <AlertCard
                  alert={a}
                  now={now}
                  pending={ack.isPending && ack.variables === a.alert_id}
                  failed={failedId === a.alert_id}
                  onAck={(id) => ack.mutate(id)}
                />
              </li>
            ))}
          </ul>
        )}
        {taken.length > 0 && (
          <section aria-labelledby="taken-title" className="mt-6">
            <h2 id="taken-title" className="mb-2 text-base font-semibold text-muted">
              {t('alerts.inProgress')}
            </h2>
            <ul className="flex flex-col gap-3">
              {taken.map((a) => (
                <li key={a.alert_id}>
                  <AlertCard alert={a} now={now} pending={false} failed={false} onAck={() => undefined} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 rounded-xl border border-border bg-surface px-3">
          <Switch
            checked={soundOn}
            onChange={(v) => {
              setSoundOn(v);
              safeSetItem(SOUND_KEY, v ? '1' : '0');
              if (v) playBeep();
            }}
            label={t('alerts.sound')}
            description={t('alerts.soundHint')}
          />
        </div>
        <p className="mt-6 text-center text-xs text-muted">{t('alerts.privacy')}</p>
      </main>
    </div>
  );
}

function AlertCard({
  alert,
  now,
  pending,
  failed,
  onAck,
}: {
  alert: AlertView;
  now: number;
  pending: boolean;
  failed: boolean;
  onAck: (id: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormatters();
  const title = alertTitle(alert, t);
  const kind = t(`common:alertKind.${alert.kind}`);
  const age = Math.max(0, now - alert.raised_at);
  const taken = alert.status === 'acknowledged';
  const urgent = alert.severity === 'urgent';
  return (
    <article
      aria-label={`${title}, ${kind}, ${t('alerts.waitingAria', { duration: f.duration(age) })}`}
      data-alert-id={alert.alert_id}
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-card',
        taken
          ? 'border-border opacity-80'
          : urgent
            ? 'border-s-8 border-danger border-s-danger'
            : 'border-s-8 border-warning/60 border-s-warning',
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn('mt-1', taken ? 'text-muted' : urgent ? 'text-danger' : 'text-warning')}>
          {alert.kind === 'long_queue' ? <Users className="h-7 w-7" /> : <BellRing className="h-7 w-7" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-bold leading-tight" dir="auto">
            {title}
          </h3>
          <p className="text-base">{kind}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>
              {t('alerts.waiting')} <span className="rv-num font-semibold text-fg">{f.elapsed(age)}</span>
            </span>
            {urgent && !taken && <Badge tone="danger">{t('alerts.urgent')}</Badge>}
          </p>
        </div>
      </div>
      {taken ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-info-soft px-3 py-3 text-base font-medium text-info">
          <Hand aria-hidden="true" className="h-5 w-5" />
          {t('common:alertStatus.acknowledged')}
        </p>
      ) : (
        <Button
          size="xl"
          block
          className="mt-3"
          loading={pending}
          onClick={() => onAck(alert.alert_id)}
          aria-label={t('alerts.onItFor', { what: `${title} · ${kind}` })}
        >
          {t('alerts.onIt')}
        </Button>
      )}
      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('alerts.ackFailed')}
        </p>
      )}
    </article>
  );
}
