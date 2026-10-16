import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Cell, LegendRow, MapRow } from '../types'

const PANE = 'context-map'
const map = atom({ plugin: 'context-map', key: 'rows' } as const, [])
const total = atom({ plugin: 'context-map', key: 'total' } as const, 0)
const win = atom({ plugin: 'context-map', key: 'window' } as const, 0)
const isShown = atom({ plugin: 'context-map', key: 'isShown' } as const, false)
const rules = atom({ plugin: 'context-map', key: 'rules' } as const, [])
const reads = atom({ plugin: 'context-map', key: 'reads' } as const, [])
const grid = atom({ plugin: 'context-map', key: 'grid' } as const, [])
const legend = atom({ plugin: 'context-map', key: 'legend' } as const, [])
const note = atom({ plugin: 'context-map', key: 'note' } as const, 'Not measured yet.')

const fmt = (n: number) => n.toLocaleString('en-US')
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

// One square as /context draws it: full, part-full, or the hollow free space.
const glyph = (q: any) => (q.categoryName === 'Free space' ? '⛶' : q.squareFullness < 0.7 ? '⛀' : '⛁')

// The window as /context draws it: the square grid, then a legend row per category.
// Colors are theme keys, which every surface's Text resolves.
function view(Box: any, Text: any, p: any) {
  return (
    <Box flexDirection="column">
      <Text bold>Context Usage</Text>
      <Text dimColor>
        {p.model} · {fmtK(p.used)}/{fmtK(p.size)} tokens ({p.size ? Math.round((p.used / p.size) * 100) : 0}%)
      </Text>
      {p.grid.length === 0 && <Text dimColor>Nothing measured yet; run /context-map.</Text>}
      {p.grid.map((row: Cell[]) => (
        <Text>
          {row.map(c => (
            <Text color={c.color}>{c.glyph} </Text>
          ))}
        </Text>
      ))}
      <Text> </Text>
      {p.legend.map((l: LegendRow) => (
        <Text>
          <Text color={l.color}>{l.kind === 'free' ? '⛶' : l.kind === 'buffer' ? '⛝' : '⛁'}</Text> {l.name}:{' '}
          {fmtK(l.tokens)} tokens ({l.pct.toFixed(1)}%)
        </Text>
      ))}
      <Text> </Text>
      <Text bold>Token map (start-end)</Text>
      <Text dimColor>{p.note}</Text>
      {p.rows.map((r: MapRow) => (
        <Text dimColor={r.depth > 0}>
          {r.depth > 0 ? '  ' : ''}
          {r.label} [{fmt(r.start)}-{fmt(r.end)}]
        </Text>
      ))}
    </Box>
  )
}

// Lays the breakdown's rows end to end; a row's items fill it in order from its start.
const layout = (b: any, rl: MapRow[], rd: MapRow[]): MapRow[] => {
  const rows: MapRow[] = []
  let at = 0
  for (const c of b.categories ?? []) {
    if (c.kind !== 'used') continue
    const start = at
    const end = start + c.tokens
    rows.push({ depth: 0, label: c.name, start, end })
    const name = String(c.name).toLowerCase()
    let items: { label: string; tokens: number }[] = []
    if (name.includes('memory')) {
      items = (b.memoryFiles ?? []).map((f: any) => ({
        label: `${f.type} rule/file: ${f.path}`,
        tokens: f.tokens,
      }))
    } else if (name.includes('skill')) {
      items = (b.skills?.skillFrontmatter ?? []).map((s: any) => ({
        label: `skill ${s.name}`,
        tokens: s.tokens,
      }))
    } else if (name === 'mcp tools') {
      items = (b.mcpTools ?? [])
        .filter((t: any) => t.isLoaded)
        .map((t: any) => ({ label: `mcp ${t.name}`, tokens: t.tokens }))
    } else if (name.includes('agent')) {
      items = (b.agents ?? []).map((a: any) => ({
        label: `agent ${a.agentType}`,
        tokens: a.tokens,
      }))
    } else if (name.includes('command')) {
      items = []
    }
    let cur = start
    for (const it of items) {
      rows.push({ depth: 1, label: it.label, start: cur, end: cur + it.tokens })
      cur += it.tokens
    }
    if (name === 'messages') {
      // rule files ride in the first user message, so they open the Messages row
      let cur = start
      for (const r of rl) {
        const size = r.end - r.start
        rows.push({ depth: 1, label: r.label, start: cur, end: cur + size })
        cur += size
      }
      for (const r of rd) rows.push({ ...r, depth: 1 })
    }
    at = end
  }
  return rows
}

async function refresh($: any) {
  try {
    const { context } = await $.session.usage({ breakdown: 'full' })
    const b = context.breakdown
    if (!b) {
      await update($, note, () => 'No breakdown available yet.')
      return
    }
    const rl = await read($, rules)
      const rd = await read($, reads)
      await update($, map, () => layout(b, rl, rd))
    const cells: Cell[][] = (b.gridRows ?? []).map((row: any[]) =>
      row.map(q => ({ color: q.color, glyph: glyph(q) })),
    )
    const rowsOut: LegendRow[] = (b.categories ?? [])
      .filter((c: any) => c.kind !== 'deferred')
      .map((c: any) => ({
        name: c.name,
        tokens: c.tokens,
        pct: b.rawMaxTokens ? (c.tokens / b.rawMaxTokens) * 100 : 0,
        color: c.color,
        kind: c.kind,
      }))
    await update($, grid, () => cells)
    await update($, legend, () => rowsOut)
    await update($, total, () => b.totalTokens)
    await update($, win, () => b.rawMaxTokens)
    await update($, note, () => String(b.model))
  } catch (err) {
    await update($, note, () => `Measure failed: ${String(err)}`)
  }
}

export const register: Register = on => {
  on('prompt.context', async ($, e, next) => {
    const out = await next(e)
    const files = out.instructionFiles ?? e.instructionFiles ?? []
    const list: MapRow[] = files.map(f => ({
      depth: 1,
      label: `rule ${f.kind}: ${f.path}`,
      start: 0,
      end: Math.ceil(f.content.length / 4),
    }))
    await update($, rules, () => list)
    return out
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const start = context.breakdown?.totalTokens ?? 0
    const ran = await next(e)
    const size = Math.ceil(String(ran.text ?? '').length / 4)
    const row: MapRow = { depth: 1, label: `read ${e.file_path}`, start, end: start + size }
    await update($, reads, list => [...list, row].slice(-100))
    return ran
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-map',
      description: 'Show every injected file/skill/rule with its token range',
    })
    return next(e)
  })

  on('command.run', { command: 'context-map' }, async $ => {
    await update($, isShown, () => true)
    await $.ui.open({ id: PANE, title: 'Context map' })
    await refresh($)
    $.ui.invalidate('ui.render')
    const rows = await read($, map)
    const used = await read($, total)
    const size = await read($, win)
    const model = await read($, note)
    const cells = await read($, grid)
    const leg = await read($, legend)
    // No surface draws plugin UI here, so the reply itself carries the picture.
    const dots = ['🟦', '🟪', '🟩', '🟨', '🟧', '🟥', '🟫']
    const mark: Record<string, string> = {}
    leg.forEach((l, i) => {
      mark[l.color] = l.kind === 'free' ? '⬜' : l.kind === 'buffer' ? '⬛' : (dots[i % dots.length] ?? '🟦')
    })
    const picture = cells.map(row => row.map(c => mark[c.color] ?? '⬜').join(''))
    const key = leg.map(
      l => `${mark[l.color]} ${l.name}: ${fmtK(l.tokens)} tokens (${l.pct.toFixed(1)}%)`,
    )
    const lines = rows.map(
      r => `${r.depth > 0 ? '  ' : ''}${r.label} [${fmt(r.start)}-${fmt(r.end)}]`,
    )
    const pct = size ? Math.round((used / size) * 100) : 0
    return {
      text: [
        'Context Usage',
        `${model} · ${fmtK(used)}/${fmtK(size)} tokens (${pct}%)`,
        '',
        ...picture,
        '',
        ...key,
        '',
        'Token map (start-end, estimates):',
        ...lines,
      ].join('\n'),
    }
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return view(Box, Text, {
      model: await read($, note),
      used: await read($, total),
      size: await read($, win),
      grid: await read($, grid),
      legend: await read($, legend),
      rows: await read($, map),
      note: 'Estimates; sections laid end to end.',
    })
  })

  // The phone draws no pane, so there the same view is a band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'mobile' || !(await read($, isShown))) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {view(Box, Text, {
          model: await read($, note),
          used: await read($, total),
          size: await read($, win),
          grid: await read($, grid),
          legend: await read($, legend),
          rows: await read($, map),
          note: 'Estimates; sections laid end to end.',
        })}
        <Button key="hide" label="Hide" onPress={() => update($, isShown, () => false)} />
      </Box>
    )
  })
}
