import {
  Badge,
  Button,
  Card,
  isDeviceOnline,
  useAckAlert,
  useTranslation,
  type AlertView,
  type CameraHealth,
  type DeviceStatus,
  type LiveSnapshot,
} from '@rv/shared';
import { BellRing, Camera, CircleAlert, CircleCheck, CircleOff, Cpu, Hand } from 'lucide-react';
import { useFmt } from '../lib/useFmt';

export function OccupancyPanel({ live, now }: { live: LiveSnapshot; now: number }) {
  const { t } = useTranslation();
  const f = useFmt();
  const o = live.occupancy;
  return (
    <Card title={t('live.occupancy.title')} level={2}>
      {o ? (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-muted">{t('live.occupancy.guests')}</dt>
              <dd className="text-2xl font-semibold">{f.number(o.guests)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('live.occupancy.tables')}</dt>
              <dd className="text-2xl font-semibold">
                <span className="rv-num">
                  {f.number(o.tables_occupied)}/{f.number(o.tables_total)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('live.occupancy.staff')}</dt>
              <dd className="text-2xl font-semibold">{f.number(o.staff_on_floor)}</dd>
            </div>
          </dl>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label={t('live.occupancy.tables')}
            aria-valuemin={0}
            aria-valuemax={o.tables_total}
            aria-valuenow={o.tables_occupied}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${o.tables_total ? (100 * o.tables_occupied) / o.tables_total : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">{t('live.occupancy.updated', { time: f.relative(o.ts, now) })}</p>
        </>
      ) : (
        <p className="text-sm text-muted">{t('live.occupancy.none')}</p>
      )}
    </Card>
  );
}

export function QueuePanel({ live }: { live: LiveSnapshot }) {
  const { t } = useTranslation();
  const f = useFmt();
  return (
    <Card title={t('live.queue.title')} level={2}>
      {live.queues.length === 0 ? (
        <p className="text-sm text-muted">{t('live.queue.none')}</p>
      ) : (
        live.queues.map((q) => (
          <dl key={q.zone_id} className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted">{t('live.queue.people')}</dt>
              <dd className="text-2xl font-semibold">{f.number(q.people)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('live.queue.parties')}</dt>
              <dd className="text-2xl font-semibold">{f.number(q.parties_est)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('live.queue.longest')}</dt>
              <dd className="text-lg font-semibold">{f.dur(q.longest_wait_s)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('live.queue.avg')}</dt>
              <dd className="text-lg font-semibold">{f.dur(q.avg_wait_s)}</dd>
            </div>
          </dl>
        ))
      )}
    </Card>
  );
}

function alertTarget(a: AlertView, t: (k: string, o?: Record<string, unknown>) => string): string {
  return a.table_label ? t('common:table.name', { label: a.table_label }) : t('live.alerts.entrance');
}

function AlertRow({ alert, siteId, now }: { alert: AlertView; siteId: string; now: number }) {
  const { t } = useTranslation();
  const f = useFmt();
  const ack = useAckAlert(siteId);
  const what = `${alertTarget(alert, t)} · ${t(`common:alertKind.${alert.kind}`)}`;
  const acked = alert.status === 'acknowledged';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={acked ? 'text-muted' : alert.severity === 'urgent' ? 'text-danger' : 'text-warning'}
      >
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{what}</p>
        <p className="text-xs text-muted">
          {t('live.alerts.age', { elapsed: f.elapsed(now - alert.raised_at) })}
          {alert.severity === 'urgent' && ` · ${t('common:severity.urgent')}`}
        </p>
      </div>
      {acked ? (
        <Badge tone="info">
          <Hand aria-hidden="true" className="h-3.5 w-3.5" />
          {t('live.alerts.acked')}
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="primary"
          loading={ack.isPending}
          onClick={() => ack.mutate(alert.alert_id)}
          aria-label={t('live.alerts.ackFor', { what })}
        >
          {t('live.alerts.ack')}
        </Button>
      )}
      {ack.isError && (
        <span role="alert" className="sr-only">
          {t('live.alerts.ackFailed')}
        </span>
      )}
    </li>
  );
}

export function AlertsPanel({ live, now }: { live: LiveSnapshot; now: number }) {
  const { t } = useTranslation();
  const alerts = [...live.open_alerts].sort((a, b) => a.raised_at - b.raised_at);
  return (
    <Card
      title={t('live.alerts.title')}
      level={2}
      actions={alerts.length > 0 ? <Badge tone="warning">{alerts.length}</Badge> : undefined}
    >
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CircleCheck aria-hidden="true" className="h-4 w-4 text-success" />
          {t('live.alerts.none')}
        </p>
      ) : (
        <ul className="-my-2 divide-y divide-border" aria-live="polite">
          {alerts.map((a) => (
            <AlertRow key={a.alert_id} alert={a} siteId={live.site_id} now={now} />
          ))}
        </ul>
      )}
    </Card>
  );
}

const CAMERA_ICON = { ok: CircleCheck, degraded: CircleAlert, offline: CircleOff };
const CAMERA_TONE = { ok: 'success', degraded: 'warning', offline: 'danger' } as const;

function CameraRow({ camera, name }: { camera: CameraHealth; name: string }) {
  const { t } = useTranslation();
  const f = useFmt();
  const Icon = CAMERA_ICON[camera.status];
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <Camera aria-hidden="true" className="h-4 w-4 text-muted" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {camera.status !== 'offline' && (
        <span className="text-xs text-muted">{t('live.devices.fps', { fps: f.number(camera.fps, 1) })}</span>
      )}
      <Badge tone={CAMERA_TONE[camera.status]}>
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {t(`common:camera.${camera.status}`)}
      </Badge>
    </li>
  );
}

function DeviceBlock({ device, now, cameraNames }: { device: DeviceStatus; now: number; cameraNames: Map<string, string> }) {
  const { t } = useTranslation();
  const f = useFmt();
  const online = isDeviceOnline(device, now);
  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Cpu aria-hidden="true" className="h-4 w-4 text-muted" />
        <span className="text-sm font-semibold" dir="ltr">
          {device.device_id}
        </span>
        <Badge tone={online ? 'success' : 'danger'} className="ms-auto">
          {online ? t('common:device.online') : t('common:device.offline')}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {device.last_seen_at === null ? t('live.devices.never') : t('live.devices.lastSeen', { time: f.relative(device.last_seen_at, now) })}
        {device.version && ` · ${t('live.devices.version', { version: device.version })}`}
      </p>
      {online && (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted">{t('live.devices.cpu')}</dt>
            <dd className="font-medium">{device.cpu_pct === null ? f.none : `${f.number(device.cpu_pct)}%`}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('live.devices.mem')}</dt>
            <dd className="font-medium">{device.mem_mb === null ? f.none : `${f.number(device.mem_mb)} MB`}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('live.devices.outbox')}</dt>
            <dd className="font-medium">{f.num(device.outbox_depth)}</dd>
          </div>
        </dl>
      )}
      {device.cameras.length > 0 ? (
        <ul className="mt-2">
          {device.cameras.map((c) => (
            <CameraRow key={c.camera_id} camera={c} name={cameraNames.get(c.camera_id) ?? c.camera_id} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">{t('live.devices.noCameras')}</p>
      )}
    </div>
  );
}

export function DevicesPanel({ live, now, cameraNames }: { live: LiveSnapshot; now: number; cameraNames: Map<string, string> }) {
  const { t } = useTranslation();
  return (
    <Card title={t('live.devices.title')} level={2}>
      {live.devices.length === 0 ? (
        <p className="text-sm text-muted">{t('live.devices.none')}</p>
      ) : (
        <div className="-my-2 divide-y divide-border">
          {live.devices.map((d) => (
            <DeviceBlock key={d.device_id} device={d} now={now} cameraNames={cameraNames} />
          ))}
        </div>
      )}
    </Card>
  );
}
