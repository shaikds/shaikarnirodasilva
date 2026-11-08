// Step 5: draw zones on each camera's blurred snapshot: tables (with their primary camera),
// queue, entrance line (with its "in" direction), staff area, guest area and privacy masks.
import {
  Badge,
  Button,
  Card,
  cn,
  SelectField,
  Switch,
  TextField,
  useTranslation,
  type Table,
  type Zone,
  type ZoneKind,
} from '@rv/shared';
import {
  ArrowLeftRight,
  Check,
  CircleAlert,
  Eraser,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { IssueText } from '../../components/IssueList';
import { ServerErrors } from '../../components/ServerErrors';
import { ZoneCanvas, ZoneLegend, type DrawingState } from '../../components/ZoneCanvas';
import { useSnapshot } from '../../live/useSnapshot';
import {
  addVertex,
  distancePx,
  flipDirection,
  isValidPolygon,
  removeVertex,
  type Pt,
} from '../../lib/geometry';
import { LABEL_MAX, SEATS_MAX, SEATS_MIN } from '../../lib/validation';
import {
  createZone,
  isLineKind,
  setPrimary,
  withPoints,
  zonePoints,
  ZONE_KINDS,
  ZONE_STYLE,
} from '../../lib/zones';
import type { StepProps } from './SetupLayout';
import { useSetup } from './SetupContext';
import { AutoDetectBar, SuggestionsPanel, useTableSuggestions } from './TableSuggestions';

const MIN_POLYGON_POINTS = 3;

export function ZonesStep(_: StepProps) {
  const { t } = useTranslation();
  const ctx = useSetup();
  const config = ctx.config!;
  const [cameraId, setCameraId] = useState<string>(config.cameras[0]?.camera_id ?? '');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const snapshot = useSnapshot(cameraId || null);

  const camera = config.cameras.find((c) => c.camera_id === cameraId) ?? config.cameras[0];
  useEffect(() => {
    if (!camera && config.cameras[0]) setCameraId(config.cameras[0].camera_id);
  }, [camera, config.cameras]);

  const suggestions = useTableSuggestions(camera?.camera_id ?? cameraId, config, ctx.setConfig);
  const zones = useMemo(() => config.zones.filter((z) => z.camera_id === camera?.camera_id), [config.zones, camera]);
  const selected = zones.find((z) => z.zone_id === selectedZoneId) ?? null;

  const switchCamera = (id: string) => {
    setCameraId(id);
    setSelectedZoneId(null);
    setSelectedVertex(null);
    setDrawing(null);
    setMessage(null);
  };

  const updateZones = (fn: (zones: Zone[]) => Zone[]) => ctx.setConfig((c) => ({ ...c, zones: fn(c.zones) }));
  const patchZone = (zoneId: string, patch: Partial<Zone>) =>
    updateZones((all) => all.map((z) => (z.zone_id === zoneId ? { ...z, ...patch } : z)));
  const patchTable = (tableId: string, patch: Partial<Table>) =>
    ctx.setConfig((c) => ({
      ...c,
      tables: c.tables.map((tb) => (tb.table_id === tableId ? { ...tb, ...patch } : tb)),
    }));
  const selectZone = (zoneId: string | null) => {
    setDrawing(null);
    setSelectedZoneId(zoneId);
    setSelectedVertex(null);
    suggestions.setActive(null);
  };

  const startDrawing = (kind: ZoneKind) => {
    setSelectedZoneId(null);
    setSelectedVertex(null);
    setMessage(null);
    setDrawing({ kind, points: [] });
  };

  const finish = (kind: ZoneKind, points: Pt[]) => {
    if (!camera) return;
    const zone = createZone(config, camera.camera_id, kind, points);
    ctx.setConfig((c) => ({ ...c, zones: [...c.zones, zone] }));
    setDrawing(null);
    setSelectedZoneId(zone.zone_id);
    setSelectedVertex(null);
    setMessage(t('zones.created', { what: t(`zoneKind.${kind}`) }));
  };

  const addPoint = (p: Pt) => {
    if (!drawing) return;
    if (isLineKind(drawing.kind)) {
      const [a] = drawing.points;
      if (!a) {
        setDrawing({ ...drawing, points: [p] });
        return;
      }
      if (distancePx(a, p, { width: 1000, height: 1000 }) < 5) return; // same spot twice
      finish(drawing.kind, [a, p]);
      return;
    }
    setDrawing({ ...drawing, points: addVertex(drawing.points, p) });
  };

  const closeShape = () => {
    if (!drawing || isLineKind(drawing.kind)) return;
    if (!isValidPolygon(drawing.points)) {
      setMessage(t('zones.tooSmall'));
      return;
    }
    finish(drawing.kind, drawing.points);
  };

  const deleteZone = (zoneId: string) => {
    updateZones((all) => all.filter((z) => z.zone_id !== zoneId));
    setSelectedZoneId(null);
    setSelectedVertex(null);
    setMessage(t('zones.deleted'));
  };

  const deleteVertex = (zoneId: string, index: number) => {
    updateZones((all) =>
      all.map((z) => (z.zone_id === zoneId ? withPoints(z, removeVertex(zonePoints(z), index)) : z)),
    );
    setSelectedVertex(null);
  };

  const tableLabel = (id: string | null) => config.tables.find((tb) => tb.table_id === id)?.label ?? null;
  const zoneTitle = (z: Zone) => {
    const label = z.kind === 'table' ? tableLabel(z.table_id) : null;
    return label ? t('common:table.name', { label }) : t(`zoneKind.${z.kind}`);
  };
  const zoneErrors = (zoneId: string) =>
    ctx.issues.filter((i) => i.severity === 'error' && i.entity === 'zone' && i.id === zoneId);

  if (!camera) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t('zones.cameraTabs')} className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {config.cameras.map((c) => {
            const count = config.zones.filter((z) => z.camera_id === c.camera_id).length;
            const active = c.camera_id === camera.camera_id;
            return (
              <button
                key={c.camera_id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchCamera(c.camera_id)}
                className={cn(
                  'flex min-h-tap items-center gap-2 rounded-md px-3 text-sm font-medium',
                  active ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                <span dir="auto">{c.name}</span>
                <span className="rv-num rounded-full bg-surface-2 px-1.5 text-xs text-muted">{count}</span>
              </button>
            );
          })}
        </div>
        <Button variant="secondary" onClick={snapshot.refresh} loading={snapshot.loading}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {t('snapshot.refresh')}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <AutoDetectBar state={suggestions} />
          <DrawToolbar
            drawing={drawing}
            hasTables={config.tables.length > 0}
            onStart={startDrawing}
            onClose={closeShape}
            onUndo={() => drawing && setDrawing({ ...drawing, points: drawing.points.slice(0, -1) })}
            onCancel={() => setDrawing(null)}
          />
          <ZoneCanvas
            imageUrl={snapshot.url}
            imageAlt={t('snapshot.alt', { name: camera.name })}
            loading={snapshot.loading}
            placeholder={snapshot.error ? <ServerErrors error={snapshot.error} title={t('snapshot.failed')} /> : undefined}
            zones={zones}
            tables={config.tables}
            selectedZoneId={selectedZoneId}
            selectedVertex={selectedVertex}
            drawing={drawing}
            suggestions={suggestions.shapes(t)}
            activeSuggestionId={suggestions.active}
            onSuggestionClick={(id) => {
              setSelectedZoneId(null);
              suggestions.setActive(id);
            }}
            onSelect={(id) => {
              setSelectedZoneId(id);
              suggestions.setActive(null);
              setMessage(null);
            }}
            onSelectVertex={setSelectedVertex}
            onZonePoints={(id, pts) =>
              updateZones((all) => all.map((z) => (z.zone_id === id ? withPoints(z, pts) : z)))
            }
            onDeleteVertex={deleteVertex}
            onDrawPoint={addPoint}
            onDrawUndo={() => drawing && setDrawing({ ...drawing, points: drawing.points.slice(0, -1) })}
            onDrawClose={closeShape}
            onDrawCancel={() => setDrawing(null)}
          />
          <p aria-live="polite" className="min-h-5 text-sm text-muted">
            {message}
          </p>
          <ZoneLegend />
          <details className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">{t('zones.helpTitle')}</summary>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-muted">
              <li>{t('zones.help.draw')}</li>
              <li>{t('zones.help.move')}</li>
              <li>{t('zones.help.insert')}</li>
              <li>{t('zones.help.delete')}</li>
              <li>{t('zones.help.keyboard')}</li>
            </ul>
          </details>
        </div>

        <div className="flex flex-col gap-3">
          <SuggestionsPanel
            state={suggestions}
            tables={config.tables}
            onEditTable={patchTable}
            onSelectZone={selectZone}
          />
          {selected ? (
            <ZonePanel
              key={selected.zone_id}
              zone={selected}
              title={zoneTitle(selected)}
              selectedVertex={selectedVertex}
              onPatch={(patch) => patchZone(selected.zone_id, patch)}
              onPatchTable={patchTable}
              onPrimary={(primary) => updateZones((all) => setPrimary(all, selected.zone_id, primary))}
              onDeleteVertex={() => selectedVertex !== null && deleteVertex(selected.zone_id, selectedVertex)}
              onDelete={() => deleteZone(selected.zone_id)}
              onDeselect={() => setSelectedZoneId(null)}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
              {drawing ? t(isLineKind(drawing.kind) ? 'zones.drawLineHint' : 'zones.drawHint') : t('zones.selectHint')}
            </p>
          )}

          <Card title={t('zones.listTitle', { name: camera.name })} level={3} padded={false}>
            {zones.length === 0 ? (
              <p className="p-4 text-sm text-muted">{t('zones.noneOnCamera')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {zones.map((z) => {
                  const errs = zoneErrors(z.zone_id);
                  const active = z.zone_id === selectedZoneId;
                  return (
                    <li key={z.zone_id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectZone(active ? null : z.zone_id)}
                        className={cn(
                          'flex min-h-tap w-full items-center gap-2 px-4 py-2 text-start text-sm hover:bg-surface-2',
                          active && 'bg-primary-soft',
                        )}
                      >
                        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: ZONE_STYLE[z.kind].color }} />
                        <span className="min-w-0 flex-1 truncate" dir="auto">
                          {zoneTitle(z)}
                          {z.kind === 'table' && <span className="text-muted"> · {t(`zoneKind.${z.kind}`)}</span>}
                        </span>
                        {z.primary && <Badge tone="primary">{t('zones.primaryBadge')}</Badge>}
                        {errs.length > 0 && (
                          <CircleAlert aria-label={t('zones.hasErrors')} className="h-4 w-4 shrink-0 text-danger" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <aside
            className={cn(
              'rounded-xl border p-3 text-sm',
              drawing?.kind === 'privacy' || selected?.kind === 'privacy'
                ? 'border-warning/50 bg-warning-soft'
                : 'border-border bg-surface',
            )}
          >
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <ShieldAlert aria-hidden="true" className="h-4 w-4 text-warning" />
              {t('zones.privacyTitle')}
            </p>
            <p className="text-muted">{t('zones.privacyBody')}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DrawToolbar({
  drawing,
  hasTables,
  onStart,
  onClose,
  onUndo,
  onCancel,
}: {
  drawing: DrawingState | null;
  hasTables: boolean;
  onStart: (kind: ZoneKind) => void;
  onClose: () => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (drawing) {
    const line = isLineKind(drawing.kind);
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary-soft p-2" role="toolbar" aria-label={t('zones.drawingToolbar')}>
        <span className="flex items-center gap-2 px-1 text-sm font-medium text-primary">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: ZONE_STYLE[drawing.kind].color }} />
          {t('zones.drawing', { kind: t(`zoneKind.${drawing.kind}`), count: drawing.points.length })}
        </span>
        <span className="ms-auto flex flex-wrap gap-2">
          {!line && (
            <Button size="sm" onClick={onClose} disabled={drawing.points.length < MIN_POLYGON_POINTS}>
              <Check aria-hidden="true" className="h-4 w-4" />
              {t('zones.closeShape')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onUndo} disabled={drawing.points.length === 0}>
            <Undo2 aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
            {t('zones.undoPoint')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X aria-hidden="true" className="h-4 w-4" />
            {t('common:actions.cancel')}
          </Button>
        </span>
      </div>
    );
  }
  return (
    <div role="toolbar" aria-label={t('zones.addToolbar')} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted">{t('zones.add')}</span>
      {ZONE_KINDS.map((kind) => {
        const disabled = kind === 'table' && !hasTables;
        return (
          <Button
            key={kind}
            size="sm"
            variant="secondary"
            disabled={disabled}
            title={disabled ? t('zones.needTables') : t(`zoneKindHint.${kind}`)}
            onClick={() => onStart(kind)}
          >
            <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: ZONE_STYLE[kind].color }} />
            {t(`zoneKind.${kind}`)}
          </Button>
        );
      })}
    </div>
  );
}

function ZonePanel({
  zone,
  title,
  selectedVertex,
  onPatch,
  onPatchTable,
  onPrimary,
  onDeleteVertex,
  onDelete,
  onDeselect,
}: {
  zone: Zone;
  title: string;
  selectedVertex: number | null;
  onPatch: (patch: Partial<Zone>) => void;
  onPatchTable: (tableId: string, patch: Partial<Table>) => void;
  onPrimary: (primary: boolean) => void;
  onDeleteVertex: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const { t } = useTranslation();
  const ctx = useSetup();
  const config = ctx.config!;
  const [confirm, setConfirm] = useState(false);
  const pts = zonePoints(zone);
  const line = isLineKind(zone.kind);
  const otherPrimary =
    zone.kind === 'table' && zone.table_id
      ? config.zones.find((z) => z.table_id === zone.table_id && z.primary && z.zone_id !== zone.zone_id)
      : undefined;
  const otherCamera = otherPrimary
    ? (config.cameras.find((c) => c.camera_id === otherPrimary.camera_id)?.name ?? otherPrimary.camera_id)
    : null;
  const errors = ctx.issues.filter((i) => i.severity === 'error' && i.entity === 'zone' && i.id === zone.zone_id);
  const table = zone.table_id ? config.tables.find((tb) => tb.table_id === zone.table_id) : undefined;

  return (
    <Card
      level={3}
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: ZONE_STYLE[zone.kind].color }} />
          <span dir="auto">{title}</span>
        </span>
      }
      description={t(`zoneKindHint.${zone.kind}`)}
      actions={
        <Button size="sm" variant="ghost" onClick={onDeselect} aria-label={t('zones.deselect')} className="px-2">
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {zone.kind === 'table' && (
          <>
            <SelectField
              label={t('zones.table')}
              value={zone.table_id ?? ''}
              onChange={(e) => {
                const tableId = e.target.value || null;
                const taken = config.zones.some((z) => z.table_id === tableId && z.primary && z.zone_id !== zone.zone_id);
                onPatch({ table_id: tableId, primary: zone.primary && !taken });
              }}
            >
              <option value="" disabled>
                {t('zones.pickTable')}
              </option>
              {config.tables.map((tb) => (
                <option key={tb.table_id} value={tb.table_id}>
                  {t('common:table.name', { label: tb.label })}
                </option>
              ))}
            </SelectField>
            {table && (
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                <TextField
                  label={t('tables.label')}
                  value={table.label}
                  maxLength={LABEL_MAX}
                  dir="auto"
                  onChange={(e) => onPatchTable(table.table_id, { label: e.target.value })}
                />
                <TextField
                  label={t('tables.seats')}
                  type="number"
                  inputMode="numeric"
                  min={SEATS_MIN}
                  max={SEATS_MAX}
                  value={table.seats > 0 ? String(table.seats) : ''}
                  onChange={(e) => onPatchTable(table.table_id, { seats: Math.floor(Number(e.target.value) || 0) })}
                />
              </div>
            )}
            <Switch
              checked={zone.primary}
              onChange={onPrimary}
              label={t('zones.primary')}
              description={
                otherCamera && !zone.primary
                  ? t('zones.primaryMoves', { camera: otherCamera })
                  : t('zones.primaryHint')
              }
            />
          </>
        )}

        {line && zone.line && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t('zones.lineHint')}</p>
            <Button
              variant="secondary"
              onClick={() => onPatch({ line: { ...zone.line!, in_direction: flipDirection(zone.line!.in_direction) } })}
            >
              <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
              {t('zones.flip')}
            </Button>
          </div>
        )}

        {!line && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t('zones.pointCount', { count: pts.length })}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={onDeleteVertex}
              disabled={selectedVertex === null || pts.length <= MIN_POLYGON_POINTS}
              title={pts.length <= MIN_POLYGON_POINTS ? t('zones.minPoints') : undefined}
            >
              <Eraser aria-hidden="true" className="h-4 w-4" />
              {t('zones.deletePoint')}
            </Button>
          </div>
        )}

        {errors.length > 0 && (
          <ul className="text-sm text-danger">
            {errors.map((i, k) => (
              <li key={k}>
                <IssueText issue={i} />
              </li>
            ))}
          </ul>
        )}

        {confirm ? (
          <div role="alertdialog" aria-labelledby={`zdel-${zone.zone_id}`} className="rounded-lg border border-danger/40 bg-danger-soft p-3">
            <p id={`zdel-${zone.zone_id}`} className="text-sm font-medium">
              {t('zones.confirmDelete', { name: title })}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="danger" size="sm" onClick={onDelete}>
                {t('common:actions.delete')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
                {t('common:actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="justify-start text-danger" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {t('zones.deleteZone')}
          </Button>
        )}
      </div>
    </Card>
  );
}
