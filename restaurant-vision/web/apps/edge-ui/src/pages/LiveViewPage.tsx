// Live view (contracts 1.3, LAN only): each camera's MJPEG stream from the edge with every
// person blurred, privacy masks black and the table zones coloured by live state. Needs the
// setup PIN (this tab's PIN session). Nothing is stored: the browser shows the stream and the
// edge encodes frames in memory only.
import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  TABLE_STATES,
  PageHeader,
  TextField,
  cn,
  useTranslation,
} from '@rv/shared';
import { useQuery } from '@tanstack/react-query';
import { EyeOff, KeyRound, RefreshCw, Video } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useLocalApi, usePinSession } from '../api/context';
import { errorKind } from '../lib/errors';
import { LIVE_STATE_COLORS } from '../lib/liveColors';

function PinGate() {
  const { t } = useTranslation();
  const api = useLocalApi();
  const session = usePinSession();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.verifyPin(pin);
      session.unlock(pin);
    } catch (err) {
      const kind = errorKind(err);
      setError(
        kind === 'pin'
          ? t('pin.wrong')
          : kind === 'locked'
            ? t('errors.locked')
            : kind === 'network'
              ? t('errors.network')
              : t('errors.server'),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('liveView.pinTitle')} className="max-w-md">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="flex items-start gap-2 text-sm">
          <KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {t('liveView.pinHint')}
        </p>
        <TextField
          label={t('pin.pin')}
          type="password"
          name="live-pin"
          autoComplete="current-password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          error={error ?? undefined}
          className="text-lg tracking-widest"
        />
        <div>
          <Button type="submit" loading={busy}>
            {t('liveView.unlock')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label={t('liveView.legend')}>
      {TABLE_STATES.map((state) => (
        <li key={state} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            data-testid={`legend-${state}`}
            className="inline-block h-3.5 w-5 rounded-sm border border-border"
            style={{ backgroundColor: LIVE_STATE_COLORS[state] }}
          />
          {t(`common:tableState.${state}`)}
        </li>
      ))}
    </ul>
  );
}

function Stream({ cameraId, name, pin }: { cameraId: string; name: string; pin: string }) {
  const { t } = useTranslation();
  const api = useLocalApi();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // A new URL (cache-busting) per camera and per retry.
  const src = useMemo(() => api.liveUrl(cameraId, pin), [api, cameraId, pin, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-surface-2 p-4 text-center">
        <p role="alert" className="text-sm text-danger">
          {t('liveView.streamError')}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {t('liveView.retry')}
        </Button>
      </div>
    );
  }
  return (
    <img
      key={src}
      src={src}
      alt={t('liveView.streamAlt', { name })}
      data-testid="live-stream"
      className="aspect-video w-full rounded-lg bg-black object-contain"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function LiveViewPage() {
  const { t } = useTranslation();
  const api = useLocalApi();
  const session = usePinSession();
  const cameras = useQuery({
    queryKey: ['local', 'cameras', 'live'],
    queryFn: ({ signal }) => api.listCameras(signal),
    enabled: !!session.pin,
  });
  const usable = (cameras.data ?? []).filter((c) => c.enabled !== false);
  const [selected, setSelected] = useState<string | null>(null);
  const current = usable.find((c) => c.camera_id === selected) ?? usable[0];

  return (
    <div>
      <PageHeader title={t('liveView.title')} subtitle={t('liveView.subtitle')} />
      {!session.pin ? (
        <PinGate />
      ) : cameras.isLoading ? (
        <LoadingBlock />
      ) : !current ? (
        <EmptyState
          icon={<Video className="h-10 w-10 text-muted" />}
          title={t('liveView.noCameras')}
        />
      ) : (
        <Card>
          <div
            role="tablist"
            aria-label={t('liveView.cameras')}
            className="mb-3 flex flex-wrap gap-1 border-b border-border"
          >
            {usable.map((c) => {
              const active = c.camera_id === current.camera_id;
              return (
                <button
                  key={c.camera_id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelected(c.camera_id)}
                  className={cn(
                    '-mb-px min-h-[40px] border-b-2 px-3 text-sm font-medium',
                    active ? 'border-primary text-primary' : 'border-transparent text-muted',
                  )}
                >
                  {c.name ?? c.camera_id}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" aria-label={current.name ?? current.camera_id}>
            <Stream
              key={current.camera_id}
              cameraId={current.camera_id}
              name={current.name ?? current.camera_id}
              pin={session.pin}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Legend />
            <p className="flex items-center gap-2 text-xs text-muted">
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {t('liveView.privacy')}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
