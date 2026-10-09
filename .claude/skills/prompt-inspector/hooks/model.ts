import type { Piece, Step } from '../types'

export const keys = {
  section: (id: string) => `sys:${id}`,
  context: (name: string) => `ctx:${name}`,
  rule: (path: string) => `rule:${path}`,
  attachment: (type: string, text: string) => `att:${type}:${hash(text)}`,
  attachmentType: (type: string) => `type:${type}`,
  skillLine: (name: string) => `listing:${name}`,
  skill: (name: string) => `skill:${name}`,
}

/** FNV-1a, 32 bits, hex: a short stable id for a text. */
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }

  return (h >>> 0).toString(16).padStart(8, '0')
}

/** `58002` as `58,002`. */
export function int(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A file path an attachment names (`Contents of /x/CLAUDE.md:`), or null. */
export function pathOfAttachment(text: string): string | null {
  return /[Cc]ontents of (\S+?):?(?:\s|$)/.exec(text)?.[1] ?? null
}

/** The first line of a text, for a piece with no better name. */
export function firstLine(text: string): string {
  return (text.split('\n').find(line => line.trim() !== '') ?? '').trim().slice(0, 60)
}

export type Span = { name: string; offset: number; chars: number }

/**
 * The entries of a skill listing: each line `- name: ...` or
 * `- name (source): ...` and the lines that continue it, up to a blank line
 * or the next entry.
 */
export function parseListing(text: string): Span[] {
  const spans: Span[] = []
  const entry = /^- (\S+?)(?: \([^)\n]*\))?:(?= |$)[^\n]*(?:\n(?!- |\n)[^\n]*)*/gm
  for (const m of text.matchAll(entry)) spans.push({ name: m[1] ?? '', offset: m.index ?? 0, chars: m[0].length })

  return spans
}

/** The text with the spans cut out, each with the line breaks that follow it. */
export function cutSpans(text: string, spans: readonly (Span | null)[]): string {
  const cut = spans.filter((span): span is Span => span !== null).sort((a, b) => b.offset - a.offset)
  let out = text
  for (const span of cut) {
    let end = span.offset + span.chars
    while (out[end] === '\n') end++
    out = out.slice(0, span.offset) + out.slice(end)
  }

  return out
}

/** The listing with the named entries cut out. */
export function filterListing(text: string, drop: ReadonlySet<string>): string {
  return cutSpans(text, parseListing(text).filter(span => drop.has(span.name)))
}

/**
 * Where each instruction file lies in the `claudeMd` block: from the start
 * of the header line naming its path to the end of its content. Files are
 * searched for in render order, so two files with the same text each get one.
 */
export function spansOfFiles(block: string, files: readonly { path: string; content: string }[]): (Span | null)[] {
  let from = 0

  return files.map(file => {
    const needle = file.content.length > 0 ? file.content : file.path
    const at = block.indexOf(needle, from)
    if (at < 0) return null
    const head = block.lastIndexOf(file.path, at)
    const start = head >= from && at - head < file.path.length + 300 ? block.lastIndexOf('\n', head) + 1 : at
    const end = at + needle.length
    from = end

    return { name: file.path, offset: start, chars: end - start }
  })
}

/** Where a piece's text lies in a request's last message: the block, and the offset in it. */
export type Located = { block: number; offset: number }

/** Finds `text` in the blocks, the last occurrence first (an injection rides at the tail). */
export function locate(blocks: readonly string[], text: string): Located | null {
  if (text.length === 0) return null
  for (let block = blocks.length - 1; block >= 0; block--) {
    const offset = (blocks[block] ?? '').lastIndexOf(text)
    if (offset >= 0) return { block, offset }
  }

  return null
}

/**
 * The texts whose exact token counts place a piece found at `at`: every
 * block after its own, the rest of its own block after it, and the piece.
 */
export function textsToCount(blocks: readonly string[], at: Located, text: string): { after: string[]; suffix: string } {
  const own = blocks[at.block] ?? ''

  return { after: blocks.slice(at.block + 1), suffix: own.slice(at.offset + text.length) }
}

/**
 * A piece's exact range in its request: the request's content ends at `end`
 * (cache read + cache write, where its last block ends), and the piece ends
 * where everything after it begins.
 */
export function rangeFromEnd(end: number, afterTokens: number, suffixTokens: number, pieceTokens: number): { start: number; end: number } {
  const pieceEnd = end - afterTokens - suffixTokens

  return { start: pieceEnd - pieceTokens, end: pieceEnd }
}

/** Every key taken out of the prompt: deleted, or moved to ride with a later message. */
export function goneKeys(removed: readonly string[], moved: readonly string[]): Set<string> {
  return new Set([...removed, ...moved])
}

/** Whether a set of gone keys takes this piece out: by key, by attachment type, or by its parent. */
export function isGone(p: Piece, gone: ReadonlySet<string>, byKey: ReadonlyMap<string, Piece>): boolean {
  if (gone.has(p.key)) return true
  if (p.attachment !== null && gone.has(keys.attachmentType(p.attachment))) return true
  const parent = p.parent === null ? undefined : byKey.get(p.parent)

  return parent !== undefined && isGone(parent, gone, byKey)
}

/** One line of the inspector: a piece, or a stretch of the prompt that is no piece. */
export type Row = {
  key: string
  label: string
  kind: Piece['kind'] | 'filler'
  isYours: boolean
  /** Exact range in the last request; null when not sent or not measured. */
  start: number | null
  end: number | null
  tokens: number | null
  message: number | null
  isDeleted: boolean
  /** Where it was when last sent, for a deleted piece. */
  was: { start: number; end: number } | null
  /** Why there is no range. */
  note: string | null
  isActionable: boolean
}

/**
 * Every piece's exact range in the last request. A piece measured in an
 * earlier request moves by the exact size of each piece wholly before that
 * point which was taken out or put back since (a parent's end also moves for
 * a piece inside it).
 */
export function layout(pieces: readonly Piece[], steps: readonly Step[], gone: ReadonlySet<string>): { rows: Row[]; total: number | null } {
  const anchors = steps.filter(s => s.isAnchor)
  const last = anchors[anchors.length - 1]
  const byKey = new Map(pieces.map(p => [p.key, p]))
  const stepById = new Map(steps.map(s => [s.id, s]))
  const lastGone = new Set(last?.gone ?? [])
  const measured = pieces.filter(p => p.start !== null && p.end !== null && p.step !== null)

  /** How far a point of request `then` moved by the last request. */
  const moveOf = (x: number, then: ReadonlySet<string>, self: Piece): number => {
    let delta = 0
    for (const q of measured) {
      if (q === self || (q.end ?? Infinity) > x) continue
      const sentThen = !isGone(q, then, byKey)
      const sentLast = !isGone(q, lastGone, byKey)
      if (sentThen !== sentLast) delta += (sentLast ? 1 : -1) * (q.removalTokens ?? q.tokens ?? 0)
    }

    return delta
  }

  const rows: Row[] = pieces.map(p => {
    const isDeleted = isGone(p, gone, byKey)
    const step = p.step === null ? undefined : stepById.get(p.step)
    const then = new Set(step?.gone ?? [])
    const position =
      p.start === null || p.end === null || step === undefined
        ? null
        : { start: p.start + moveOf(p.start, then, p), end: p.end + moveOf(p.end, then, p) }
    const wasSentLast = last !== undefined && step !== undefined && step.id <= last.id && !isGone(p, lastGone, byKey)
    const note =
      p.zone === 'system'
        ? 'inside tools + system prompt (position not measured)'
        : p.isEarlier
          ? 'sent before the inspector started (not measured)'
          : p.step === null
            ? 'arrives with your next message'
            : position === null
              ? 'not measured'
              : null

    return {
      key: p.key,
      label: p.label,
      kind: p.kind,
      isYours: p.isYours,
      start: wasSentLast && position !== null ? position.start : null,
      end: wasSentLast && position !== null ? position.end : null,
      tokens: p.tokens,
      message: p.message,
      isDeleted,
      was: position,
      note,
      isActionable: true,
    }
  })
  const at = (r: Row) => r.start ?? r.was?.start ?? -1
  rows.sort((a, b) => at(a) - at(b))

  return { rows, total: last === undefined ? null : last.total }
}

/**
 * The view `/inspect all` lists: from token 0 to the last request's last
 * token, every piece in place and an unnamed filler line for each stretch
 * between them (tools and system prompt first, then the conversation).
 */
export function withFillers(rows: readonly Row[], total: number | null, systemEnd: number | null): Row[] {
  const placed = rows.filter(r => r.start !== null && r.end !== null && r.isActionable)
  const others = rows.filter(r => !(r.start !== null && r.end !== null))
  const out: Row[] = []
  const filler = (from: number, to: number, label: string): Row => ({
    key: `filler:${from}`,
    label,
    kind: 'filler',
    isYours: false,
    start: from,
    end: to,
    tokens: to - from,
    message: null,
    isDeleted: false,
    was: null,
    note: null,
    isActionable: false,
  })
  let cursor = 0
  if (systemEnd !== null) {
    out.push(filler(0, systemEnd, 'tools + system prompt'))
    cursor = systemEnd
  }
  // Top-level pieces only set the cursor; a piece inside another (a rule in claudeMd) does not.
  for (const r of placed) {
    if ((r.start ?? 0) > cursor) out.push(filler(cursor, r.start ?? 0, 'conversation'))
    out.push(r)
    cursor = Math.max(cursor, r.end ?? cursor)
  }
  if (total !== null && total > cursor) out.push(filler(cursor, total, 'conversation'))

  return [...others.filter(r => r.note?.startsWith('inside') ?? false), ...out, ...others.filter(r => !(r.note?.startsWith('inside') ?? false))]
}

/** One line for a card option's description: the exact range and size, or why there is none. */
export function describe(r: Row): string {
  const size = r.tokens === null ? 'size not measured' : `${int(r.tokens)} tok`
  const from = r.message === null || r.message === 0 ? '' : ` · message ${r.message}`
  if (r.kind === 'filler') return `${int(r.start ?? 0)} → ${int(r.end ?? 0)} · ${size}`
  if (r.isDeleted) return r.was === null ? `deleted · ${size}` : `deleted · was ${int(r.was.start)} → ${int(r.was.end)} · ${size}`
  if (r.start !== null && r.end !== null) return `${int(r.start)} → ${int(r.end)} · ${size}${from}`

  return `${r.note ?? 'not measured'} · ${size}`
}

/** A card choice: the name, then its exact range in brief (a card's choices carry one line each). */
export function cardLabel(r: Row): string {
  const name = r.kind === 'filler' ? `▒ ${r.label}` : r.label.slice(0, 40)
  const range = r.isDeleted
    ? r.was === null
      ? 'deleted'
      : `deleted, was ${int(r.was.start)}–${int(r.was.end)}`
    : r.start !== null && r.end !== null
      ? `${int(r.start)}–${int(r.end)}`
      : (r.note ?? '').startsWith('inside')
        ? 'in system prompt'
        : (r.note ?? '').startsWith('arrives')
          ? 'next message'
          : 'not measured'

  return `${name} · ${range}`
}

/** The row that holds a token position, the innermost when nested. */
export function rowAt(rows: readonly Row[], offset: number): Row | undefined {
  const holding = rows.filter(r => r.start !== null && r.end !== null && r.start <= offset && offset < r.end)

  return holding.sort((a, b) => (a.end ?? 0) - (a.start ?? 0) - ((b.end ?? 0) - (b.start ?? 0)))[0]
}
