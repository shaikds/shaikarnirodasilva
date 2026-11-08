// Step 3: cameras. ONVIF discovery, add/edit/delete, a blurred test picture per camera. Stream
// URLs and credentials go to the edge's local secrets (`/local/cameras`); the camera's name and
// on/off switch live in the SiteConfig (saved with `PUT /local/config`).
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  Switch,
  useTranslation,
} from '@rv/shared';
import { Camera, ImageIcon, KeyRound, Pencil, Plus, Radar, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocalApi } from '../../api/context';
import type { DiscoveredDevice, DiscoveryOut } from '../../api/types';
import { ServerErrors } from '../../components/ServerErrors';
import { SnapshotFrame } from '../../components/SnapshotFrame';
import { useSnapshot } from '../../live/useSnapshot';
import {
  cameraIdFor,
  cameraRows,
  newCameraConfig,
  removeCamera,
  type CameraRow,
} from '../../lib/config';
import { isStatus } from '../../lib/errors';
import { guessBrand, redactUrl } from '../../lib/rtsp';
import { CameraForm, type CameraFormResult, type CameraFormValues } from './CameraForm';
import type { StepProps } from './SetupLayout';
import { useSetup } from './setupState';

type Editing =
  | { type: 'add'; preset?: Partial<CameraFormValues> }
  | { type: 'edit'; cameraId: string }
  | null;

const STATUS_TONE = { ok: 'success', degraded: 'warning', offline: 'danger' } as const;

function asDevice(value: unknown): DiscoveredDevice | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' && x ? x : null);
  return {
    address: str(v.address) ?? undefined,
    manufacturer: str(v.manufacturer),
    model: str(v.model),
    name: str(v.name),
  };
}

export function CamerasStep(_: StepProps) {
  const { t } = useTranslation();
  const api = useLocalApi();
  const ctx = useSetup();
  const config = ctx.config!;
  const rows = cameraRows(config, ctx.streams);
  const [editing, setEditing] = useState<Editing>(rows.length === 0 ? { type: 'add' } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryOut | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const takenIds = () => [...config.cameras.map((c) => c.camera_id), ...ctx.streams.map((s) => s.camera_id)];

  const addCamera = async (r: CameraFormResult): Promise<boolean> => {
    if (!r.url) return false;
    setBusy(true);
    setError(null);
    try {
      const cameraId = cameraIdFor(r.name, takenIds());
      await api.addCamera({
        camera_id: cameraId,
        kind: 'rtsp',
        url: r.url,
        username: r.username,
        password: r.password,
      });
      const saved = await ctx.save({ ...config, cameras: [...config.cameras, newCameraConfig(cameraId, r.name)] });
      await ctx.refetchStreams();
      if (saved) setEditing(null);
      return saved;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const editCamera = async (row: CameraRow, r: CameraFormResult): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      if (row.stream) {
        if (r.url || r.username || r.password) {
          await api.updateCamera(row.camera_id, {
            ...(r.url ? { url: r.url } : {}),
            ...(r.username ? { username: r.username } : {}),
            ...(r.password ? { password: r.password } : {}),
          });
        }
      } else if (r.url) {
        // In the config but the edge has no stream for it yet (e.g. config from the cloud).
        await api.addCamera({ camera_id: row.camera_id, kind: 'rtsp', url: r.url, username: r.username, password: r.password });
      }
      const cameras = row.config
        ? config.cameras.map((c) => (c.camera_id === row.camera_id ? { ...c, name: r.name } : c))
        : [...config.cameras, newCameraConfig(row.camera_id, r.name)];
      const saved = await ctx.save({ ...config, cameras });
      await ctx.refetchStreams();
      if (saved) setEditing(null);
      return saved;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteCamera = async (row: CameraRow) => {
    setBusy(true);
    setError(null);
    try {
      if (row.stream) {
        try {
          await api.deleteCamera(row.camera_id);
        } catch (err) {
          if (!isStatus(err, 404)) throw err;
        }
      }
      if (row.config) await ctx.save(removeCamera(config, row.camera_id));
      await ctx.refetchStreams();
      setConfirmDelete(null);
      if (preview === row.camera_id) setPreview(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const discover = async () => {
    setDiscovering(true);
    setError(null);
    try {
      setDiscovery(await api.discoverCameras());
    } catch (err) {
      setError(err);
    } finally {
      setDiscovering(false);
    }
  };

  const editingRow = editing?.type === 'edit' ? rows.find((r) => r.camera_id === editing.cameraId) : undefined;
  const devices = (discovery?.devices ?? []).map(asDevice).filter((d): d is DiscoveredDevice => !!d?.address);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing({ type: 'add' })} disabled={editing?.type === 'add'}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('cameras.add')}
        </Button>
        <Button variant="secondary" onClick={() => void discover()} loading={discovering}>
          <Radar aria-hidden="true" className="h-4 w-4" />
          {t('cameras.discover')}
        </Button>
      </div>

      {error != null && <ServerErrors error={error} onDismiss={() => setError(null)} />}

      {discovery && (
        <Card title={t('cameras.discoveryTitle')} level={3}>
          {!discovery.available ? (
            <p className="text-sm text-muted">{t('cameras.discoveryUnavailable')}</p>
          ) : discovery.error ? (
            <p className="text-sm text-danger" dir="auto">
              {t('cameras.discoveryFailed', { error: discovery.error })}
            </p>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted">{t('cameras.discoveryNone')}</p>
          ) : (
            <ul className="divide-y divide-border" aria-label={t('cameras.discoveryTitle')}>
              {devices.map((d) => {
                const label = [d.manufacturer, d.model].filter(Boolean).join(' ') || d.name || d.address;
                return (
                  <li key={d.address} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block font-medium" dir="auto">
                        {label}
                      </span>
                      <span className="rv-num text-xs text-muted">{d.address}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setEditing({
                          type: 'add',
                          preset: {
                            name: d.name ?? d.model ?? '',
                            host: d.address ?? '',
                            mode: 'brand',
                            brand: guessBrand(d.manufacturer, d.model, d.name) ?? 'generic',
                          },
                        })
                      }
                    >
                      {t('cameras.use')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {editing?.type === 'add' && (
        <Card title={t('cameras.form.addTitle')} level={3}>
          <CameraForm
            key={JSON.stringify(editing.preset ?? {})}
            preset={editing.preset}
            busy={busy}
            onSubmit={addCamera}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {rows.length === 0 && !editing ? (
        <EmptyState icon={<Camera className="h-10 w-10" />} title={t('cameras.none')} description={t('cameras.noneBody')} />
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('cameras.listLabel')}>
          {rows.map((row) => {
            const isEditing = editingRow?.camera_id === row.camera_id;
            const zoneCount = config.zones.filter((z) => z.camera_id === row.camera_id).length;
            const status = row.stream?.status ?? null;
            return (
              <li key={row.camera_id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Camera aria-hidden="true" className="h-4 w-4 text-muted" />
                      <span className="font-semibold" dir="auto">
                        {row.name}
                      </span>
                      <span className="rv-num text-xs text-muted">{row.camera_id}</span>
                      {status && <Badge tone={STATUS_TONE[status]}>{t(`common:camera.${status}`)}</Badge>}
                      {row.source === 'simulated' && <Badge tone="info">{t('cameras.simulated')}</Badge>}
                      {!row.config && <Badge tone="warning">{t('cameras.notInConfig')}</Badge>}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted" dir="ltr">
                      {row.stream ? redactUrl(row.stream.url) : t('cameras.noStream')}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {row.stream?.has_credentials && (
                        <span className="inline-flex items-center gap-1">
                          <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
                          {t('cameras.credentialsStored')}
                        </span>
                      )}
                      <span>{t('cameras.zoneCount', { count: zoneCount })}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={preview === row.camera_id}
                      onClick={() => setPreview((p) => (p === row.camera_id ? null : row.camera_id))}
                    >
                      <ImageIcon aria-hidden="true" className="h-4 w-4" />
                      {t('cameras.testPicture')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(isEditing ? null : { type: 'edit', cameraId: row.camera_id })}
                      aria-label={t('cameras.editNamed', { name: row.name })}
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      {t('common:actions.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => setConfirmDelete(row.camera_id)}
                      aria-label={t('cameras.deleteNamed', { name: row.name })}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      {t('common:actions.delete')}
                    </Button>
                  </div>
                </div>

                {row.config && (
                  <div className="mt-2 border-t border-border">
                    <Switch
                      checked={row.enabled}
                      onChange={(enabled) =>
                        ctx.setConfig((c) => ({
                          ...c,
                          cameras: c.cameras.map((cam) => (cam.camera_id === row.camera_id ? { ...cam, enabled } : cam)),
                        }))
                      }
                      label={t('cameras.enabled')}
                      description={t('cameras.enabledHint')}
                    />
                  </div>
                )}

                {confirmDelete === row.camera_id && (
                  <div role="alertdialog" aria-labelledby={`del-${row.camera_id}`} className="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3">
                    <p id={`del-${row.camera_id}`} className="text-sm font-medium">
                      {t('cameras.confirmDelete', { name: row.name, count: zoneCount })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="danger" size="sm" loading={busy} onClick={() => void deleteCamera(row)}>
                        {t('common:actions.delete')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                        {t('common:actions.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {preview === row.camera_id && <CameraPreview cameraId={row.camera_id} name={row.name} />}

                {isEditing && (
                  <div className="mt-4 border-t border-border pt-4">
                    <CameraForm
                      initial={{
                        name: row.name,
                        redactedUrl: row.stream?.url ?? null,
                        hasCredentials: !!row.stream?.has_credentials,
                        streamless: !row.stream,
                      }}
                      nameOnly={row.source === 'simulated'}
                      busy={busy}
                      onSubmit={(r) => editCamera(row, r)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CameraPreview({ cameraId, name }: { cameraId: string; name: string }) {
  const { t } = useTranslation();
  const snap = useSnapshot(cameraId);
  return (
    <div className="mt-3 max-w-md">
      <SnapshotFrame
        imageUrl={snap.url}
        imageAlt={t('snapshot.alt', { name })}
        loading={snap.loading}
        aria-hidden="true"
        placeholder={snap.error ? <ServerErrors error={snap.error} title={t('snapshot.failed')} /> : undefined}
      >
        {() => null}
      </SnapshotFrame>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {snap.loading && <Spinner size="sm" />}
        <Button size="sm" variant="ghost" onClick={snap.refresh}>
          {t('snapshot.refresh')}
        </Button>
        <span>{t('snapshot.blurredNote')}</span>
      </div>
    </div>
  );
}
