// Floor-plan editor: drag tables on a grid (pointer) or move/resize them with the keyboard.
// Positions are grid cells from the start edge (`FloorPlanItem.x`), so the plan mirrors in RTL.
import {
  Button,
  Card,
  EmptyState,
  directionOf,
  useUpdateSite,
  useTranslation,
  type FloorPlanItem,
  type SiteSettings,
  type Table,
} from '@rv/shared';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const COLS = 12;
const CELL = 60;
const MAX_INDEX = 99;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function overlaps(a: FloorPlanItem, b: FloorPlanItem) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** First free cell for a 1x1 table, scanning rows top to bottom. */
function firstFreeCell(items: FloorPlanItem[], cols = COLS): { x: number; y: number } {
  for (let y = 0; y <= MAX_INDEX; y++) {
    for (let x = 0; x < cols; x++) {
      const probe = { table_id: '', x, y, w: 1, h: 1 };
      if (!items.some((i) => overlaps(i, probe))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

export function FloorPlanEditor({ site, tables }: { site: SiteSettings; tables: Table[] }) {
  const { t, i18n } = useTranslation();
  const rtl = directionOf(i18n.language) === 'rtl';
  const update = useUpdateSite(site.site_id);
  const tableIds = useMemo(() => new Set(tables.map((x) => x.table_id)), [tables]);
  const initial = useMemo(() => site.floor_plan.filter((p) => tableIds.has(p.table_id)), [site.floor_plan, tableIds]);
  const [items, setItems] = useState<FloorPlanItem[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [saved, setSaved] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const byId = new Map(tables.map((x) => [x.table_id, x]));
  const name = (id: string) => t('common:table.name', { label: byId.get(id)?.label ?? id });
  const rows = Math.max(8, ...items.map((i) => i.y + i.h + 2));
  const unplaced = tables.filter((x) => !items.some((i) => i.table_id === x.table_id));
  const hasOverlap = items.some((a, i) => items.some((b, j) => j > i && overlaps(a, b)));
  const current = items.find((i) => i.table_id === selected) ?? null;

  const change = (id: string, patch: Partial<FloorPlanItem>, say = false) => {
    setSaved(false);
    setItems((cur) =>
      cur.map((i) => {
        if (i.table_id !== id) return i;
        const w = clamp(patch.w ?? i.w, 1, 10);
        const h = clamp(patch.h ?? i.h, 1, 10);
        const next = {
          ...i,
          w,
          h,
          x: clamp(patch.x ?? i.x, 0, COLS - w),
          y: clamp(patch.y ?? i.y, 0, MAX_INDEX - h + 1),
        };
        if (say) setAnnounce(t('settings.floorPlan.moved', { name: name(id), x: next.x + 1, y: next.y + 1 }));
        return next;
      }),
    );
  };

  const cellAt = (e: PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    let col = Math.floor(((e.clientX - r.left) / r.width) * COLS);
    if (rtl) col = COLS - 1 - col;
    const row = Math.floor(((e.clientY - r.top) / r.height) * rows);
    return { col, row };
  };

  const onPointerDown = (e: PointerEvent<SVGGElement>, item: FloorPlanItem) => {
    e.preventDefault();
    setSelected(item.table_id);
    const { col, row } = cellAt(e);
    drag.current = { id: item.table_id, dx: col - item.x, dy: row - item.y };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const { col, row } = cellAt(e);
    change(drag.current.id, { x: col - drag.current.dx, y: row - drag.current.dy });
  };
  const onPointerUp = () => {
    if (drag.current) {
      const it = items.find((i) => i.table_id === drag.current!.id);
      if (it) setAnnounce(t('settings.floorPlan.moved', { name: name(it.table_id), x: it.x + 1, y: it.y + 1 }));
    }
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<SVGGElement>, item: FloorPlanItem) => {
    const towardsEnd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const towardsStart = rtl ? 'ArrowRight' : 'ArrowLeft';
    const id = item.table_id;
    let handled = true;
    if (e.key === 'Enter' || e.key === ' ') setSelected(id);
    else if (e.key === 'Delete' || e.key === 'Backspace') remove(id);
    else if (e.shiftKey && e.key === towardsEnd) change(id, { w: item.w + 1 }, true);
    else if (e.shiftKey && e.key === towardsStart) change(id, { w: item.w - 1 }, true);
    else if (e.shiftKey && e.key === 'ArrowDown') change(id, { h: item.h + 1 }, true);
    else if (e.shiftKey && e.key === 'ArrowUp') change(id, { h: item.h - 1 }, true);
    else if (e.key === towardsEnd) change(id, { x: item.x + 1 }, true);
    else if (e.key === towardsStart) change(id, { x: item.x - 1 }, true);
    else if (e.key === 'ArrowDown') change(id, { y: item.y + 1 }, true);
    else if (e.key === 'ArrowUp') change(id, { y: item.y - 1 }, true);
    else handled = false;
    if (handled) {
      e.preventDefault();
      setSelected(id);
    }
  };

  const place = (tableId: string) => {
    setSaved(false);
    const { x, y } = firstFreeCell(items);
    setItems((cur) => [...cur, { table_id: tableId, x, y, w: 1, h: 1 }]);
    setSelected(tableId);
    setAnnounce(t('settings.floorPlan.moved', { name: name(tableId), x: x + 1, y: y + 1 }));
  };
  const remove = (tableId: string) => {
    setSaved(false);
    setItems((cur) => cur.filter((i) => i.table_id !== tableId));
    setSelected(null);
  };

  if (tables.length === 0) {
    return (
      <Card>
        <EmptyState title={t('settings.floorPlan.noTables')} />
      </Card>
    );
  }

  return (
    <Card>
      <p className="mb-3 max-w-3xl text-sm text-muted">{t('settings.floorPlan.intro')}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${COLS * CELL} ${rows * CELL}`}
            role="group"
            aria-label={t('settings.floorPlan.gridAria', { cols: COLS, rows })}
            className="w-full min-w-[30rem] touch-none select-none rounded-lg border border-border bg-surface-2"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {Array.from({ length: COLS + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={rows * CELL} style={{ stroke: 'rgb(var(--rv-border))' }} strokeWidth={1} />
            ))}
            {Array.from({ length: rows + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * CELL} x2={COLS * CELL} y2={i * CELL} style={{ stroke: 'rgb(var(--rv-border))' }} strokeWidth={1} />
            ))}
            {items.map((item) => {
              const col = rtl ? COLS - item.x - item.w : item.x;
              const isSel = item.table_id === selected;
              return (
                <g
                  key={item.table_id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={t('settings.floorPlan.tableButton', {
                    name: name(item.table_id),
                    x: item.x + 1,
                    y: item.y + 1,
                    w: item.w,
                    h: item.h,
                  })}
                  onPointerDown={(e) => onPointerDown(e, item)}
                  onKeyDown={(e) => onKeyDown(e, item)}
                  onFocus={() => setSelected(item.table_id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <rect
                    x={col * CELL + 4}
                    y={item.y * CELL + 4}
                    width={item.w * CELL - 8}
                    height={item.h * CELL - 8}
                    rx={10}
                    style={{
                      fill: isSel ? 'rgb(var(--rv-primary-soft))' : 'rgb(var(--rv-surface))',
                      stroke: isSel ? 'rgb(var(--rv-primary))' : 'rgb(var(--rv-muted))',
                    }}
                    strokeWidth={isSel ? 3 : 1.5}
                  />
                  <text
                    x={col * CELL + (item.w * CELL) / 2}
                    y={item.y * CELL + (item.h * CELL) / 2 + 6}
                    textAnchor="middle"
                    fontSize={17}
                    fontWeight={700}
                    style={{ fill: 'rgb(var(--rv-fg))' }}
                  >
                    {byId.get(item.table_id)?.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
          {hasOverlap && <p className="mt-2 text-sm text-warning">{t('settings.floorPlan.overlap')}</p>}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border p-3">
            {current ? (
              <>
                <p className="mb-2 text-sm font-semibold">{t('settings.floorPlan.selected', { name: name(current.table_id) })}</p>
                {(['w', 'h'] as const).map((dim) => (
                  <div key={dim} className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm">{t(dim === 'w' ? 'settings.floorPlan.width' : 'settings.floorPlan.height')}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t(dim === 'w' ? 'settings.floorPlan.narrower' : 'settings.floorPlan.shorter')}
                        onClick={() => change(current.table_id, { [dim]: current[dim] - 1 }, true)}
                        disabled={current[dim] <= 1}
                      >
                        <Minus aria-hidden="true" className="h-4 w-4" />
                      </Button>
                      <span className="rv-num w-6 text-center text-sm font-semibold">{current[dim]}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t(dim === 'w' ? 'settings.floorPlan.wider' : 'settings.floorPlan.taller')}
                        onClick={() => change(current.table_id, { [dim]: current[dim] + 1 }, true)}
                        disabled={current[dim] >= 10}
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => remove(current.table_id)}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  {t('settings.floorPlan.remove')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">{t('settings.floorPlan.none')}</p>
            )}
          </div>
          {unplaced.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t('settings.floorPlan.unplaced')}</p>
              <ul className="flex flex-wrap gap-2">
                {unplaced.map((tb) => (
                  <li key={tb.table_id}>
                    <Button size="sm" variant="secondary" onClick={() => place(tb.table_id)} aria-label={t('settings.floorPlan.place', { name: name(tb.table_id) })}>
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      {tb.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          loading={update.isPending}
          onClick={() => {
            setSaved(false);
            update.mutate({ floor_plan: items }, { onSuccess: () => setSaved(true) });
          }}
        >
          {t('common:actions.save')}
        </Button>
        <Button variant="ghost" onClick={() => setItems(initial)}>
          {t('common:actions.cancel')}
        </Button>
        <span role="status" className="text-sm">
          {saved && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check aria-hidden="true" className="h-4 w-4" />
              {t('settings.saved')}
            </span>
          )}
          {update.isError && <span className="text-danger">{t('common:errors.generic')}</span>}
        </span>
      </div>
    </Card>
  );
}
