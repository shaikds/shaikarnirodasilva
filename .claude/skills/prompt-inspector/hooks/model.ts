import type { BlockChange, Change, Piece, Position, Step, SystemSnapshot } from '../types'

export const keys = {
  section: (id: string) => `sys:${id}`,
  context: (name: string) => `ctx:${name}`,
  rule: (path: string) => `rule:${path}`,
  attachment: (type: string, text: string) => `att:${type}:${hash(text)}`,
  attachmentType: (type: string) => `type:${type}`,
  skillLine: (name: string) => `listing:${name}`,
  skill: (name: string) => `skill:${name}`,
  copy: (group: string) => `copy:${group}`,
  /** Another injection of a piece already listed: the message it arrived with tells them apart. */
  instance: (key: string, message: number) => `${key}@${message}`,
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

/** Where a text is kept, and what its exact count is cached by. */
export const textKey = (text: string) => `${hash(text)}:${text.length}`

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
 * of the header line naming its path to the end of its content. The engine
 * renders a file's content trimmed, so the trimmed text is what is found.
 * Files are searched for in render order, so two files with the same text
 * each get one.
 */
export function spansOfFiles(block: string, files: readonly { path: string; content: string }[]): (Span | null)[] {
  let from = 0

  return files.map(file => {
    const content = file.content.trim()
    const needle = content.length > 0 ? content : file.path
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

/**
 * The requests whose `end` is exactly their last block's end: those that left
 * only the closing tokens uncached. The closing count is the fewest uncached
 * tokens any candidate left (2 on Claude's current models); a request that left
 * more has text after its cache mark, so it places nothing.
 */
export function exactSteps(steps: readonly Step[]): Set<number> {
  const candidates = steps.filter(s => s.isAnchor)
  const closing = Math.min(...candidates.map(s => s.uncached))

  return new Set(candidates.filter(s => s.uncached === closing).map(s => s.id))
}

/** One block of a message as `$.session.messages({ as: 'api' })` gives it. */
export type ApiBlock = { type: string; [field: string]: unknown }

/**
 * A request's blocks in order, every message's: a text block by its text's
 * key, any other block by `x:` and a hash of it, and `m:<role>` where each
 * message begins (a message's own framing costs tokens no text count gives).
 */
export function flatKeys(messages: readonly { role: string; content: readonly ApiBlock[] }[]): { keys: string[]; texts: Record<string, string> } {
  const out: string[] = []
  const texts: Record<string, string> = {}
  for (const message of messages) {
    out.push(`m:${message.role}`)
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        const key = textKey(block.text)
        texts[key] = block.text
        out.push(key)
      } else {
        out.push(`x:${hash(JSON.stringify(block))}`)
      }
    }
  }

  return { keys: out, texts }
}

const isText = (key: string | undefined) => key !== undefined && !key.startsWith('x:') && !key.startsWith('m:')

/** How far ahead the diff looks for blocks taken out or put in together. */
const RUN = 32

/**
 * How a request's blocks differ from the request before's, up to where the
 * old ones end (what follows is new). Text blocks taken out, put in or
 * changed are listed; at any other difference (a message's boundary, a block
 * that is not text) the diff stops, and nothing from there on is placed.
 */
export function diffBlocks(old: readonly string[], next: readonly string[]): { blocks: BlockChange[]; brokenAt: number | null } {
  const blocks: BlockChange[] = []
  let i = 0
  let j = 0
  while (i < old.length) {
    const a = old[i] ?? ''
    const b = next[j]
    if (a === b) {
      i++
      j++
      continue
    }
    // Text blocks taken out: the old ones from i up to where the new one turns up again.
    const resume = old.indexOf(b ?? '\0', i + 1)
    if (b !== undefined && resume > i && resume - i <= RUN && old.slice(i, resume).every(isText)) {
      for (let k = i; k < resume; k++) blocks.push({ at: k, before: old[k] ?? null, after: null })
      i = resume
      continue
    }
    // The old request's last blocks taken out, new messages after them.
    if (old.slice(i).every(isText) && old.length - i <= RUN && (b === undefined || b.startsWith('m:'))) {
      for (let k = i; k < old.length; k++) blocks.push({ at: k, before: old[k] ?? null, after: null })
      i = old.length
      continue
    }
    // Text blocks put in before old block i.
    const back = next.indexOf(a, j + 1)
    if (back > j && back - j <= RUN && next.slice(j, back).every(isText)) {
      for (let k = j; k < back; k++) blocks.push({ at: i, before: null, after: next[k] ?? null })
      j = back
      continue
    }
    // One text block changed in place.
    if (isText(a) && isText(b) && (old[i + 1] === next[j + 1] || i + 1 === old.length)) {
      blocks.push({ at: i, before: a, after: b ?? null })
      i++
      j++
      continue
    }

    return { blocks, brokenAt: i }
  }

  return { blocks, brokenAt: null }
}

/** How the system prompt changed between two requests. */
export function systemChange(before: SystemSnapshot | null, after: SystemSnapshot | null): 'same' | 'tools' | { before: readonly string[]; after: readonly string[] } {
  if (before === null || after === null) return before === after ? 'same' : 'tools'
  if (before.tools !== after.tools) return 'tools'
  if (before.sides.join('|') === after.sides.join('|')) return 'same'

  return { before: before.sides, after: after.sides }
}

/** Where `text` occurs for the n-th time in `within` (0 first), or -1. */
function nthIndex(within: string, text: string, n: number): number {
  let at = -1
  for (let k = 0; k <= n; k++) {
    at = within.indexOf(text, at + 1)
    if (at < 0) return -1
  }

  return at
}

/** How many times `text` occurs in `within` before `offset`. */
function occurrencesBefore(within: string, text: string, offset: number): number {
  let n = 0
  for (let at = within.indexOf(text); at >= 0 && at < offset; at = within.indexOf(text, at + 1)) n++

  return n
}

/** A piece carried to a later request: where it is now, where it was when taken out, or why it can't be told. */
export type Carried = { kind: 'at'; at: Position; step: number } | { kind: 'gone'; was: { start: number; end: number }; step: number } | { kind: 'lost'; reason: string; step: number }

export const LOST = {
  unseen: 'the prompt before it changed in a way the inspector did not see',
  tools: 'the tools offered changed',
  broken: 'the conversation before it changed (compaction, or an edit that can’t be counted)',
  text: 'a text it depends on was not kept',
}

/**
 * Carries a piece's position from request `from` to each later request in
 * turn. It stays where it was when the cache proves everything up to its end
 * unchanged. Otherwise each block that changed before it moves it by exactly
 * the tokens it gained or lost (counted whole, as sent); its own block
 * changing finds it in the new block, or finds it taken out. Anything that
 * can't be counted makes it lost: never a guess.
 *
 * `count` answers a text's exact tokens, or null; run it once collecting the
 * texts it asks for, count them, then again with the counts.
 */
export function carry(
  at: Position,
  from: number,
  text: string,
  tokens: number,
  steps: readonly Step[],
  texts: Readonly<Record<string, string>>,
  count: (text: string) => number | null,
): Carried {
  let pos = at
  let step = from
  for (const s of steps) {
    if (s.id <= from) continue
    // The cache proves everything up to the piece's end the same as in the request before.
    if (s.cacheRead >= pos.end) {
      step = s.id
      continue
    }
    const change = s.change
    if (change.kind === 'unknown') return { kind: 'lost', reason: LOST.unseen, step }
    if (change.system === 'tools') return { kind: 'lost', reason: LOST.tools, step }
    if (change.brokenAt !== null && change.brokenAt <= pos.block) return { kind: 'lost', reason: LOST.broken, step }
    let shift = 0
    let isCounted = true
    const add = (t: string | undefined, sign: number) => {
      if (t === undefined) {
        isCounted = false

        return
      }
      const n = t.length === 0 ? 0 : count(t)
      if (n === null) isCounted = false
      else shift += sign * n
    }
    if (change.system !== 'same') {
      for (const key of change.system.after) add(texts[key], 1)
      for (const key of change.system.before) add(texts[key], -1)
    }
    let block = pos.block
    let offset = pos.offset
    let key = pos.key
    for (const c of change.blocks) {
      if (c.at > pos.block) break
      const before = c.before === null ? null : texts[c.before]
      const after = c.after === null ? null : texts[c.after]
      if (before === undefined || after === undefined) return { kind: 'lost', reason: LOST.text, step }
      if (c.before === null) {
        // Put in before the piece's block.
        add(after ?? '', 1)
        block++
        continue
      }
      if (c.at < pos.block) {
        add(before ?? '', -1)
        if (after === null) block--
        else add(after, 1)
        continue
      }
      // Its own block: taken out, or changed (find the same occurrence of its text in the new one).
      if (after === null || before === null) return { kind: 'gone', was: { start: pos.start, end: pos.end }, step }
      const newOffset = nthIndex(after, text, occurrencesBefore(before, text, pos.offset))
      if (newOffset < 0) return { kind: 'gone', was: { start: pos.start, end: pos.end }, step }
      // From the block's start: its whole text less the text from the piece to its end (only texts that end the block are counted).
      add(after, 1)
      add(after.slice(newOffset), -1)
      add(before, -1)
      add(before.slice(pos.offset), 1)
      offset = newOffset
      key = c.after ?? key
    }
    if (!isCounted) return { kind: 'lost', reason: LOST.text, step }
    const start = pos.start + shift
    pos = { start, end: start + tokens, block, offset, key }
    step = s.id
  }

  return { kind: 'at', at: pos, step }
}

/**
 * Carries where the first message begins (the end of tools + system prompt):
 * only the system prompt changing moves it.
 */
export function carryStart(at: number, from: number, steps: readonly Step[], texts: Readonly<Record<string, string>>, count: (text: string) => number | null): number | null {
  let start = at
  for (const s of steps) {
    if (s.id <= from || s.cacheRead >= start) continue
    if (s.change.kind === 'unknown' || s.change.system === 'tools') return null
    if (s.change.system === 'same') continue
    for (const [side, sign] of [
      [s.change.system.after, 1],
      [s.change.system.before, -1],
    ] as const) {
      for (const key of side) {
        const t = texts[key]
        const n = t === undefined ? null : count(t)
        if (n === null) return null
        start += sign * n
      }
    }
  }

  return start
}

/** An attachment's name: its type, and the gist of its first line (tags left out). */
export function attachmentLabel(type: string, text: string): string {
  const gist = firstLine(text.replace(/<[^>\n]*>/g, ' ').replace(/[ \t]+/g, ' '))
  const name = type.replace(/_/g, ' ')

  return gist === '' ? name : `${name}: ${gist}`
}

/** Whether a set of gone keys takes this piece out: by key, by group, by attachment type, or by its parent. */
export function isGone(p: Piece, gone: ReadonlySet<string>, byKey: ReadonlyMap<string, Piece>): boolean {
  if (gone.has(p.key) || gone.has(p.group)) return true
  if (p.attachment !== null && gone.has(keys.attachmentType(p.attachment))) return true
  const parent = p.parent === null ? undefined : byKey.get(p.parent)

  return parent !== undefined && isGone(parent, gone, byKey)
}

/** One line of the inspector: a piece, or a stretch of the prompt that is no piece. */
export type Row = {
  key: string
  /** What 🗑 and 🔄 act on. */
  group: string
  label: string
  kind: Piece['kind'] | 'filler'
  isYours: boolean
  /** Exact range in the last request; null when not in it or not measured. */
  start: number | null
  end: number | null
  tokens: number | null
  message: number | null
  isDeleted: boolean
  /** Moved by 🔄 to ride with a later message. */
  isMoved: boolean
  isCopy: boolean
  /** Where it was in the last request that carried it, once taken out. */
  was: { start: number; end: number } | null
  /** Why there is no range. */
  note: string | null
  isActionable: boolean
}

/**
 * Every piece's row: its exact range in the last request when it was carried
 * there by proof (see `carry`), or why not. `removed` and `moved` are what the
 * person asked for; a skill's text already sent stays in its place.
 */
export function layout(pieces: readonly Piece[], steps: readonly Step[], removed: ReadonlySet<string>, moved: ReadonlySet<string>): { rows: Row[]; total: number | null } {
  const last = steps[steps.length - 1]
  const byKey = new Map(pieces.map(p => [p.key, p]))
  const rows: Row[] = pieces.map(p => {
    const isCopy = p.copyOf !== null
    const isDeleted = isCopy ? removed.has(p.group) : isGone(p, removed, byKey)
    const isMoved = !isCopy && !isDeleted && moved.has(p.group)
    const at = p.at
    const isHere = last !== undefined && at !== null && p.step !== null && steps.every(s => s.id <= (p.step ?? 0) || s.cacheRead >= at.end)
    const note =
      p.zone === 'system'
        ? 'inside tools + system prompt (position not measured)'
        : p.was !== null
          ? null
          : p.lost !== null
            ? `not measured: ${p.lost}`
            : p.isEarlier && !isHere
              ? 'sent before the inspector started (not measured)'
              : p.step === null
                ? 'arrives with your next message'
                : isHere
                  ? null
                  : 'not measured'

    return {
      key: p.key,
      group: p.group,
      label: p.label,
      kind: p.kind,
      isYours: p.isYours,
      start: isHere && p.at !== null ? p.at.start : null,
      end: isHere && p.at !== null ? p.at.end : null,
      tokens: p.tokens,
      message: p.zone === 'system' ? null : p.message,
      isDeleted,
      isMoved,
      isCopy,
      was: p.was,
      note,
      isActionable: true,
    }
  })
  const startOf = (r: Row) => r.start ?? r.was?.start ?? -1
  rows.sort((a, b) => startOf(a) - startOf(b))

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
    group: `filler:${from}`,
    label,
    kind: 'filler',
    isYours: false,
    start: from,
    end: to,
    tokens: to - from,
    message: null,
    isDeleted: false,
    isMoved: false,
    isCopy: false,
    was: null,
    note: null,
    isActionable: false,
  })
  let cursor = 0
  if (systemEnd !== null) {
    out.push(filler(0, systemEnd, 'tools + system prompt'))
    cursor = systemEnd
  }
  // Without the first request, where tools + system prompt end is not known: the first stretch holds both.
  const gap = () => (cursor === 0 ? 'tools + system prompt + conversation' : 'conversation')
  // Top-level pieces only set the cursor; a piece inside another (a rule in claudeMd) does not.
  for (const r of placed) {
    if ((r.start ?? 0) > cursor) out.push(filler(cursor, r.start ?? 0, gap()))
    out.push(r)
    cursor = Math.max(cursor, r.end ?? cursor)
  }
  if (total !== null && total > cursor) out.push(filler(cursor, total, gap()))
  const isSystem = (r: Row) => r.note?.startsWith('inside') ?? false

  return [...others.filter(isSystem), ...out, ...others.filter(r => !isSystem(r))]
}

/** The piece card's line: the exact range, size and message, or why there is no range. */
export function describe(r: Row): string {
  const size = r.tokens === null ? 'size not measured' : `${int(r.tokens)} tok`
  const from = r.message === null || r.message === 0 ? '' : ` · message ${r.message}`
  const was = r.was === null ? '' : ` · was ${int(r.was.start)} → ${int(r.was.end)}`
  if (r.kind === 'filler') return `${int(r.start ?? 0)} → ${int(r.end ?? 0)} · ${size}`
  const range = r.start !== null && r.end !== null ? `${int(r.start)} → ${int(r.end)}` : null
  if (r.isDeleted && r.kind === 'skill') return `${range ?? r.note ?? 'not measured'} · later uses stopped · ${size}${from}`
  if (r.isDeleted) return range === null ? `deleted${was} · ${size}${from}` : `${range} · deleted from your next message · ${size}${from}`
  if (r.isMoved) return range === null ? `moved to the end${was} · ${size}${from}` : `${range} · moves to the end with your next message · ${size}${from}`
  if (range !== null) return `${range} · ${size}${from}`

  return `${r.note ?? 'not measured'} · ${size}${from}`
}

/** A name short enough for a card's choice: a path keeps its end (the file and its folder). */
export function shortName(label: string, width = 40): string {
  if (label.length <= width) return label

  return label.includes('/') ? `…${label.slice(label.length - width + 1)}` : `${label.slice(0, width - 1)}…`
}

/** A card choice: the name, then its exact range in brief (a card's choices carry one line each). */
export function cardLabel(r: Row): string {
  const name = r.kind === 'filler' ? `▒ ${r.label}` : shortName(r.label)
  const range = r.start !== null && r.end !== null ? `${int(r.start)}–${int(r.end)}` : null
  const was = r.was === null ? '' : `, was ${int(r.was.start)}–${int(r.was.end)}`
  const state =
    r.isDeleted && r.kind === 'skill'
      ? `${range ?? 'not measured'}, later uses stopped`
      : r.isDeleted
        ? range === null
          ? `deleted${was}`
          : `${range}, deleted`
        : r.isMoved
          ? range === null
            ? `moved${was}`
            : `${range}, moving`
          : (range ??
            ((r.note ?? '').startsWith('inside') ? 'in system prompt' : (r.note ?? '').startsWith('arrives') ? 'next message' : 'not measured'))

  return `${name} · ${state}`
}

/** The row that holds a token position, the innermost when nested. */
export function rowAt(rows: readonly Row[], offset: number): Row | undefined {
  const holding = rows.filter(r => r.start !== null && r.end !== null && r.start <= offset && offset < r.end)

  return holding.sort((a, b) => (a.end ?? 0) - (a.start ?? 0) - ((b.end ?? 0) - (b.start ?? 0)))[0]
}

/** A typed token position (`58002`, `58,002`, `58.002`, `58 002`), or null for anything else. */
export function typedPosition(answer: string): number | null {
  if (!/^[\d.,\s'’_]+$/.test(answer) || !/\d/.test(answer)) return null

  return Number(answer.replace(/[.,\s'’_]/g, ''))
}

export type { Change }
