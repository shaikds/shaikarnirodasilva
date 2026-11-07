// Step 6 (optional): staff uniform calibration. The installer drags a box around a staff
// member's torso on the snapshot; the edge measures the dominant colour (`POST
// /local/uniform/calibrate`) and keeps only that colour, never the picture.
import { Button, SelectField, useTranslation } from '@rv/shared';
import { CircleCheck, RefreshCw, Shirt } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocalApi } from '../../api/LocalApiProvider';
import type { CalibrateOut } from '../../api/types';
import { ServerErrors } from '../../components/ServerErrors';
import { SnapshotFrame } from '../../components/SnapshotFrame';
import { useSnapshot } from '../../live/useSnapshot';
import { boxFromCorners, isUsableBox, toNormalized, type Pt } from '../../lib/geometry';
import type { StepProps } from './SetupLayout';
import { useSetup } from './SetupContext';

type Box = [number, number, number, number];

/** OpenCV-style HSV from the edge (hue degrees, s and v 0..1) to a CSS color. */
export function hsvToCss([h, s, v]: readonly [number, number, number]): string {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${Math.round(h)} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}

export function UniformStep(_: StepProps) {
  const { t } = useTranslation();
  const api = useLocalApi();
  const ctx = useSetup();
  const config = ctx.config!;
  const [cameraId, setCameraId] = useState(config.cameras[0]?.camera_id ?? '');
  const snapshot = useSnapshot(cameraId || null);
  const svgRef = useRef<SVGSVGElement>(null);
  const start = useRef<Pt | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<CalibrateOut | null>(null);

  const pointAt = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return { p: toNormalized(e.clientX, e.clientY, rect), size: { width: rect.width, height: rect.height } };
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const hit = pointAt(e);
    if (!hit) return;
    e.preventDefault();
    start.current = hit.p;
    setBox(null);
    setResult(null);
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // best effort
    }
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!start.current) return;
    const hit = pointAt(e);
    if (hit) setBox(boxFromCorners(start.current, hit.p));
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!start.current) return;
    const hit = pointAt(e);
    const b = hit ? boxFromCorners(start.current, hit.p) : box;
    start.current = null;
    setBox(b && hit && isUsableBox(b, hit.size) ? b : null);
  };

  const calibrate = async () => {
    if (!box) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.calibrateUniform({ camera_id: cameraId, box }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            label={t('uniform.camera')}
            value={cameraId}
            onChange={(e) => {
              setCameraId(e.target.value);
              setBox(null);
              setResult(null);
            }}
            containerClassName="min-w-[12rem]"
          >
            {config.cameras.map((c) => (
              <option key={c.camera_id} value={c.camera_id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Button variant="secondary" onClick={snapshot.refresh} loading={snapshot.loading}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {t('snapshot.refresh')}
          </Button>
        </div>
        <SnapshotFrame
          ref={svgRef}
          imageUrl={snapshot.url}
          imageAlt={t('snapshot.alt', { name: config.cameras.find((c) => c.camera_id === cameraId)?.name ?? cameraId })}
          loading={snapshot.loading}
          placeholder={snapshot.error ? <ServerErrors error={snapshot.error} title={t('snapshot.failed')} /> : undefined}
          role="application"
          aria-label={t('uniform.canvasLabel')}
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          data-testid="uniform-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => (start.current = null)}
        >
          {(size) =>
            box && (
              <rect
                x={box[0] * size.width}
                y={box[1] * size.height}
                width={(box[2] - box[0]) * size.width}
                height={(box[3] - box[1]) * size.height}
                fill="#22c55e"
                fillOpacity={0.15}
                stroke="#16a34a"
                strokeWidth={3}
                strokeDasharray="8 4"
              />
            )
          }
        </SnapshotFrame>
        <p className="text-sm text-muted">{box ? t('uniform.boxReady') : t('uniform.howTo')}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={() => void calibrate()} disabled={!box} loading={busy}>
          <Shirt aria-hidden="true" className="h-4 w-4" />
          {t('uniform.calibrate')}
        </Button>
        {error != null && <ServerErrors error={error} title={t('uniform.failed')} />}
        {result && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-success/40 bg-success-soft p-3 text-sm">
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-lg border border-border"
              style={{ background: hsvToCss(result.uniform_hsv) }}
            />
            <span>
              <span className="flex items-center gap-1 font-semibold text-success">
                <CircleCheck aria-hidden="true" className="h-4 w-4" />
                {t('uniform.saved')}
              </span>
              <span className="text-muted">{t('uniform.savedBody')}</span>
            </span>
          </div>
        )}
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">{t('uniform.privacy')}</p>
      </div>
    </div>
  );
}
