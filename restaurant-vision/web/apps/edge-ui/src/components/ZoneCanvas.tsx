// SVG overlay editor for the zones of one camera, in normalized coordinates.
//
// Pointer (mouse, pen, touch):
//   drawing: tap/click adds a vertex; tapping the first vertex closes the polygon (a line is
//            done after its second point); right-click removes the last point.
//   editing: drag a vertex to move it; drag a "+" edge handle to insert a vertex; drag inside the
//            selected shape to move it; right-click or long-press a vertex to delete it;
//            tap another shape to select it, empty space to deselect.
// Keyboard (the canvas and each vertex are focusable):
//   drawing: arrows move a crosshair (Shift = bigger steps), Enter/Space adds a point,
//            Backspace removes the last one, Escape cancels.
//   vertex:  arrows nudge it, Delete/Backspace removes it, Escape deselects.
import type { Table, Zone, ZoneKind } from '@rv/shared';
import { cn, useTranslation } from '@rv/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  centroid,
  distancePx,
  hitTestShapes,
  hitTestVertex,
  inArrow,
  insertOnEdge,
  midpoint,
  moveVertex,
  nudgeVertex,
  pointInPolygon,
  hitTestEdge,
  toNormalized,
  toPixels,
  translate,
  type Pt,
  type Size,
} from '../lib/geometry';
import { isLineKind, paintOrder, zonePoints, ZONE_STYLE } from '../lib/zones';
import { SnapshotFrame } from './SnapshotFrame';

export interface DrawingState {
  kind: ZoneKind;
  points: Pt[];
}

/** Visual override per zone (live view: color table zones by state). */
export interface ZoneLook {
  stroke: string;
  fill: string;
  fillOpacity: number;
  label: string;
  sublabel?: string;
}

export interface ZoneCanvasProps {
  imageUrl: string | null;
  imageAlt: string;
  loading?: boolean;
  placeholder?: ReactNode;
  zones: readonly Zone[];
  tables: readonly Table[];
  selectedZoneId?: string | null;
  selectedVertex?: number | null;
  drawing?: DrawingState | null;
  readOnly?: boolean;
  look?: (zone: Zone) => ZoneLook | null;
  onSelect?: (zoneId: string | null) => void;
  onSelectVertex?: (index: number | null) => void;
  /** New points for a zone (polygon vertices or line endpoints). */
  onZonePoints?: (zoneId: string, points: Pt[]) => void;
  onDeleteVertex?: (zoneId: string, index: number) => void;
  onDrawPoint?: (p: Pt) => void;
  onDrawUndo?: () => void;
  onDrawClose?: () => void;
  onDrawCancel?: () => void;
  className?: string;
}

const VERTEX_R = 9;
const VERTEX_HIT_PX = 22;
const MID_R = 7;
const MID_HIT_PX = 16;
const CLOSE_HIT_PX = 22;
const DRAG_SLOP_PX = 5;
const LONG_PRESS_MS = 600;
const NUDGE = 0.005;
const NUDGE_BIG = 0.02;
const MIN_POLYGON_POINTS = 3;

interface DragState {
  pointerId: number;
  zoneId: string;
  mode: 'vertex' | 'shape';
  index: number;
  origin: Pt;
  originPoints: Pt[];
  startClient: [number, number];
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

function arrowKeyDelta(e: KeyboardEvent, step: number): [number, number] | null {
  switch (e.key) {
    case 'ArrowLeft':
      return [-step, 0];
    case 'ArrowRight':
      return [step, 0];
    case 'ArrowUp':
      return [0, -step];
    case 'ArrowDown':
      return [0, step];
    default:
      return null;
  }
}

export function ZoneCanvas({
  imageUrl,
  imageAlt,
  loading,
  placeholder,
  zones,
  tables,
  selectedZoneId = null,
  selectedVertex = null,
  drawing = null,
  readOnly = false,
  look,
  onSelect,
  onSelectVertex,
  onZonePoints,
  onDeleteVertex,
  onDrawPoint,
  onDrawUndo,
  onDrawClose,
  onDrawCancel,
  className,
}: ZoneCanvasProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);
  const lastPointerType = useRef<string>('mouse');
  const [hover, setHover] = useState<Pt | null>(null);
  const [cursor, setCursor] = useState<Pt>([0.5, 0.5]);
  const [focused, setFocused] = useState(false);

  const ordered = useMemo(() => paintOrder(zones), [zones]);
  const selected = zones.find((z) => z.zone_id === selectedZoneId) ?? null;
  const tableLabel = useCallback(
    (id: string | null) => tables.find((tb) => tb.table_id === id)?.label ?? null,
    [tables],
  );

  useEffect(() => {
    if (!drawing) setHover(null);
  }, [drawing]);

  // Cancel any pending long-press when unmounting.
  useEffect(
    () => () => {
      if (drag.current?.timer) clearTimeout(drag.current.timer);
    },
    [],
  );

  const pointAt = (e: { clientX: number; clientY: number }): { p: Pt; size: Size } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { p: toNormalized(e.clientX, e.clientY, rect), size: { width: rect.width, height: rect.height } };
  };

  const canDeleteVertex = (zone: Zone) =>
    !isLineKind(zone.kind) && zonePoints(zone).length > MIN_POLYGON_POINTS;

  const deleteVertex = (zone: Zone, index: number) => {
    if (!canDeleteVertex(zone)) return;
    onDeleteVertex?.(zone.zone_id, index);
  };

  const startDrag = (
    e: ReactPointerEvent<SVGSVGElement>,
    zone: Zone,
    mode: DragState['mode'],
    index: number,
    origin: Pt,
    originPoints: Pt[],
  ) => {
    const state: DragState = {
      pointerId: e.pointerId,
      zoneId: zone.zone_id,
      mode,
      index,
      origin,
      originPoints,
      startClient: [e.clientX, e.clientY],
      moved: false,
      timer: null,
    };
    if (mode === 'vertex' && canDeleteVertex(zone)) {
      state.timer = setTimeout(() => {
        const d = drag.current;
        if (d && !d.moved && d.zoneId === zone.zone_id) {
          drag.current = null;
          deleteVertex(zone, index);
        }
      }, LONG_PRESS_MS);
    }
    drag.current = state;
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // capture is best effort (not supported in some test environments)
    }
  };

  const endDrag = () => {
    const d = drag.current;
    if (d?.timer) clearTimeout(d.timer);
    drag.current = null;
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    lastPointerType.current = e.pointerType || 'mouse';
    if (readOnly || e.button === 2) return;
    const hit = pointAt(e);
    if (!hit) return;
    const { p, size } = hit;
    e.preventDefault();

    if (drawing) {
      const first = drawing.points[0];
      if (
        !isLineKind(drawing.kind) &&
        first &&
        drawing.points.length >= MIN_POLYGON_POINTS &&
        distancePx(first, p, size) <= CLOSE_HIT_PX
      ) {
        onDrawClose?.();
        return;
      }
      onDrawPoint?.(p);
      setCursor(p);
      return;
    }

    if (selected) {
      const pts = zonePoints(selected);
      const vi = hitTestVertex(pts, p, size, VERTEX_HIT_PX);
      if (vi >= 0) {
        onSelectVertex?.(vi);
        startDrag(e, selected, 'vertex', vi, p, pts);
        return;
      }
      if (!isLineKind(selected.kind)) {
        for (let i = 0; i < pts.length; i++) {
          const m = midpoint(pts[i]!, pts[(i + 1) % pts.length]!);
          if (distancePx(m, p, size) <= MID_HIT_PX) {
            const next = insertOnEdge(pts, i, p);
            onZonePoints?.(selected.zone_id, next);
            onSelectVertex?.(i + 1);
            startDrag(e, selected, 'vertex', i + 1, p, next);
            return;
          }
        }
      }
      const insideSelected = isLineKind(selected.kind)
        ? hitTestEdge(pts, p, size, 14, false) >= 0
        : pointInPolygon(p, pts);
      if (insideSelected) {
        startDrag(e, selected, 'shape', -1, p, pts);
        return;
      }
    }

    const shapes = ordered.map((z) => ({
      id: z.zone_id,
      points: zonePoints(z),
      closed: !isLineKind(z.kind),
    }));
    const hitId = hitTestShapes(shapes, p, size);
    onSelect?.(hitId);
    onSelectVertex?.(null);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d && d.pointerId === e.pointerId) {
      const hit = pointAt(e);
      if (!hit) return;
      if (!d.moved) {
        const dist = Math.hypot(e.clientX - d.startClient[0], e.clientY - d.startClient[1]);
        if (dist < DRAG_SLOP_PX) return;
        d.moved = true;
        if (d.timer) clearTimeout(d.timer);
      }
      const next =
        d.mode === 'vertex'
          ? moveVertex(d.originPoints, d.index, hit.p)
          : translate(d.originPoints, hit.p[0] - d.origin[0], hit.p[1] - d.origin[1]);
      onZonePoints?.(d.zoneId, next);
      return;
    }
    if (drawing && e.pointerType !== 'touch') {
      const hit = pointAt(e);
      if (hit) setHover(hit.p);
    }
  };

  const handleContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (readOnly) return;
    // On touch screens a long press also fires `contextmenu`; the long-press timer handles it.
    if (lastPointerType.current === 'touch') return;
    if (drawing) {
      onDrawUndo?.();
      return;
    }
    if (!selected) return;
    const hit = pointAt(e);
    if (!hit) return;
    const vi = hitTestVertex(zonePoints(selected), hit.p, hit.size, VERTEX_HIT_PX);
    if (vi >= 0) {
      endDrag();
      deleteVertex(selected, vi);
    }
  };

  const handleCanvasKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (readOnly || e.target !== e.currentTarget) return;
    if (drawing) {
      const delta = arrowKeyDelta(e, e.shiftKey ? 0.05 : 0.01);
      if (delta) {
        e.preventDefault();
        setCursor(([x, y]) => [
          Math.min(1, Math.max(0, x + delta[0])),
          Math.min(1, Math.max(0, y + delta[1])),
        ]);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDrawPoint?.(cursor);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onDrawUndo?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDrawCancel?.();
      }
      return;
    }
    if (e.key === 'Escape' && selected) {
      e.preventDefault();
      onSelect?.(null);
    }
  };

  const handleVertexKey = (e: KeyboardEvent<SVGElement>, zone: Zone, index: number) => {
    const delta = arrowKeyDelta(e, e.shiftKey ? NUDGE_BIG : NUDGE);
    if (delta) {
      e.preventDefault();
      e.stopPropagation();
      onZonePoints?.(zone.zone_id, nudgeVertex(zonePoints(zone), index, delta[0], delta[1]));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      deleteVertex(zone, index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onSelectVertex?.(null);
      svgRef.current?.focus();
    }
  };

  const kindName = (kind: ZoneKind) => t(`zoneKind.${kind}`);
  const zoneTitle = (z: Zone) => {
    if (z.kind === 'table') {
      const label = tableLabel(z.table_id);
      return label ? t('common:table.name', { label }) : kindName(z.kind);
    }
    return kindName(z.kind);
  };

  const canvasLabel = drawing
    ? t('editor.canvasDrawing', { kind: kindName(drawing.kind), count: drawing.points.length })
    : readOnly
      ? imageAlt
      : t('editor.canvasLabel');

  return (
    <SnapshotFrame
      ref={svgRef}
      imageUrl={imageUrl}
      imageAlt={imageAlt}
      loading={loading}
      placeholder={placeholder}
      className={className}
      role={readOnly ? 'img' : 'application'}
      aria-label={canvasLabel}
      aria-roledescription={readOnly ? undefined : t('editor.roleDescription')}
      tabIndex={readOnly ? undefined : 0}
      style={{ touchAction: readOnly ? 'auto' : 'none', cursor: drawing ? 'crosshair' : 'default' }}
      data-testid="zone-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onPointerLeave={() => setHover(null)}
      onContextMenu={handleContextMenu}
      onKeyDown={handleCanvasKey}
      onFocus={(e) => e.target === e.currentTarget && setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {(size) => (
        <>
          {ordered.map((z) => (
            <ZoneShape
              key={z.zone_id}
              zone={z}
              size={size}
              selected={z.zone_id === selectedZoneId}
              dimmed={!!drawing || (!!selectedZoneId && z.zone_id !== selectedZoneId)}
              title={zoneTitle(z)}
              sublabel={z.kind === 'table' && z.primary ? t('editor.primaryShort') : undefined}
              look={look?.(z) ?? null}
            />
          ))}

          {selected && !readOnly && !drawing && (
            <g data-testid="vertex-handles">
              {!isLineKind(selected.kind) &&
                zonePoints(selected).map((q, i, pts) => {
                  const m = midpoint(q, pts[(i + 1) % pts.length]!);
                  const [mx, my] = toPixels(m, size);
                  return (
                    <g key={`mid-${i}`} aria-hidden="true" className="pointer-events-none">
                      <circle cx={mx} cy={my} r={MID_R} fill="#fff" fillOpacity={0.9} stroke={ZONE_STYLE[selected.kind].color} strokeWidth={2} />
                      <path d={`M${mx - 3.5} ${my}h7M${mx} ${my - 3.5}v7`} stroke={ZONE_STYLE[selected.kind].color} strokeWidth={2} />
                    </g>
                  );
                })}
              {zonePoints(selected).map((q, i, pts) => {
                const [x, y] = toPixels(q, size);
                const active = selectedVertex === i;
                return (
                  <circle
                    key={`v-${i}`}
                    data-testid={`vertex-${i}`}
                    cx={x}
                    cy={y}
                    r={active ? VERTEX_R + 2 : VERTEX_R}
                    fill={active ? ZONE_STYLE[selected.kind].color : '#fff'}
                    stroke={active ? '#fff' : ZONE_STYLE[selected.kind].color}
                    strokeWidth={3}
                    tabIndex={0}
                    role="button"
                    aria-label={t('editor.vertexLabel', {
                      n: i + 1,
                      count: pts.length,
                      x: Math.round(q[0] * 100),
                      y: Math.round(q[1] * 100),
                    })}
                    aria-pressed={active}
                    className="cursor-grab focus:outline-none"
                    onFocus={() => onSelectVertex?.(i)}
                    onKeyDown={(e) => handleVertexKey(e, selected, i)}
                  />
                );
              })}
            </g>
          )}

          {drawing && (
            <DrawingPreview
              drawing={drawing}
              size={size}
              hover={hover}
              cursor={focused ? cursor : null}
              closeHint={t('editor.closeHint')}
            />
          )}
        </>
      )}
    </SnapshotFrame>
  );
}

function Label({
  x,
  y,
  text,
  sub,
  color,
}: {
  x: number;
  y: number;
  text: string;
  sub?: string;
  color: string;
}) {
  return (
    <g className="pointer-events-none select-none" aria-hidden="true">
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fontWeight={700}
        fill="#fff"
        stroke={color}
        strokeWidth={4}
        paintOrder="stroke"
        strokeLinejoin="round"
        style={{ unicodeBidi: 'plaintext' }}
      >
        {text}
      </text>
      {sub && (
        <text
          x={x}
          y={y + 17}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fontWeight={600}
          fill="#fff"
          stroke="#111827"
          strokeWidth={3.5}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function ZoneShape({
  zone,
  size,
  selected,
  dimmed,
  title,
  sublabel,
  look,
}: {
  zone: Zone;
  size: Size;
  selected: boolean;
  dimmed: boolean;
  title: string;
  sublabel?: string;
  look: ZoneLook | null;
}) {
  const style = ZONE_STYLE[zone.kind];
  const stroke = look?.stroke ?? style.color;
  const pts = zonePoints(zone);
  const opacity = dimmed ? 0.55 : 1;
  const width = selected ? 4 : 2.5;

  if (isLineKind(zone.kind)) {
    if (pts.length < 2) return null;
    const [a, b] = pts as [Pt, Pt];
    const [ax, ay] = toPixels(a, size);
    const [bx, by] = toPixels(b, size);
    const arrow = inArrow(a, b, zone.line?.in_direction ?? 'left_to_right', size, 44);
    const markerId = `arrow-${zone.zone_id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    return (
      <g opacity={opacity} data-zone-id={zone.zone_id} data-kind={zone.kind}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={stroke} stroke="#fff" strokeWidth={1} />
          </marker>
        </defs>
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#fff" strokeWidth={width + 3} strokeLinecap="round" />
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke={stroke} strokeWidth={width} strokeLinecap="round" />
        <line
          x1={arrow.from[0]}
          y1={arrow.from[1]}
          x2={arrow.to[0]}
          y2={arrow.to[1]}
          stroke={stroke}
          strokeWidth={3}
          markerEnd={`url(#${markerId})`}
          data-testid={`in-arrow-${zone.zone_id}`}
        />
        <circle cx={ax} cy={ay} r={4} fill={stroke} />
        <Label x={arrow.to[0]} y={arrow.to[1] + (arrow.to[1] > arrow.from[1] ? 14 : -14)} text={look?.label ?? title} color={stroke} />
      </g>
    );
  }

  if (pts.length < 2) return null;
  const d = pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${toPixels(q, size).join(' ')}`).join(' ') + ' Z';
  const [cx, cy] = toPixels(centroid(pts), size);
  return (
    <g opacity={opacity} data-zone-id={zone.zone_id} data-kind={zone.kind}>
      <path
        d={d}
        fill={look?.fill ?? style.color}
        fillOpacity={look?.fillOpacity ?? (selected ? Math.min(0.85, style.fillOpacity + 0.12) : style.fillOpacity)}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={style.dash}
        strokeLinejoin="round"
      />
      <Label x={cx} y={cy} text={look?.label ?? title} sub={look?.sublabel ?? sublabel} color={zone.kind === 'privacy' ? '#111827' : stroke} />
    </g>
  );
}

function DrawingPreview({
  drawing,
  size,
  hover,
  cursor,
  closeHint,
}: {
  drawing: DrawingState;
  size: Size;
  hover: Pt | null;
  cursor: Pt | null;
  closeHint: string;
}) {
  const color = ZONE_STYLE[drawing.kind].color;
  const pts = drawing.points;
  const px = pts.map((q) => toPixels(q, size));
  const last = px[px.length - 1];
  const target = hover ?? cursor;
  const tp = target ? toPixels(target, size) : null;
  const closable = !isLineKind(drawing.kind) && pts.length >= MIN_POLYGON_POINTS;
  return (
    <g className="pointer-events-none" data-testid="drawing-preview">
      {px.length >= 2 && (
        <polyline
          points={px.map((q) => q.join(',')).join(' ')}
          fill={closable ? color : 'none'}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      )}
      {last && tp && (
        <line x1={last[0]} y1={last[1]} x2={tp[0]} y2={tp[1]} stroke={color} strokeWidth={2} strokeDasharray="6 4" />
      )}
      {px.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === 0 && closable ? 12 : 7}
          fill={i === 0 && closable ? color : '#fff'}
          stroke={i === 0 && closable ? '#fff' : color}
          strokeWidth={3}
        />
      ))}
      {closable && px[0] && (
        <text
          x={px[0][0]}
          y={px[0][1] - 20}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="#fff"
          stroke="#111827"
          strokeWidth={3.5}
          paintOrder="stroke"
        >
          {closeHint}
        </text>
      )}
      {cursor && (
        <g>
          <circle cx={cursor[0] * size.width} cy={cursor[1] * size.height} r={10} fill="none" stroke="#fff" strokeWidth={4} />
          <circle cx={cursor[0] * size.width} cy={cursor[1] * size.height} r={10} fill="none" stroke={color} strokeWidth={2} />
        </g>
      )}
    </g>
  );
}

/** Small legend: color swatch + text for every kind (color is never the only cue). */
export function ZoneLegend({ kinds, className }: { kinds?: readonly ZoneKind[]; className?: string }) {
  const { t } = useTranslation();
  const list = kinds ?? (Object.keys(ZONE_STYLE) as ZoneKind[]);
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted', className)}>
      {list.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm border"
            style={{ background: ZONE_STYLE[k].color, borderColor: ZONE_STYLE[k].color }}
          />
          {t(`zoneKind.${k}`)}
        </li>
      ))}
    </ul>
  );
}
