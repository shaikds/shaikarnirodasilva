export type Cell = { color: string; glyph: string; name: string }
export type LegendRow = { name: string; tokens: number; pct: number; color: string; kind: string }

export type MapRow = {
  depth: number
  label: string
  start: number
  end: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-map': { rows: MapRow[]; total: number; window: number; note: string; isShown: boolean; rules: MapRow[]; reads: MapRow[]; grid: Cell[][]; legend: LegendRow[] }
  }
}
