import type { FloorPlanItem, TableLive } from '@rv/shared';

export interface PlacedTable {
  table: TableLive;
  x: number;
  y: number;
  w: number;
  h: number;
  placed: boolean;
}

/** Positions every table: floor-plan items first, then unplaced tables in rows below. */
export function layoutTables(tables: TableLive[], plan: FloorPlanItem[]) {
  const byId = new Map(plan.map((p) => [p.table_id, p]));
  const placed: PlacedTable[] = [];
  const unplaced: TableLive[] = [];
  for (const t of tables) {
    const p = byId.get(t.table_id);
    if (p) placed.push({ table: t, x: p.x, y: p.y, w: p.w, h: p.h, placed: true });
    else unplaced.push(t);
  }
  let cols = Math.max(6, ...placed.map((p) => p.x + p.w));
  let rows = Math.max(0, ...placed.map((p) => p.y + p.h));
  const startRow = rows > 0 ? rows + 1 : 0;
  unplaced.forEach((t, i) => {
    placed.push({
      table: t,
      x: i % cols,
      y: startRow + Math.floor(i / cols),
      w: 1,
      h: 1,
      placed: false,
    });
  });
  cols = Math.max(cols, ...placed.map((p) => p.x + p.w));
  rows = Math.max(rows, ...placed.map((p) => p.y + p.h));
  return { items: placed, cols, rows, unplacedCount: unplaced.length };
}
