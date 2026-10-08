import type { Segment, SegmentKind } from '../types'

/** Characters per token until `/inspect count` calibrates it. */
export const DEFAULT_CHARS_PER_TOKEN = 4

export const keys = {
  system: (id: string) => `sys:${id}`,
  context: (name: string) => `ctx:${name}`,
  rule: (path: string) => `rule:${path}`,
  attachment: (type: string, text: string) => `att:${type}:${hash(text)}`,
  attachmentType: (type: string) => `type:${type}`,
  listing: (name: string) => `listing:${name}`,
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

export function estimate(chars: number, charsPerToken: number): number {
  return chars <= 0 ? 0 : Math.max(1, Math.round(chars / charsPerToken))
}

export function preview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

/** What an attachment is, for the pane: rules, the listing, or a reminder. */
export function kindOfAttachment(type: string): SegmentKind {
  if (type === 'nested_memory' || type === 'instructions') return 'rule'
  if (type === 'skill_listing') return 'listing'

  return 'reminder'
}

/** A file path the attachment names (`Contents of /x/CLAUDE.md:`), or its first line. */
export function labelOfAttachment(type: string, text: string): string {
  const path = /[Cc]ontents of (\S+?):?(?:\s|$)/.exec(text)?.[1]
  if (path !== undefined) return path
  const first = text.split('\n').find(line => line.trim() !== '') ?? ''

  return first.trim().slice(0, 80) || type
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
  for (const m of text.matchAll(entry)) {
    spans.push({ name: m[1] ?? '', offset: m.index ?? 0, chars: m[0].length })
  }

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
export function spansOfFiles(
  block: string,
  files: readonly { path: string; content: string }[],
): (Span | null)[] {
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

/**
 * Merges what a render saw into the list: new keys are added (and returned),
 * known ones keep when and where they first arrived and take the new text.
 */
export function merge(
  list: readonly Segment[],
  seen: readonly Segment[],
  options: { zone?: Segment['zone']; parent?: string } = {},
): { list: Segment[]; added: Segment[]; changed: Segment[] } {
  const byKey = new Map(list.map(s => [s.key, s]))
  const added: Segment[] = []
  const changed: Segment[] = []
  for (const s of seen) {
    const old = byKey.get(s.key)
    if (old === undefined) {
      byKey.set(s.key, s)
      added.push(s)
      continue
    }
    const isChanged = old.chars !== s.chars || old.preview !== s.preview
    if (isChanged) changed.push(s)
    byKey.set(s.key, {
      ...s,
      turn: old.turn,
      firstSeenAt: old.firstSeenAt,
      anchor: old.anchor ?? s.anchor,
      order: s.zone === 'conversation' ? old.order : s.order,
      hits: old.hits + 1,
      exactTokens: isChanged ? null : old.exactTokens,
    })
  }
  // A system section or context block missing from this render is no longer sent.
  const seenKeys = new Set(seen.map(s => s.key))
  if (options.zone !== undefined) {
    for (const [key, s] of byKey) {
      const isSameScope = s.zone === options.zone && s.parent === (options.parent ?? s.parent)
      if (isSameScope && !seenKeys.has(key) && s.isPresent) byKey.set(key, { ...s, isPresent: false })
    }
  }

  return { list: [...byKey.values()], added, changed }
}

export type Placed = Segment & {
  /** 1-based row number, the same in the pane and in `/inspect list`. */
  n: number
  tokens: number
  start: number | null
  end: number | null
  isRemoved: boolean
}

/** Whether the removal list takes this segment out: by key, type or parent. */
export function isRemoved(s: Segment, removed: ReadonlySet<string>, byKey: ReadonlyMap<string, Segment>): boolean {
  if (removed.has(s.key)) return true
  if (s.attachment !== null && removed.has(keys.attachmentType(s.attachment))) return true
  const parent = s.parent === null ? undefined : byKey.get(s.parent)

  return parent !== undefined && isRemoved(parent, removed, byKey)
}

/**
 * Every segment with its token range in the request, in prompt order: tools,
 * then the system prompt's sections, then the first message's context
 * blocks (rules inside `claudeMd`), then what arrived later in the
 * conversation, each at the conversation's size when it arrived. A removed
 * segment takes no room and has no range.
 */
export function layout(
  segments: readonly Segment[],
  removedKeys: readonly string[],
  charsPerToken: number,
  toolsTokens: number | null,
): Placed[] {
  const removed = new Set(removedKeys)
  const byKey = new Map(segments.map(s => [s.key, s]))
  const childrenOf = new Map<string, Segment[]>()
  for (const s of segments) {
    if (s.parent === null) continue
    childrenOf.set(s.parent, [...(childrenOf.get(s.parent) ?? []), s])
  }
  const out: Placed[] = []
  const gone = (s: Segment) => isRemoved(s, removed, byKey)
  const tokensOf = (s: Segment) => s.exactTokens ?? estimate(s.chars, charsPerToken)

  /** Places a top-level segment at `start` and its children inside it; answers its size. */
  const place = (s: Segment, start: number | null): number => {
    const children = (childrenOf.get(s.key) ?? []).sort((a, b) => a.offsetChars - b.offsetChars)
    const isGone = gone(s) || (start === null && s.zone !== 'conversation')
    const cutChars = children.filter(c => gone(c) && !gone(s)).reduce((sum, c) => sum + c.chars, 0)
    const whole = tokensOf(s)
    const tokens = isGone ? 0 : Math.max(0, whole - estimate(cutChars, charsPerToken))
    const at = isGone ? null : start
    out.push({ ...s, n: 0, tokens: isGone ? whole : tokens, start: at, end: at === null ? null : at + tokens, isRemoved: gone(s) })
    let cutBefore = 0
    for (const c of children) {
      const cTokens = tokensOf(c)
      const cGone = gone(c) || at === null
      const cStart = cGone || at === null ? null : at + estimate(c.offsetChars - cutBefore, charsPerToken)
      out.push({ ...c, n: 0, tokens: cTokens, start: cStart, end: cStart === null ? null : cStart + cTokens, isRemoved: gone(c) })
      if (gone(c)) cutBefore += c.chars
    }

    return tokens
  }

  let cursor = toolsTokens ?? 0
  const top = (zone: Segment['zone']) =>
    segments.filter(s => s.zone === zone && s.parent === null).sort((a, b) => a.order - b.order)
  for (const zone of ['system', 'context'] as const) {
    const list = top(zone)
    for (const s of list.filter(s => s.isPresent)) cursor += place(s, cursor)
    for (const s of list.filter(s => !s.isPresent)) place(s, null)
  }
  const prefixEnd = cursor
  for (const s of top('conversation')) place(s, s.anchor ?? prefixEnd)

  return out.map((p, i) => ({ ...p, n: i + 1 }))
}

/** `12`, `950`, `1.2k`, `41.7k`. */
export function fmt(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`
}

export function rangeOf(p: Placed): string {
  if (p.isRemoved) return 'removed'
  if (p.start === null || p.end === null) return 'not sent'

  return `${fmt(p.start)}–${fmt(p.end)}`
}

/** Rows the focus filter keeps: rules, skills, the listing and `claudeMd`. */
export function isFocus(p: Placed): boolean {
  return p.kind === 'rule' || p.kind === 'skill' || p.kind === 'listing' || p.key === keys.context('claudeMd')
}

/** One line per segment, columns aligned, for the pane and `/inspect list`. */
export function row(p: Placed, width: number): string {
  const mark = p.isRemoved ? '✗' : '✓'
  const tok = `${p.exactTokens === null ? '≈' : ''}${fmt(p.tokens)}`
  const where = p.agent === null ? `t${p.turn}` : `t${p.turn}·sub`
  const head = `${mark} ${String(p.n).padStart(3)} ${rangeOf(p).padEnd(13)} ${tok.padStart(6)} ${p.kind.padEnd(8)} ${where.padEnd(7)} `
  const indent = p.parent === null ? '' : '  └ '
  const room = Math.max(10, width - head.length - indent.length)
  const label = p.label.length > room ? `…${p.label.slice(p.label.length - room + 1)}` : p.label

  return `${head}${indent}${label}`
}

/** A row for a command's output: `row` where it fits, two short lines on a narrow screen. */
export function compactRow(p: Placed, isNarrow: boolean): string {
  if (!isNarrow) return row(p, 120)
  const mark = p.isRemoved ? '✗' : '✓'
  const tok = `${p.exactTokens === null ? '≈' : ''}${fmt(p.tokens)} tok`
  const where = p.agent === null ? `t${p.turn}` : `t${p.turn} subagent`
  const indent = p.parent === null ? '' : '└ '

  return `#${p.n} ${mark} ${p.kind} · ${rangeOf(p)} · ${tok} · ${where}\n    ${indent}${p.label}`
}
