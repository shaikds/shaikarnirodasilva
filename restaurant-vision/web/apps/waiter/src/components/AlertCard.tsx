import { Badge, Button, cn, useFormatters, useTranslation, type AlertView } from '@rv/shared';
import { BellRing, Hand, Users } from 'lucide-react';
import { alertTitle } from '../lib/alertText';

export function AlertCard({
  alert,
  now,
  onAck,
  pending,
  failed,
}: {
  alert: AlertView;
  now: number;
  onAck: (id: string) => void;
  pending: boolean;
  failed: boolean;
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
        <span
          aria-hidden="true"
          className={cn('mt-1', taken ? 'text-muted' : urgent ? 'text-danger' : 'text-warning')}
        >
          {alert.kind === 'long_queue' ? (
            <Users className="h-7 w-7" />
          ) : (
            <BellRing className="h-7 w-7" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-bold leading-tight">{title}</h3>
          <p className="text-base">{kind}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>
              {t('alerts.waiting')}{' '}
              <span className="rv-num font-semibold text-fg">{f.elapsed(age)}</span>
            </span>
            {urgent && !taken && <Badge tone="danger">{t('alerts.urgent')}</Badge>}
          </p>
        </div>
      </div>
      {taken ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-info-soft px-3 py-3 text-base font-medium text-info">
          <Hand aria-hidden="true" className="h-5 w-5" />
          {t('alerts.taken')}
          {alert.acked_at !== null && (
            <span className="text-sm font-normal">
              · {t('alerts.takenAgo', { time: f.relative(alert.acked_at, now) })}
            </span>
          )}
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
