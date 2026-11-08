// Status home: device, pairing, camera health, live occupancy and table states (LAN, no PIN).
import {
  Badge,
  buttonClass,
  Card,
  ConnectionBadge,
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatTile,
  TableStateChip,
  useFormatters,
  useTranslation,
  type CameraHealth,
} from '@rv/shared';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Camera, Cloud, CloudOff, Cpu, Users, Utensils, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocalApi } from '../api/context';
import { useEdgeNow, useLocalLive } from '../live/useLocalLive';
import { SETUP_STATUS_KEY } from './setup/setupState';

const CAMERA_TONE = { ok: 'success', degraded: 'warning', offline: 'danger' } as const;

export function HomePage() {
  const { t } = useTranslation();
  const f = useFormatters();
  const api = useLocalApi();
  const status = useQuery({
    queryKey: SETUP_STATUS_KEY,
    queryFn: ({ signal }) => api.setupStatus(signal),
    refetchInterval: 10_000,
  });
  const live = useLocalLive();
  const now = useEdgeNow(live.clockOffsetS);
  const s = status.data;
  const snap = live.data;
  const cameras: CameraHealth[] = snap?.devices.flatMap((d) => d.cameras) ?? [];
  const setupDone = !!s && s.pin_set && s.configured && s.camera_count + cameras.length > 0;

  return (
    <div>
      <PageHeader
        title={t('home.title')}
        subtitle={t('home.subtitle')}
        actions={
          <>
            <ConnectionBadge status={live.status} />
            {setupDone && (
              <Link to="/setup" className={buttonClass('secondary')}>
                <Wrench aria-hidden="true" className="h-4 w-4" />
                {t('home.openSetup')}
              </Link>
            )}
            <Link to="/local-alerts" className={buttonClass('secondary')}>
              <BellRing aria-hidden="true" className="h-4 w-4" />
              {t('home.alertsButton')}
            </Link>
          </>
        }
      />

      {status.isLoading ? (
        <LoadingBlock />
      ) : status.isError || !s ? (
        <Card>
          <p role="alert" className="text-danger">
            {t('home.unreachable')}
          </p>
        </Card>
      ) : (
        <>
          {!setupDone && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4">
              <div>
                <p className="font-semibold text-primary">{t('home.notSetUpTitle')}</p>
                <p className="text-sm text-fg">{t('home.notSetUpBody')}</p>
              </div>
              <Link to="/setup" className={buttonClass('primary', 'lg')}>
                <Wrench aria-hidden="true" className="h-4 w-4" />
                {t('home.startSetup')}
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={t('home.device')}
              icon={<Cpu className="h-5 w-5" />}
              value={<span className="text-lg">{t('home.running')}</span>}
              hint={<span className="rv-num">v{s.version}</span>}
              tone="success"
            />
            <StatTile
              label={t('home.cloud')}
              icon={s.paired ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
              value={<span className="text-lg">{s.paired ? t('home.paired') : t('home.notPaired')}</span>}
              hint={
                s.paired
                  ? s.cloud_online
                    ? t('home.cloudOnline')
                    : t('home.cloudOffline', { count: s.outbox_depth })
                  : t('home.localOnly')
              }
              tone={s.paired ? (s.cloud_online ? 'success' : 'warning') : 'default'}
            />
            <StatTile
              label={t('home.guests')}
              icon={<Users className="h-5 w-5" />}
              value={<span className="rv-num">{snap?.occupancy ? f.number(snap.occupancy.guests) : '—'}</span>}
              hint={
                snap?.occupancy
                  ? t('home.staffOnFloor', { count: snap.occupancy.staff_on_floor })
                  : t('common:status.notEnoughData')
              }
            />
            <StatTile
              label={t('home.tablesOccupied')}
              icon={<Utensils className="h-5 w-5" />}
              value={
                <span className="rv-num">
                  {snap?.occupancy
                    ? `${f.number(snap.occupancy.tables_occupied)}/${f.number(snap.occupancy.tables_total)}`
                    : '—'}
                </span>
              }
              hint={t('home.openAlertsCount', { count: snap?.open_alerts.length ?? 0 })}
              tone={(snap?.open_alerts.length ?? 0) > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Card title={t('home.camerasTitle')} className="lg:col-span-1">
              {cameras.length === 0 ? (
                <EmptyState
                  icon={<Camera className="h-8 w-8" />}
                  title={t('home.noCameras')}
                  className="py-4"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {cameras.map((c) => (
                    <li key={c.camera_id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate font-medium" dir="auto">
                        {c.camera_id}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        <span className="rv-num">{t('home.fps', { fps: f.number(c.fps, 1) })}</span>
                        <Badge tone={CAMERA_TONE[c.status]}>{t(`common:camera.${c.status}`)}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={t('home.tablesTitle')} className="lg:col-span-2">
              {live.isLoading ? (
                <LoadingBlock />
              ) : !snap || snap.tables.length === 0 ? (
                <EmptyState title={t('home.noTables')} className="py-4" />
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {snap.tables.map((tb) => (
                    <li
                      key={tb.table_id}
                      className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2/50 p-2.5"
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="font-semibold" dir="auto">
                          {t('common:table.name', { label: tb.label })}
                        </span>
                        {tb.open_alert_ids.length > 0 && (
                          <BellRing aria-label={t('home.hasAlert')} className="h-4 w-4 text-danger" />
                        )}
                      </span>
                      <TableStateChip state={tb.state} size="sm" />
                      <span className="text-xs text-muted">
                        {t('common:table.guests', { count: tb.guest_count })}
                        {tb.since_ts !== null && (
                          <>
                            {' · '}
                            {t('common:table.since', { duration: f.duration(now - tb.since_ts) })}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
