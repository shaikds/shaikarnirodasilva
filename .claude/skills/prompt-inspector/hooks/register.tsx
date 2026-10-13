import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelTextBlock, ModelUsage, PromptAttachmentOrigin, Register } from 'claude-code'

import type { Change, Move, Piece, PieceKind, Position, Step, SystemSnapshot } from '../types'
import {
  attachmentLabel,
  cardLabel,
  carry,
  carryStart,
  cutSpans,
  describe,
  diffBlocks,
  exactSteps,
  filterListing,
  isInContext,
  blockOf,
  flatKeys,
  hash,
  type ApiBlock,
  int,
  keys,
  layout,
  LOST,
  parseListing,
  pathOfAttachment,
  rowAt,
  spansOfFiles,
  systemChange,
  takesSystemTurns,
  textKey,
  turnKey,
  toWire,
  typedPosition,
  withFillers,
  wireTail,
  wireMessages,
  locateInTail,
  cutTail,
  textBefore,
} from './model'
import type { Row, Span, WireAt, WireMessage } from './model'

const injectionsAtom = atom({ plugin: 'prompt-inspector', key: 'injections' } as const, [])
const requestsAtom = atom({ plugin: 'prompt-inspector', key: 'requests' } as const, [])
const textsAtom = atom({ plugin: 'prompt-inspector', key: 'texts' } as const, {})
const removedAtom = atom({ plugin: 'prompt-inspector', key: 'removed' } as const, [])
const movedAtom = atom({ plugin: 'prompt-inspector', key: 'moved' } as const, {})
const savedAtom = atom({ plugin: 'prompt-inspector', key: 'saved' } as const, {})
const messageAtom = atom({ plugin: 'prompt-inspector', key: 'message' } as const, 0)
const promptStartAtom = atom({ plugin: 'prompt-inspector', key: 'promptStart' } as const, null)
const userSkillsAtom = atom({ plugin: 'prompt-inspector', key: 'userSkills' } as const, [])
const systemAtom = atom({ plugin: 'prompt-inspector', key: 'system' } as const, null)

type Engine = EngineInterface

/** Kinds of instruction file that are yours (not your organization's policy, not auto-memory). */
const YOUR_FILES = new Set(['user', 'project', 'local'])

/** Attachment types that carry the person's own messages: never listed, never deleted. */
const PERSON_WORDS = new Set(['queued_command'])

/** The blocks of the last main request, to tell what the next one changed (kept by this module only). */
let previous: { keys: string[]; system: SystemSnapshot | null } | null = null

/** Where a block of a request as sent (`wireMessages`) sits among the request's blocks (what `carry` follows), and its key. */
function flatOf(sent: readonly ApiMessage[], origin: readonly { message: number; blocks: number[] }[]): (at: WireAt) => { block: number; key: string } {
  const markers: number[] = []
  let n = 0
  for (const m of sent) {
    markers.push(n)
    n += 1 + m.content.length
  }

  return at => {
    const from = origin[at.message]
    const k = from?.message ?? 0
    const j = from?.blocks[at.block] ?? 0
    const b = sent[k]?.content[j]

    return { block: (markers[k] ?? 0) + 1 + j, key: b !== undefined && b.type === 'text' && typeof b.text === 'string' ? (b.isSystemTurn === true ? turnKey(b.text) : textKey(b.text)) : '-' }
  }
}

/**
 * Answers after message `m` of text alone (no thinking, no tool call): while a thinking block is still bound in the
 * conversation, each costs 2 tokens more as sent than counting its messages alone gives.
 */
function plainAnswersAfter(messages: readonly WireMessage[], m: number): number {
  return messages.filter((x, i) => i > m && x.role === 'assistant' && !x.content.some(b => b.type === 'tool_use' || b.type === 'thinking' || b.type === 'redacted_thinking')).length
}

/** A system turn between a message and an answer (or none there): what its message costs, framing and all, is the difference. */
const turnProbe = (text: string | null): WireMessage[] => [
  { role: 'user', content: [{ type: 'text', text: '.' }] },
  ...(text === null ? [] : [{ role: 'system', content: [{ type: 'text', text }] }]),
  { role: 'assistant', content: [{ type: 'text', text: '.' }] },
]

/** The session began before this module was loaded: what came before its first request is not placed. */
let isJoinedLate = false

/** The last counting failures, for debug mode's report. */
let countErrors: string[] = []

type Fields = Pick<Piece, 'key' | 'kind' | 'zone' | 'label'> & Partial<Piece>

function piece(fields: Fields, text: string, message: number): Piece {
  return {
    group: fields.key,
    isYours: false,
    attachment: null,
    parent: null,
    step: null,
    isEarlier: false,
    tokens: null,
    at: null,
    was: null,
    lost: null,
    copyOf: null,
    ...fields,
    hash: textKey(text),
    message,
  }
}

/** Keeps texts by key, writing only what is new. */
async function remember($: Engine, entries: Record<string, string>): Promise<void> {
  const texts = await read($, textsAtom)
  const fresh = Object.keys(entries).filter(k => texts[k] === undefined)
  if (fresh.length === 0) return
  await update($, textsAtom, all => ({ ...all, ...Object.fromEntries(fresh.map(k => [k, entries[k] ?? ''])) }))
}

/**
 * Records what a render injected. A piece seen before keeps where it is,
 * unless its text changed: then it is a new injection, placed from the next
 * request that carries it. Nothing is written when nothing changed.
 */
async function record($: Engine, seen: { piece: Piece; text: string }[]): Promise<void> {
  if (seen.length === 0) return
  await remember($, Object.fromEntries(seen.map(s => [s.piece.hash, s.text])))
  const list = await read($, injectionsAtom)
  const byKey = new Map(list.map(p => [p.key, p]))
  const isSame = (old: Piece | undefined, p: Piece) =>
    old !== undefined && old.hash === p.hash && old.label === p.label && old.isYours === p.isYours && old.parent === p.parent && old.group === p.group
  if (seen.every(s => isSame(byKey.get(s.piece.key), s.piece))) return
  await update($, injectionsAtom, current => {
    const map = new Map(current.map(p => [p.key, p]))
    for (const { piece: p } of seen) {
      const old = map.get(p.key)
      if (old === undefined || old.hash !== p.hash) map.set(p.key, p)
      else map.set(p.key, { ...old, label: p.label, isYours: p.isYours, parent: p.parent, group: p.group })
    }

    return [...map.values()]
  })
}

/** What the prompt leaves out: what was deleted, and what was moved to ride with a later message. */
async function gone($: Engine): Promise<Set<string>> {
  return new Set([...(await read($, removedAtom)), ...Object.keys(await read($, movedAtom))])
}

/** A file path as the person knows it: relative to the project, or under `~`. */
async function shortPath($: Engine, path: string): Promise<string> {
  const root = await $.session.root()
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1)
  const home = /^\/(?:root|home\/[^/]+)\//.exec(path)?.[0]

  return home === undefined ? path : `~/${path.slice(home.length)}`
}

const usageTotal = (u: ModelUsage) => u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

/**
 * A text's exact token count with the model's own tokenizer: sent as its own
 * block after a one-character block, less that one-character request. Blocks
 * add no tokens between them (the self-test checks it), so the difference is
 * the text alone. Each text is counted once and kept.
 */
async function tokensOf($: Engine, model: string, text: string): Promise<number | null> {
  if (text.length === 0) return 0
  // The API refuses a block of whitespace alone: such a text is never counted on its own.
  if (text.trim() === '') return null
  const cacheKey = `n:${model}:${textKey(text)}`
  try {
    const cached = await $.store.get(cacheKey)
    if (typeof cached === 'number') return cached
    const stored = await $.store.get(`base:${model}`)
    let base = typeof stored === 'number' ? stored : 0
    if (base <= 0) {
      const one = await $.model.complete({ model, prompt: '.', maxTokens: 1 })
      base = usageTotal(one.usage)
      if (base <= 0) {
        countErrors = [...countErrors, `base: ${one.isAnswered ? 'no usage' : `${one.reason} ${'status' in one ? String(one.status) : ''}`}`].slice(-10)

        return null
      }
      await $.store.set(`base:${model}`, base)
    }
    const counted = await $.model.complete({ model, prompt: [{ text: '.' }, { text }], maxTokens: 1 })
    const total = usageTotal(counted.usage)
    if (total <= 0) {
      countErrors = [...countErrors, `${text.length} chars: ${counted.isAnswered ? 'no usage' : `${counted.reason} ${'status' in counted ? String(counted.status) : ''}`}`].slice(-10)

      return null
    }
    await $.store.set(cacheKey, total - base)

    return total - base
  } catch (err) {
    countErrors = [...countErrors, `${text.length} chars: ${err instanceof Error ? err.message : String(err)}`].slice(-10)

    return null
  }
}

/** Counting requests sent at once: a fresh session holds about a hundred pieces, and one at a time takes minutes. */
const PARALLEL = 8

/** Counts each distinct text once, several at once; answers a lookup by text, null where counting failed. */
async function countAll($: Engine, model: string, texts: readonly string[]): Promise<(text: string) => number | null> {
  const unique = [...new Map(texts.filter(t => t.length > 0).map(text => [textKey(text), text])).values()]
  const counts = new Map<string, number | null>()
  const [first, ...rest] = unique
  // The first count also stores the one-character base, which the rest then share.
  if (first !== undefined) counts.set(textKey(first), await tokensOf($, model, first))
  let next = 0
  const worker = async () => {
    for (let text = rest[next++]; text !== undefined; text = rest[next++]) counts.set(textKey(text), await tokensOf($, model, text))
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, rest.length) }, worker))
  // A failure may be the API being busy: each one is tried once more, alone.
  for (const text of unique) if (counts.get(textKey(text)) === null && text.trim() !== '') counts.set(textKey(text), await tokensOf($, model, text))

  return text => (text.length === 0 ? 0 : (counts.get(textKey(text)) ?? null))
}

/**
 * Messages counted by the API's own token counter, as they would be sent (no
 * system prompt, no tools: a constant that every difference of two counts
 * drops). Each list is counted once and kept; null when counting failed.
 */
async function messagesTokens($: Engine, model: string, messages: readonly WireMessage[]): Promise<number | null> {
  const json = JSON.stringify(messages)
  const key = `cm:${model}:${hash(json)}:${json.length}`
  const stored = await $.store.get(key)
  if (typeof stored === 'number') return stored
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await apiCall($, '/v1/messages/count_tokens', { model, messages })
      const n = r.json?.input_tokens
      if (typeof n === 'number') {
        await $.store.set(key, n)

        return n
      }
      countErrors = [...countErrors, `messages: ${r.status} ${r.text.slice(0, 120)}`].slice(-10)
    } catch (err) {
      countErrors = [...countErrors, `messages: ${err instanceof Error ? err.message : String(err)}`].slice(-10)
    }
  }

  return null
}

/** Counts each list of messages once, several at once; answers a lookup by list. */
async function countAllMessages($: Engine, model: string, lists: readonly WireMessage[][]): Promise<(messages: readonly WireMessage[]) => number | null> {
  const unique = [...new Map(lists.map(l => [JSON.stringify(l), l])).entries()]
  const counts = new Map<string, number | null>()
  let next = 0
  const worker = async () => {
    for (let item = unique[next++]; item !== undefined; item = unique[next++]) counts.set(item[0], await messagesTokens($, model, item[1]))
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, unique.length) }, worker))

  return messages => counts.get(JSON.stringify(messages)) ?? null
}

/**
 * The tokens that follow a request's last text (its closing), by the role of
 * its last message (a user message, a system turn, or a user message ending with a
 * tool result: role `tool_result`): asked once per model with a request of the
 * inspector's own whose cache mark ends it, so only the closing is left uncached.
 * Null while not known.
 */
async function closingOf($: Engine, model: string, role: string): Promise<number | null> {
  const key = `closing:${model}:${role}`
  const stored = await $.store.get(key)
  if (typeof stored === 'number') return stored
  // A text the cache keeps (a few thousand tokens); after it, a short last text of this role.
  const long = 'The inspector measures every injected piece exactly. '.repeat(400).trimEnd()
  const mark = { type: 'ephemeral' }
  const call = { type: 'tool_use', id: 'toolu_01Probe', name: 'Read', input: { file_path: '/probe' } }
  const tools = [{ name: 'Read', description: 'Reads a file.', input_schema: { type: 'object', properties: { file_path: { type: 'string' } } } }]
  const messages =
    role === 'system'
      ? [{ role: 'user', content: [{ type: 'text', text: long }] }, { role: 'system', content: [{ type: 'text', text: 'Done.', cache_control: mark }] }]
      : role === 'tool_result'
        ? [{ role: 'user', content: [{ type: 'text', text: long }] }, { role: 'assistant', content: [call] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: 'Done.', cache_control: mark }] }]
        : [{ role: 'user', content: [{ type: 'text', text: long, cache_control: mark }] }]
  try {
    const r = await apiCall($, '/v1/messages', { model, max_tokens: 1, system: [{ type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." }], tools, messages }, ['claude-code-20250219'])
    const usage = r.json?.usage as ModelUsage | undefined
    if (usage === undefined || usage.cache_read_input_tokens + usage.cache_creation_input_tokens === 0) {
      countErrors = [...countErrors, `closing: ${r.status} ${r.text.slice(0, 120)}`].slice(-10)

      return null
    }
    await $.store.set(key, usage.input_tokens)

    return usage.input_tokens
  } catch (err) {
    countErrors = [...countErrors, `closing: ${err instanceof Error ? err.message : String(err)}`].slice(-10)

    return null
  }
}

const lastRoleOf = (messages: readonly WireMessage[]) => messages[messages.length - 1]?.role ?? ''

/**
 * Measures the pieces a view shows (`yours`: your pieces; `all`: every piece,
 * and where the first message begins). First each piece waiting is placed in
 * the request that first carried it, from that request's end as sent (see
 * step 1). Then each placed piece is carried to the last request by proof
 * (see `carry`), and one a change moved is placed again where the change was
 * made, once proven (step 3). Every text this takes is counted several at once.
 */
async function measure($: Engine, scope: 'yours' | 'all'): Promise<void> {
  const steps = await read($, requestsAtom)
  const texts = await read($, textsAtom)
  const last = steps[steps.length - 1]
  const model = last?.model ?? (await $.session.model())
  const stepById = new Map(steps.map(s => [s.id, s]))
  const wanted = (await read($, injectionsAtom)).filter(p => scope === 'all' || p.isYours)
  const patches = new Map<string, Partial<Piece>>()
  const patch = (p: Piece, more: Partial<Piece>) => patches.set(p.key, { ...(patches.get(p.key) ?? {}), ...more })
  // Sized by its text alone: never over a size set meanwhile (a reminder sized where it sits, tags and all).
  const textSized = new Set<string>()

  // 1. Sizes, and a place for each piece waiting in the request that first carried it.
  // `extra`: tokens the request as sent has after the piece that counting its messages alone does not give (see step 3).
  type Plan = { p: Piece | null; s: Step; tail: WireMessage[]; at: WireAt; placed: string; after: string; isWholeBlock: boolean; flat: { block: number; key: string }; extra: number }
  const tailOf = (s: Step): { tail: WireMessage[]; first: number } | null => {
    const json = s.wire === undefined ? undefined : texts[s.wire]

    return json === undefined || s.isWhole !== true ? null : { tail: JSON.parse(json) as WireMessage[], first: s.wireFirst ?? 0 }
  }
  // A piece's range is its text as it shows: white space at its edges belongs with what is next to it (the API may join
  // it to the white space beside it in one token).
  const plan = (p: Piece | null, s: Step, tail: WireMessage[], found: WireAt, text: string, isWholeBlock: boolean, flat: Plan['flat'], extra = 0): Plan => {
    const placed = text.trim()
    const at = { ...found, offset: found.offset + (text.length - text.trimStart().length) }
    const block = tail[at.message]?.content[at.block]?.text
    const after = typeof block === 'string' ? block.slice(at.offset + placed.length) : ''

    return { p, s, tail, at, placed, after, isWholeBlock, flat, extra }
  }
  // Where a block of a request's end sits among all its blocks (what `carry` follows): its own message's, or the system turn's.
  const tailFlat = (s: Step, tail: WireMessage[], at: WireAt): Plan['flat'] => {
    const i = tail[at.message]?.role === 'system' ? (s.systemTurn ?? s.tail.length - 1) : at.block

    return { block: s.blocks - s.tail.length + i, key: s.tail[i] ?? '' }
  }
  const plans: Plan[] = []
  const sized: string[] = []
  const exchanges: Piece[] = []
  for (const p of wanted) {
    const text = texts[p.hash]
    if (text === undefined) continue
    // One inside a tool result is sized where it sits only (its text alone may be an id).
    if (p.tokens === null && !isInToolResult(p)) sized.push(text)
    const isRetry = ['counting failed', 'sent outside', 'not found', 'the closing'].some(why => p.lost?.startsWith(why) ?? false)
    // Inside a tool result: placed as the call and its results (step 1b).
    if (isInToolResult(p) && p.zone !== 'system' && p.step !== null && p.at === null && p.was === null && !Object.values(LOST).includes(p.lost ?? '')) {
      exchanges.push(p)
      continue
    }
    if (p.zone === 'system' || p.step === null || p.at !== null || p.was !== null || (p.lost !== null && !isRetry)) continue
    if (isRetry) patch(p, { lost: null })
    const s = stepById.get(p.step)
    if (s === undefined) {
      patch(p, { lost: 'its request was not kept' })
      continue
    }
    const kept = tailOf(s)
    if (kept === null) {
      patch(p, { lost: s.isWhole === false ? 'a server tool ran in its request' : 'its request was not kept as sent' })
      continue
    }
    const found = locateInTail(kept.tail, kept.first, text)
    if (found !== null) {
      plans.push(plan(p, s, kept.tail, found, text, false, tailFlat(s, kept.tail, found)))
      continue
    }
    // Sent reworded (Claude Code rewrites some reminders): the text block that holds its lines, whole.
    const blocks = kept.tail.flatMap((m, mi) =>
      mi < kept.first ? [] : m.content.map((b, bi) => ({ at: { message: mi, block: bi, offset: 0 }, text: b.type === 'text' && typeof b.text === 'string' ? b.text : '' })),
    )
    const hit = p.parent === null ? blocks[blockOf(blocks.map(b => b.text), text)] : undefined
    if (hit === undefined) {
      patch(p, { lost: 'not found in its request as sent' })
      continue
    }
    plans.push(plan(p, s, kept.tail, hit.at, hit.text, true, tailFlat(s, kept.tail, hit.at)))
  }
  // Where the first message begins: its first block, placed the same way.
  let start = await read($, promptStartAtom)
  const firstStep = steps.find(s => s.messageCount === 1 && tailOf(s) !== null)
  if (scope === 'all' && start === null && firstStep !== undefined) {
    const kept = tailOf(firstStep)
    const opening = kept === null ? undefined : kept.tail[kept.first]?.content[0]
    if (kept !== null && opening !== undefined && typeof opening.text === 'string' && opening.text.trim() !== '') {
      const at = { message: kept.first, block: 0, offset: 0 }
      plans.push(plan(null, firstStep, kept.tail, at, opening.text, false, tailFlat(firstStep, kept.tail, at)))
    }
  }
  const sizeOf = await countAll($, model, sized)
  for (const p of wanted) {
    const n = p.tokens === null && !isInToolResult(p) ? sizeOf(texts[p.hash] ?? '') : null
    if (n !== null && p.tokens === null) {
      patch(p, { tokens: n })
      textSized.add(p.key)
    }
  }
  // A request's tokens are its messages' and its closing: cut just after the piece, it would end where the piece ends.
  // The API's own count of the request as sent, less its count cut there, is everything after the piece and the closing
  // after its last message; the closing after the cut's last message is what the cut ends with. Each edge is checked to
  // fall between two tokens.
  const settle = async (batch: readonly Plan[]) => {
    const need: string[] = []
    const lists: WireMessage[][] = []
    for (const x of batch) {
      lists.push(x.tail, cutTail(x.tail, { ...x.at, offset: x.at.offset + x.placed.length }))
      if (textBefore(x.tail, x.at) !== null) lists.push(cutTail(x.tail, x.at))
      need.push(x.placed)
      if (x.after.trim() !== '') need.push(x.after, x.placed + x.after)
    }
    const count = await countAll($, model, need)
    const countMessages = await countAllMessages($, model, lists)
    for (const x of batch) {
      const failed = (why: string) => {
        if (x.p !== null) patch(x.p, { lost: why })
      }
      const xEnd = cutTail(x.tail, { ...x.at, offset: x.at.offset + x.placed.length })
      const whole = countMessages(x.tail)
      const toEnd = countMessages(xEnd)
      const size = count(x.placed)
      const closeCut = await closingOf($, x.s.model, lastRoleOf(xEnd))
      if (closeCut === null) {
        failed(`the closing tokens after a ${lastRoleOf(xEnd)} message are not known yet; Refresh tries again`)
        continue
      }
      if (whole === null || toEnd === null || size === null) {
        failed(`counting failed${countErrors.length > 0 ? ` (${countErrors[countErrors.length - 1]})` : ''}; Refresh tries again`)
        continue
      }
      // Its end: where the request cut there would end, less that cut's closing.
      const end = x.s.total - whole + toEnd - closeCut - x.extra
      const begin = end - size
      // No token spans its end: it and the rest of its block, counted alone, add up to them counted together.
      if (x.after.trim() !== '') {
        const rest = count(x.after)
        const both = count(x.placed + x.after)
        if (rest === null || both === null) {
          failed('counting failed; Refresh tries again')
          continue
        }
        if (size + rest !== both) {
          failed('its end shares a token with the text after it')
          continue
        }
      }
      // No token spans its start: the request cut just before it ends there, or before the white space that leads to it.
      const before = textBefore(x.tail, x.at)
      if (before !== null) {
        const xStart = cutTail(x.tail, x.at)
        const upTo = countMessages(xStart)
        const closeStart = await closingOf($, x.s.model, lastRoleOf(xStart))
        if (upTo === null || closeStart === null) {
          failed('counting failed; Refresh tries again')
          continue
        }
        const cut = x.s.total - whole + upTo - closeStart - x.extra
        const space = /\s*$/.exec(before)?.[0].length ?? 0
        if (space === 0 ? cut !== begin : begin - cut < 1 || begin - cut > space) {
          failed('its start shares a token with the text before it')
          continue
        }
      }
      if (x.p === null) {
        start = { at: begin, step: x.s.id }
        continue
      }
      const at = { start: begin, end, block: x.flat.block, offset: x.at.offset, key: x.flat.key, ...(x.isWholeBlock ? { isWholeBlock: true } : {}) }
      patch(x.p, { tokens: end - begin, at, step: x.s.id, lost: null, isEarlier: false })
    }
  }
  await settle(plans)

  // 1b. A piece inside a tool result: no place inside one can be told (the API wraps a result in tokens of its own and
  // reports only their sum; no cut between results is a request it takes). Its range is Claude's call and the results
  // that hold it: from where the request before ended (the cache read proves it unchanged) to where the results end
  // (the request as sent, counted whole and cut just after them, and the closing after a message ending with a result).
  for (const p of exchanges) {
    const s = stepById.get(p.step ?? -1)
    const kept = s === undefined ? null : tailOf(s)
    const text = texts[p.hash] ?? ''
    if (s === undefined || kept === null || text === '') continue
    const user = kept.tail[kept.first]?.content ?? []
    const j = user.findIndex(b => b.type === 'tool_result' && (String(b.tool_use_id) === text || JSON.stringify(b.content ?? '').includes(JSON.stringify(text).slice(1, -1))))
    if (j < 0) continue
    // Quoted by the inspector's own report: not where it was sent.
    const call = (kept.tail[kept.first - 1]?.content ?? []).find(b => b.type === 'tool_use' && b.id === user[j]?.tool_use_id)
    if (String(call?.name ?? '').startsWith('mcp__prompt-inspector')) {
      patch(p, { step: null, at: null, lost: null, isEarlier: true })
      continue
    }
    const before = steps.find(x => x.id === s.id - 1)
    const closeBefore = before?.lastRole === undefined ? null : await closingOf($, before.model, before.lastRole)
    const results = user.reduce((k, b, i) => (b.type === 'tool_result' ? i : k), j)
    const toEnd = cutTail(kept.tail, { message: kept.first, block: results + 1, offset: 0 })
    const counts = await countAllMessages($, model, [kept.tail, toEnd])
    const whole = counts(kept.tail)
    const upTo = counts(toEnd)
    const closeResult = await closingOf($, s.model, 'tool_result')
    if (before === undefined || before.isWhole !== true || closeBefore === null) {
      patch(p, { lost: `${IN_TOOL_RESULT}; the request before its call was not seen` })
      continue
    }
    if (whole === null || upTo === null || closeResult === null) {
      patch(p, { lost: `counting failed${countErrors.length > 0 ? ` (${countErrors[countErrors.length - 1]})` : ''}; Refresh tries again` })
      continue
    }
    const start = before.total - closeBefore
    const end = s.total - whole + upTo - closeResult
    if (s.cacheRead < start || end <= start) {
      patch(p, { lost: `${IN_TOOL_RESULT}; what came before its call changed` })
      continue
    }
    patch(p, { at: { start, end, block: tailFlat(s, kept.tail, { message: kept.first, block: results, offset: 0 }).block, offset: 0, key: 'tool:result', isExchange: true }, lost: null, step: s.id })
  }

  // 2. Carry each placed piece to the last request, and where the first message begins.
  const out = await gone($)
  type Placed = Piece & { at: Position; step: number; tokens: number }
  const carryAll = async (list: readonly Placed[], withStart: boolean) => {
    const asked: string[] = []
    const askedBlocks = new Set<string>()
    const collect = (t: string) => {
      asked.push(t)

      return 0
    }
    const collectBlock = (key: string) => {
      askedBlocks.add(key)

      return 0
    }
    for (const p of list) carry(p.at, p.step, texts[p.hash] ?? '', p.tokens, steps, texts, collect, collectBlock)
    if (withStart && start !== null) carryStart(start.at, start.step, steps, texts, collect)
    // A block put in or taken out costs its text where it sits; a system turn, its message's framing too: counted with a
    // message after it on both sides, so nothing at the end differs. A text block ending in white space is not counted
    // (where it sits decides whether that white space costs a token).
    const turnLists = [...askedBlocks].filter(k => k.startsWith('s:') && texts[k] !== undefined).flatMap(k => [turnProbe(texts[k] ?? ''), turnProbe(null)])
    const countTurns = await countAllMessages($, model, turnLists)
    for (const k of askedBlocks) if (!k.startsWith('s:') && texts[k] !== undefined) asked.push(texts[k] ?? '')
    const count = await countAll($, model, asked)
    const countBlock = (key: string): number | null => {
      const t = texts[key]
      if (t === undefined) return null
      if (key.startsWith('s:')) {
        const withIt = countTurns(turnProbe(t))
        const without = countTurns(turnProbe(null))

        return withIt === null || without === null ? null : withIt - without
      }

      return t.length === 0 ? 0 : /\s$/.test(t) ? null : count(t)
    }
    for (const p of list) {
      const r = carry(p.at, p.step, texts[p.hash] ?? '', p.tokens, steps, texts, count, countBlock)
      if (r.kind === 'at') patch(p, { at: r.at, step: r.step })
      else if (r.kind === 'gone') patch(p, { at: null, was: r.was, step: r.step })
      // Inside a tool result that changed after you took it out (🗑 or 🔄): it went where it was.
      else if (p.at.key === 'tool:result' && p.attachment !== 'file' && out.has(p.group)) patch(p, { at: null, was: { start: p.at.start, end: p.at.end }, step: r.step })
      else patch(p, { at: null, lost: r.reason, step: r.step })
    }
    if (withStart && start !== null && last !== undefined && start.step < last.id) {
      const moved = carryStart(start.at, start.step, steps, texts, count)
      start = moved === null ? null : { at: moved, step: last.id }
    }
  }
  const isPlaced = (p: Piece): p is Placed => p.at !== null && p.step !== null && p.tokens !== null && last !== undefined && p.step < last.id
  await carryAll(wanted.map(p => ({ ...p, ...(patches.get(p.key) ?? {}) })).filter(isPlaced), true)

  // 3. A piece lost on the way (a change before it: a deletion, a move) is placed again in the request that carried the
  // change, from its end: what follows it counted as sent, and for each answer of text alone (no thinking, no tool call)
  // 2 tokens more while a thinking block is still bound in the conversation. A thinking block after the change costs
  // nothing any more (the API drops thinking whose conversation before it changed), one before it costs what no count
  // gives: so this is trusted only once proven. Placed the same way, a block's end before the change must fall exactly
  // where the API says that request's cache read ended. Then it is carried to the last request.
  const groups = new Map<number, Piece[]>()
  for (const p of wanted.map(x => ({ ...x, ...(patches.get(x.key) ?? {}) }))) {
    if (p.zone === 'system' || p.at !== null || p.was !== null || p.step === null || !Object.values(LOST).includes(p.lost ?? '')) continue
    const failed = steps.find(s => s.id > (p.step ?? 0))
    if (failed?.whole !== undefined && failed.isWhole === true) groups.set(failed.id, [...(groups.get(failed.id) ?? []), p])
  }
  for (const [id, group] of groups) {
    const s = stepById.get(id)
    const json = s?.whole === undefined ? undefined : texts[s.whole]
    if (s === undefined || json === undefined) continue
    const sent = JSON.parse(json) as ApiMessage[]
    const now = wireMessages(sent)
    const flat = flatOf(sent, now.origin)
    const adrift = group.flatMap(p => {
      const text = texts[p.hash] ?? ''
      const at = text === '' || isInToolResult(p) ? null : locateInTail(now.messages, 0, text)

      return at === null ? [] : [{ p, text, at }]
    })
    // Inside a tool result: its call and results, from the end of the message before the call to the end of the results.
    const inResults = group.flatMap(p => {
      const text = texts[p.hash] ?? ''
      if (!isInToolResult(p) || text === '') return []
      const escaped = JSON.stringify(text).slice(1, -1)
      for (let m = now.messages.length - 1; m >= 2; m--) {
        const blocks = now.messages[m]?.content ?? []
        const j = blocks.findIndex(b => b.type === 'tool_result' && (String(b.tool_use_id) === text || JSON.stringify(b.content ?? '').includes(escaped)))
        if (j < 0 || now.messages[m]?.role !== 'user' || now.messages[m - 1]?.role !== 'assistant' || now.messages[m - 2]?.role === 'assistant') continue
        const last = blocks.reduce((k, b, i) => (b.type === 'tool_result' ? i : k), j)

        return [{ p, m, first: cutTail(now.messages, { message: m - 1, block: 0, offset: 0 }), end: cutTail(now.messages, { message: m, block: last + 1, offset: 0 }), flat: flat({ message: m, block: last, offset: 0 }) }]
      }

      return []
    })
    // Block ends before the first block the request changed (the diff with the request before says which), nearest first.
    const change = s.change
    const firstChange = change.kind === 'known' ? Math.min(...change.blocks.map(c => c.at), change.brokenAt ?? Infinity) : Infinity
    // Each a cut, the last block it keeps, and the role its closing is that of (a message ending with tool results has its own).
    const bounds: { at: WireAt; block: number; role: string }[] = []
    for (let m = now.messages.length - 1; m >= 0 && bounds.length < 12 && firstChange !== Infinity; m--) {
      const msg = now.messages[m]
      if (msg === undefined || msg.role === 'assistant') continue
      for (let k = msg.content.length - 1; k >= 0 && bounds.length < 12; k--) {
        const b = msg.content[k]
        const t = b?.text
        // White space ending a message is dropped where it sits as it is in the cut; inside a message it costs a token there.
        const isClean = typeof t === 'string' && t.trim() !== '' && (k === msg.content.length - 1 || !/\s$/.test(t))
        const at = { message: m, block: k, offset: typeof t === 'string' ? t.length : 0 }
        if (b?.type === 'text' && isClean && flat(at).block < firstChange) bounds.push({ at, block: k, role: msg.role })
        // After the last of the results the message opens with (a cut between two results is no request the API takes).
        const isLastResult = b?.type === 'tool_result' && msg.content[k + 1]?.type !== 'tool_result'
        if (isLastResult && flat(at).block < firstChange) bounds.push({ at: { message: m, block: k + 1, offset: 0 }, block: k, role: 'tool_result' })
      }
    }
    if ((adrift.length === 0 && inResults.length === 0) || bounds.length === 0) continue
    const cuts = bounds.map(b => cutTail(now.messages, b.at))
    const countCuts = await countAllMessages($, model, [now.messages, ...cuts, ...inResults.flatMap(x => [x.first, x.end])])
    const whole = countCuts(now.messages)
    // Whether an answer of text alone costs 2 tokens more is the API's to say: the proof says which, or nothing is placed.
    let proof: { message: number; block: number; perAnswer: number } | null = null
    for (const [i, b] of bounds.entries()) {
      const c = countCuts(cuts[i] ?? [])
      const close = await closingOf($, s.model, b.role)
      if (whole === null || c === null || close === null) continue
      const perAnswer = [2, 0].find(n => s.total - whole + c - close - n * plainAnswersAfter(now.messages, b.at.message) === s.cacheRead)
      if (perAnswer !== undefined) {
        proof = { message: b.at.message, block: b.block, perAnswer }
        break
      }
    }
    const from = proof
    if (from === null) continue
    const after = adrift.filter(x => x.at.message > from.message || (x.at.message === from.message && x.at.block > from.block))
    await settle(after.map(x => plan(x.p, s, now.messages, x.at, x.text, false, flat(x.at), from.perAnswer * plainAnswersAfter(now.messages, x.at.message))))
    for (const x of inResults.filter(x => x.m - 2 >= from.message)) {
      const before = now.messages[x.m - 2]?.role ?? ''
      const [c1, c2, close1, close2] = [countCuts(x.first), countCuts(x.end), await closingOf($, s.model, before), await closingOf($, s.model, 'tool_result')]
      if (whole === null || c1 === null || c2 === null || close1 === null || close2 === null) continue
      const start = s.total - whole + c1 - close1 - from.perAnswer * plainAnswersAfter(now.messages, x.m - 2)
      const end = s.total - whole + c2 - close2 - from.perAnswer * plainAnswersAfter(now.messages, x.m)
      if (end > start) patch(x.p, { at: { start, end, block: x.flat.block, offset: 0, key: 'tool:result', isExchange: true }, lost: null, step: s.id })
    }
  }
  const regrouped = new Set([...groups.values()].flat().map(p => p.key))
  if (regrouped.size > 0) await carryAll(wanted.filter(p => regrouped.has(p.key)).map(p => ({ ...p, ...(patches.get(p.key) ?? {}) })).filter(isPlaced), false)
  await update($, promptStartAtom, () => start)
  if (patches.size > 0) {
    await update($, injectionsAtom, list =>
      list.map(p => {
        const more = patches.get(p.key)
        if (more === undefined) return p
        if (p.tokens !== null && textSized.has(p.key) && more.tokens !== undefined && more.at === undefined) {
          const { tokens, ...rest } = more
          void tokens

          return { ...p, ...rest }
        }

        return { ...p, ...more }
      }),
    )
  }
}

/** Context blocks and attachments are cached answers: ask for them again with the next request. */
function invalidate($: Engine): void {
  $.ui.invalidate('prompt.context')
  $.ui.invalidate('prompt.attachment')
}

/** Keeps what the person chose (deleted, moved) for this session in the store, so a resumed session keeps it. */
async function persist($: Engine): Promise<void> {
  try {
    const id = await $.session.id()
    await $.store.set(`choices:${id}`, { removed: await read($, removedAtom), moved: await read($, movedAtom), saved: await read($, savedAtom) })
  } catch {
    // Best-effort: the choices still apply in this process.
  }
}

/**
 * Attachment kinds Claude Code keeps in the user message; every other reminder
 * goes to a model that takes system turns as one, after that message (its own
 * record says which: `renderedRole` in the session's transcript).
 */
const userTypes = new Set(['session_context', 'remote_session_change'])
/** Kinds the transcript was read for. */
const knownTypes = new Set<string>()
/** The texts the inspector last read the transcript at, so a kind not in it is read for once. */
let rolesReadAt = -1

/** Learns from the session's transcript which attachment kinds stay in the user message. */
async function learnRoles($: Engine): Promise<void> {
  try {
    const root = await $.session.root()
    const home = (await $.env.get('HOME')) ?? /^\/(?:root|home\/[^/]+)/.exec(root)?.[0] ?? '/root'
    const text = (await $.fs.read(`${home.replace(/\/$/, '')}/.claude/projects/${root.replace(/[^A-Za-z0-9]/g, '-')}/${await $.session.id()}.jsonl`)) as string
    if (text.length === rolesReadAt) return
    rolesReadAt = text.length
    for (const line of text.split('\n')) {
      if (!line.includes('"renderedRole"')) continue
      const row = JSON.parse(line) as { attachment?: { type?: unknown }; renderedRole?: unknown }
      const type = row.attachment?.type
      if (typeof type !== 'string') continue
      knownTypes.add(type)
      if (row.renderedRole === 'user') userTypes.add(type)
      else if (row.renderedRole === 'system') userTypes.delete(type)
    }
  } catch {
    // No transcript to read: the kinds known to stay in the user message.
  }
}

/** Reminders that open the user's own context: kept in the user message when their kind is not known. */
const USER_CONTEXT = /^(As you answer the user's questions, you can use the following context|Attribution for git commits)/

/**
 * Whether Claude Code sends a reminder (its own text) as part of the system
 * turn: its kind's, when the inspector saw it injected; one joined to a tool
 * result that it did not see is the tool's own text.
 */
function promoterOf(pieces: readonly Piece[]): (inner: string, isJoined: boolean) => boolean {
  const kinds = new Map(pieces.filter(p => p.attachment !== null && p.attachment !== 'file').map(p => [p.hash, p.attachment ?? '']))

  return (inner, isJoined) => {
    const kind = kinds.get(textKey(inner))
    if (kind !== undefined) return !userTypes.has(kind)

    return !isJoined && !USER_CONTEXT.test(inner)
  }
}

/** 🗑: the group leaves the prompt from the next request on (a skill: its later uses stop). A queued move is cancelled. */
async function remove($: Engine, group: string): Promise<void> {
  await update($, removedAtom, list => [...new Set([...list, group])])
  const moved = await read($, movedAtom)
  if (moved[group] === 'queued') {
    await update($, movedAtom, m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== group)))
    await update($, savedAtom, s => Object.fromEntries(Object.entries(s).filter(([k]) => k !== group)))
  }
  invalidate($)
  await persist($)
}

/** 🔄: the piece leaves its place (a skill's text already sent stays) and a copy rides with the next message. */
async function moveToEnd($: Engine, row: Row): Promise<boolean> {
  const pieces = await read($, injectionsAtom)
  const texts = await read($, textsAtom)
  const p = pieces.find(x => x.key === row.key)
  let text = p === undefined ? undefined : texts[p.hash]
  // A file's copy is its own text (not as a tool showed it, numbered), read now. A PDF or a picture has none.
  if (p !== undefined && p.attachment === 'file') {
    const name = p.group.slice('file:'.length)
    if (MEDIA.test(name)) return false
    const path = name.startsWith('/') ? name : name.startsWith('~/') ? `${/^\/(?:root|home\/[^/]+)\//.exec(await $.session.root())?.[0] ?? '/'}${name.slice(2)}` : `${await $.session.root()}/${name}`
    try {
      text = ((await $.fs.read(path)) as string).trimEnd()
    } catch {
      // Gone from disk: the text as it was read.
    }
  }
  if (p === undefined || text === undefined) return false
  const copy = text
  await update($, savedAtom, saved => ({ ...saved, [row.group]: copy }))
  await update($, movedAtom, moved => ({ ...moved, [row.group]: 'queued' as const }))
  await update($, removedAtom, list => list.filter(k => k !== row.group))
  invalidate($)
  await persist($)

  return true
}

/**
 * Opens a card (Claude Code's question dialog, drawn on the phone too); answers
 * the choice tapped or the text typed, or null when the card is closed. Claude
 * reads nothing of it.
 */
async function ask($: Engine, question: string, header: string, choices: string[]): Promise<string | null> {
  try {
    const answer = await $.ui.ask(question, { options: choices, header })

    return answer.trim() === '' ? null : answer.trim()
  } catch {
    return null
  }
}

/** Pieces per list card: two, then More… and Done (a card holds four choices). */
const PAGE = 2
const MORE = 'More…'
const DONE = 'Done'

/** Each row's card choice, none the same as another on the card. */
function uniqueLabels(rows: readonly Row[]): string[] {
  const seen = new Map<string, number>()

  return rows.map(r => {
    const base = cardLabel(r)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)

    return n === 1 ? base : `${base} (${n})`
  })
}

/** Source code: what Claude reads to do the work, not a file you gave it. */
const CODE = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kts?|swift|c|h|cc|cpp|hpp|cs|rb|php|sh|bash|zsh|css|scss|sass|less|sql|vue|svelte|lua|pl|r|scala|dart|exs?|erl|hs|ml|clj|lock)$/i

/** A file the model sees as images (a PDF's pages, a picture): it has no text to move out of its read or to copy. */
const MEDIA = /\.(?:pdf|png|jpe?g|gif|webp)$/i

/**
 * A file of yours: in the project, or one you uploaded; not source code, and
 * not the inspector's own, a dependency's or git's.
 */
async function isYourFile($: Engine, path: string): Promise<boolean> {
  const root = await $.session.root()
  const home = /^\/(?:root|home\/[^/]+)\//.exec(root)?.[0] ?? '/root/'
  const isPlace = path.startsWith(`${root}/`) || path.startsWith(`${home}.claude/uploads/`) || path.startsWith('/mnt/user-data/')

  return isPlace && !CODE.test(path) && !/\/(?:node_modules|\.git)\/|\/\.claude\/skills\/prompt-inspector\//.test(path)
}

/** Your instruction files on disk: every CLAUDE.md and `.claude/rules` file under the project, and the home CLAUDE.md. */
async function yourFiles($: Engine): Promise<string[]> {
  const root = await $.session.root()
  const out: string[] = []
  const walk = async (dir: string, depth: number, isRules: boolean): Promise<void> => {
    let entries: Awaited<ReturnType<typeof $.fs.list>> = []
    try {
      entries = await $.fs.list(dir)
    } catch {
      return
    }
    for (const e of entries) {
      const path = `${dir}/${e.name}`
      if (e.kind === 'file' && (isRules ? e.name.endsWith('.md') : e.name === 'CLAUDE.md' || e.name === 'CLAUDE.local.md')) out.push(path)
      if (e.kind !== 'dir' || depth >= 4 || e.name === 'node_modules' || e.name === '.git') continue
      if (e.name === '.claude') {
        if (await $.fs.exists(`${path}/CLAUDE.md`).catch(() => false)) out.push(`${path}/CLAUDE.md`)
        await walk(`${path}/rules`, depth + 1, true)
      }
      else if (!e.name.startsWith('.')) await walk(path, depth + 1, isRules)
      else if (isRules) await walk(path, depth + 1, true)
    }
  }
  await walk(root, 0, false)
  const home = /^\/(?:root|home\/[^/]+)\//.exec(root)?.[0]
  if (home !== undefined && (await $.fs.exists(`${home}.claude/CLAUDE.md`).catch(() => false))) out.push(`${home}.claude/CLAUDE.md`)

  return out
}

/** Rows for your files whose content is in the context now, wherever it came from (a read, a command's output). */
async function filesInContext($: Engine, known: ReadonlySet<string>): Promise<Row[]> {
  const api = await $.session.messages({ as: 'api' })
  const haystack = JSON.stringify(api)
  const rows: Row[] = []
  for (const path of await yourFiles($)) {
    const label = await shortPath($, path)
    if (known.has(label)) continue
    let text = ''
    try {
      text = (await $.fs.read(path)) as string
    } catch {
      continue
    }
    if (!isInContext(text, haystack)) continue
    rows.push({
      key: `file:${path}`,
      group: `file:${path}`,
      label,
      kind: 'rule',
      isYours: true,
      start: null,
      end: null,
      tokens: null,
      message: null,
      isDeleted: false,
      isMoved: false,
      isCopy: false,
      isWholeBlock: false,
      isExchange: false,
      was: null,
      note: 'not measured',
      isActionable: false,
    })
  }

  return rows
}

/**
 * The rows a view lists, and how many pieces in the context came before the inspector started (in a session resumed in
 * a new process too): no request it saw first carried them, so none can be placed. They are counted, not listed.
 */
async function rowsFor($: Engine, scope: 'yours' | 'all'): Promise<{ rows: Row[]; total: number | null; earlier: number }> {
  const steps = await read($, requestsAtom)
  const all = layout(await read($, injectionsAtom), steps, new Set(await read($, removedAtom)), new Set(Object.keys(await read($, movedAtom))))
  const isEarlier = (r: Row) => r.note?.startsWith('sent before the inspector started') ?? false
  const earlierRows = all.rows.filter(r => isEarlier(r) && (scope === 'all' || (r.isYours && r.kind !== 'context')))
  const total = all.total
  const rows = all.rows.filter(r => !isEarlier(r) && !(r.note?.startsWith('arrives') ?? false))
  // Yours: only what is in the context now; each at its exact place, or says why not. What has not been sent yet is not listed.
  if (scope === 'yours') {
    // A file already listed at its exact place is not listed again by a copy that could not be placed.
    const placed = new Set(rows.filter(r => r.isYours && r.start !== null).map(r => r.label))
    const listed = rows.filter(r => r.isYours && r.kind !== 'context' && (r.start !== null || (r.was === null && r.note !== null && !r.note.startsWith('arrives') && !placed.has(r.label))))
    // A piece that only wraps others of yours (all the CLAUDE.md files sent as one reminder) is not one of them.
    const holds = (r: Row, o: Row) => o !== r && r.start !== null && r.end !== null && o.start !== null && o.end !== null && r.start <= o.start && o.end <= r.end && r.end - r.start > o.end - o.start
    const wraps = listed.filter(r => r.kind !== 'rule' || !listed.some(o => o.kind === 'rule' && holds(r, o)))
    // One inside a tool result has no place to carry: it is listed while its text is still in the conversation.
    const pieces = new Map((await read($, injectionsAtom)).map(p => [p.key, p]))
    const texts = await read($, textsAtom)
    const haystack = JSON.stringify(await $.session.messages({ as: 'api' }))
    // So is one deleted that never had a range: until Claude Code leaves it out (from your next message on).
    const shown = wraps.filter(r => {
      const p = pieces.get(r.key)
      const isInTool = p?.lost?.startsWith(IN_TOOL_RESULT) ?? false
      const isLeaving = r.isDeleted && r.start === null && r.was === null
      if (p === undefined || p.at !== null || !(isInTool || isLeaving)) return true
      const text = texts[p.hash] ?? ''
      const isThere = haystack.includes(JSON.stringify(text).slice(1, -1))

      // Deleted: only its own text, as injected, keeps it listed (its lines quoted elsewhere do not).
      return isThere || (!isLeaving && isInContext(text, haystack))
    })

    // A file Claude Code brought back whole (after a compaction) holds the piece it was read as: listed once, as brought back.
    const isInside = (r: Row, o: Row) => o !== r && o.label === r.label && r.start !== null && r.end !== null && o.start !== null && o.end !== null && o.start <= r.start && r.end <= o.end && o.end - o.start > r.end - r.start
    const once = shown.filter(r => !shown.some(o => isInside(r, o)))
    // Files of yours whose text is in the context with no injection the inspector saw: from before it started.
    const extra = await filesInContext($, new Set([...once, ...earlierRows].map(x => x.label)))

    return { rows: once, total, earlier: earlierRows.length + extra.length }
  }
  const start = await read($, promptStartAtom)
  const isProven = start !== null && steps.every(s => s.id <= start.step || s.cacheRead >= start.at)

  return { rows: withFillers(rows, total, isProven && start !== null ? start.at : null), total, earlier: earlierRows.length }
}

/** The card for one piece: 🗑 (with a confirmation) or 🔄; answers what to say on the list card. */
async function act($: Engine, row: Row): Promise<string> {
  const isSkill = row.kind === 'skill'
  // A file Claude read (or a command printed) is in its own tool result: what was read stays; later reads stop.
  const isFile = row.key.startsWith('file:')
  const remove1 = isSkill ? '🗑 Stop later uses' : isFile ? '🗑 Stop later reads' : '🗑 Delete'
  const move1 = isSkill || isFile ? '🔄 Send a copy at end' : '🔄 Re-inject at end'
  // A PDF or a picture has no text to send as a copy.
  const moves = isFile && MEDIA.test(row.label) ? [] : [move1]
  const choices =
    row.isCopy || row.isMoved
      ? row.isDeleted
        ? ['Back']
        : ['🗑 Delete', 'Back']
      : row.isDeleted
        ? [...moves, 'Back']
        : [remove1, ...moves, 'Back']
  const choice = await ask($, cardLabel(row) + (row.tokens === null ? '' : ` · ${int(row.tokens)} tok`), 'Piece', choices)
  if (choice === remove1 || choice === '🗑 Delete') {
    const confirm = await ask($, `${isSkill ? 'Stop later uses of' : isFile ? 'Stop later reads of' : 'Delete'} ${row.label}?`, 'Confirm', [isSkill || isFile ? 'Yes, stop them' : 'Yes, delete', 'No'])
    if (confirm === null || confirm === 'No') return ''
    await remove($, row.group)

    return `${isSkill || isFile ? 'Stopped' : 'Deleted'} ${row.label}. `
  }
  if (choice === move1) {
    const isMoved = await moveToEnd($, row)

    return isMoved ? `${row.label} ${isSkill || isFile ? 'copied to the end' : 'moved to the end'}. ` : `${row.label}: can't be re-injected. `
  }

  return ''
}

/** The inspector: a paged list card, then a card for the piece tapped. */
async function inspect($: Engine, scope: 'yours' | 'all'): Promise<string> {
  await refreshYours($)
  await measure($, scope)
  let page = 0
  let said = ''
  let measuredAt = (await read($, requestsAtom)).length
  for (let round = 0; round < 200; round++) {
    const seen = (await read($, requestsAtom)).length
    if (seen !== measuredAt) {
      await measure($, scope)
      measuredAt = seen
    }
    const { rows, total, earlier } = await rowsFor($, scope)
    const pages = Math.max(1, Math.ceil(rows.length / PAGE))
    page = page % pages
    const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
    const labels = uniqueLabels(shown)
    const title = scope === 'all' ? 'Everything injected' : 'Your rules & skills'
    const size = total === null ? 'no request measured yet' : `last request ${int(total)} tokens`
    const empty = rows.length === 0 ? (scope === 'all' ? ' Nothing recorded yet.' : ' None of yours is in the context.') : ''
    const before = earlier === 0 ? '' : ` ${earlier} more in the context from before the inspector started.`
    const question = `${said}${title} · ${size} · ${rows.length} pieces, page ${page + 1}/${pages}.${empty}${before} Tap one, or type a token position.`
    const choices = rows.length === 0 ? ['Refresh', DONE] : [...labels, ...(pages > 1 ? [MORE] : []), DONE]
    const answer = await ask($, question, scope === 'all' ? 'Inspect all' : 'Inspect', choices)
    said = ''
    if (answer === null || answer === DONE) break
    if (answer === MORE) {
      page += 1
      continue
    }
    if (answer === 'Refresh') {
      await measure($, scope)
      continue
    }
    const index = labels.indexOf(answer)
    const typed = typedPosition(answer)
    const row = index >= 0 ? shown[index] : typed !== null ? rowAt(rows, typed) : undefined
    if (row === undefined) {
      said = typed === null ? `"${answer}" is not a choice or a token number. ` : `Nothing is at ${int(typed)}. `
      continue
    }
    if (index < 0) page = Math.floor(rows.indexOf(row) / PAGE)
    if (!row.isActionable) {
      said = `${row.kind === 'filler' ? `The ${row.label}` : row.label} (${describe(row)}) can't be deleted. `
      continue
    }
    said = await act($, row)
  }

  return 'Prompt inspector closed.'
}

/** Which skills are yours (source `user`), read again: a skill made during the session counts too. */
async function refreshYours($: Engine): Promise<void> {
  try {
    const mine = (await $.command.list()).filter(c => c.source === 'user').map(c => c.name)
    await update($, userSkillsAtom, () => mine)
    const names = new Set(mine)
    const nameOf = (p: Piece) => (p.kind === 'skill' ? p.group.slice('skill:'.length) : p.kind === 'skill-line' ? p.key.slice('listing:'.length) : null)
    await update($, injectionsAtom, list =>
      list.map(p => {
        const name = nameOf(p)

        return name === null || names.has(name) === p.isYours ? p : { ...p, isYours: names.has(name) }
      }),
    )
  } catch {
    // No commands listed: nothing changes.
  }
}

/**
 * Tests, with the model itself, the facts exact ranges rest on:
 * - a cache mark on a block reports that block's end as cache read + cache
 *   write (`markEnd` is the same with a block after it as without);
 * - what a block after the mark costs, by the API's own account
 *   (`afterByApi`: uncached with it, less uncached without), is what counting
 *   it alone gives (`afterCounted`);
 * - two blocks cost what their joined text costs (`blockBoundary` 0).
 */
async function selfTest($: Engine, model: string): Promise<Record<string, number | string | boolean>> {
  const long = 'The inspector measures every injected piece exactly. '.repeat(400)
  const after = 'Use the todo list.'
  const usageOf = async (prompt: string | readonly ModelTextBlock[]) => (await $.model.complete({ model, prompt, maxTokens: 1 })).usage
  const alone = await usageOf([{ text: long, cache: true }])
  const both = await usageOf([{ text: long, cache: true }, { text: after }])
  const twoBlocks = await usageOf([{ text: 'Hello world.' }, { text: after }])
  const joined = await usageOf(`Hello world.${after}`)
  const afterCounted = await tokensOf($, model, after)
  const markEnd = both.cache_read_input_tokens + both.cache_creation_input_tokens
  if (markEnd === 0 || afterCounted === null) return { result: 'caching or counting unavailable', markEnd, afterCounted: afterCounted ?? -1 }
  const afterByApi = both.input_tokens - alone.input_tokens
  const blockBoundary = usageTotal(twoBlocks) - usageTotal(joined)
  const markAloneEnd = alone.cache_read_input_tokens + alone.cache_creation_input_tokens

  return {
    result: markAloneEnd === markEnd && afterByApi === afterCounted && blockBoundary === 0 ? 'exact' : 'MISMATCH',
    markAloneEnd,
    markEnd,
    closingOfThisRequest: alone.input_tokens,
    afterByApi,
    afterCounted,
    blockBoundary,
  }
}

/** Debug mode is on while the project holds `.claude/prompt-inspector.debug` (never committed). */
async function isDebug($: Engine): Promise<boolean> {
  try {
    return await $.fs.exists(`${await $.session.root()}/.claude/prompt-inspector.debug`)
  } catch {
    return false
  }
}

/**
 * Checks, for up to 12 placed pieces, the one assumption placing a piece
 * inside a block rests on: the block's tokens are the tokens before the piece,
 * the piece's, and the rest's (no token spans the piece's edges).
 */
async function boundaries($: Engine, model: string): Promise<string[]> {
  const pieces = await read($, injectionsAtom)
  const texts = await read($, textsAtom)
  const out: string[] = []
  for (const p of pieces) {
    if (out.length >= 12) break
    const text = texts[p.hash]
    const block = p.at === null ? undefined : texts[p.at.key]
    if (text === undefined || block === undefined || p.at === null) continue
    const rest = block.slice(p.at.offset + text.length)
    if (/\s$/.test(text)) {
      out.push(`${p.label}: ends in whitespace, size taken in place`)
      continue
    }
    const count = await countAll($, model, [text, rest, text + rest])
    const inPlace = (c => (c === null ? null : c - (count(rest) ?? 0)))(count(text + rest))
    out.push(`${p.label}: ${inPlace === count(text) ? 'exact' : `MISMATCH in place ${inPlace} vs alone ${count(text)}`}`)
  }

  return out
}

/**
 * Debug mode's report, for checking the inspector in a real session: measures
 * everything, runs the self-test (once per model) and the boundary check, and
 * lists the requests kept and every row of both views.
 */
/** Debug: the shape of messages (block types, nested content parts, heads of texts). */
function summarise(messages: readonly { role: string; content: readonly ApiBlock[] }[]): unknown[] {
  const head = (v: unknown) => (typeof v === 'string' ? v.slice(0, 70) : v)
  return messages.map(m => ({
    role: m.role,
    blocks: m.content.map(b => ({
      type: b.type,
      text: head(b.text),
      parts: Array.isArray(b.content) ? (b.content as ApiBlock[]).map(c => ({ type: c.type, text: head(c.text), chars: typeof c.text === 'string' ? c.text.length : 0 })) : head(b.content),
    })),
  }))
}

/**
 * The request as it was sent, read after it was: every message before this
 * response's (Claude Code may join messages, or add reminders to them, as it
 * sends them; the response, and tool results that came while it streamed, follow).
 */
function sentOf(before: readonly ApiMessage[], now: readonly ApiMessage[]): readonly ApiMessage[] {
  const answers = before.filter(m => m.role === 'assistant').length
  let seen = 0
  for (const [i, m] of now.entries()) {
    if (m.role !== 'assistant') continue
    seen++
    if (seen > answers) return now.slice(0, i)
  }

  return now.length >= before.length ? now : before
}

/** One API message as the session gives it. */
type ApiMessage = { role: string; content: readonly ApiBlock[] }

/** A tool result's text: its content, or its text parts joined (they are counted as one text); null when it holds an image. */
function resultText(block: ApiBlock): string | null {
  const raw = block.content
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) && raw.every(c => (c as ApiBlock).type === 'text')) return (raw as ApiBlock[]).map(c => String(c.text)).join('')

  return null
}

/**
 * What the Read tool showed of a file, as its piece: its output up to the
 * reminders Claude Code joined after it, with its exact size there. A text's
 * size is from a proven cut; a PDF's or a picture's, from its output counted
 * on its own. Its text is the output, or for images the
 * tool call's id (what tells it is still in the conversation). Null when the
 * read showed nothing.
 */
async function readShown($: Engine, model: string, block: ApiBlock): Promise<{ text: string; at: { size: number } | string } | null> {
  if (block.is_error === true) return null
  const content = resultText(block)
  if (content !== null) {
    const open = content.indexOf('<system-reminder>')
    const to = (open < 0 ? content : content.slice(0, open)).trimEnd().length
    // The Read tool shows a text as numbered lines; anything else (a note that the file is unchanged) is not the file.
    if (to === 0 || !/^ *\d+\t/.test(content)) return null

    return { text: content.slice(0, to), at: await sizeInResult(c => placeSpan($, model, c, 0, to, 0), content) }
  }
  // A PDF or a picture: the tool's output (its note and the pages), without the reminders joined after it.
  const parts = Array.isArray(block.content) ? (block.content as ApiBlock[]) : []
  const isReminder = (b: ApiBlock) => b.type === 'text' && String(b.text).trimStart().startsWith('<system-reminder>')
  const own = parts.filter(b => !isReminder(b))
  if (!own.some(b => b.type === 'image' || b.type === 'document')) return null

  return { text: String(block.tool_use_id), at: await partsSize($, model, own) }
}

/**
 * The exact tokens of a tool's output of pages (a PDF's, a picture), counted on
 * its own. Pages and the text beside them do not add up part by part (a page
 * next to text costs a few tokens more), so the output is counted whole, and
 * what Claude Code joins after it is not part of it.
 */
async function partsSize($: Engine, model: string, own: readonly ApiBlock[]): Promise<{ size: number } | string> {
  const [mine, dot] = await Promise.all([toolResultTokens($, model, own), toolResultTokens($, model, '.')])
  if (mine === null || dot === null) return 'the API count failed'

  return { size: mine - dot + 1 }
}

/** The inspector's own debug calls: their results quote every piece, and are none of them. */
const ownCalls = new Set<string>()

const isOwnResult = (b: ApiBlock) => b.type === 'tool_result' && ownCalls.has(String(b.tool_use_id))

/** Whether a message holds the text inside a block that is not text (a tool result). */
function isInBlock(message: ApiMessage | undefined, text: string, isText: boolean): boolean {
  if (message === undefined || text === '') return false
  const escaped = JSON.stringify(text).slice(1, -1)

  return message.content.some(b => (b.type === 'text') === isText && !isOwnResult(b) && JSON.stringify(b).includes(escaped))
}

/** A piece inside a tool result: its exact size, never a place (IN_TOOL_RESULT); or why not even that. */
function withPlace(p: Piece, at: { size: number } | string | undefined): Piece {
  if (at === undefined) return p
  if (typeof at === 'string') return { ...p, at: null, lost: `${IN_TOOL_RESULT} (${at})`, inResult: true }

  return { ...p, at: null, tokens: at.size, lost: IN_TOOL_RESULT, inResult: true }
}

/**
 * The message, among the last ones, that holds a piece announced only after its
 * request was sent, and that request: whose last message it was. In a text
 * block it is placed later from the request's texts; in a tool result, now.
 */
async function findLate($: Engine, text: string, messages: readonly ApiMessage[], steps: readonly Step[]): Promise<{ step: number; isText: boolean; at: { size: number } | string | undefined } | null> {
  if (text === '') return null
  const escaped = JSON.stringify(text).slice(1, -1)
  for (let m = messages.length - 1; m >= Math.max(0, messages.length - 8); m--) {
    const message = messages[m]
    if (message === undefined || message.role !== 'user') continue
    const j = message.content.findIndex(b => !isOwnResult(b) && JSON.stringify(b).includes(escaped))
    if (j < 0) continue
    // Only this request or the one before: a reminder is announced at most one request late.
    const carrying = steps.slice(-2).reverse().find(s => s.messageCount === m + 1)
    if (carrying === undefined) return null
    const block = message.content[j]
    if (block === undefined || block.type === 'text') return { step: carrying.id, isText: true, at: undefined }
    const content = block.type === 'tool_result' ? resultText(block) : null
    const at = content === null ? 'not text' : await sizeInResult(c => placeInResult($, carrying.model, c, text, 0), content)

    return { step: carrying.id, isText: false, at }
  }

  return null
}

/**
 * Why a piece inside a tool result has no range: the API reports where a tool
 * result's message ends, not where its text ends (a mark inside it is refused,
 * one on it holds to the message's end), so the tool result's closing tokens are
 * unknown, and with them where its text lies.
 */
const IN_TOOL_RESULT = 'inside a tool result, whose closing tokens the API does not report'

/** A piece sized inside a tool result (or one that could not be). */
const isInToolResult = (p: Piece) => p.inResult === true || (p.lost?.startsWith(IN_TOOL_RESULT) ?? false)

/** The exact tokens of a piece inside a tool result's content (its place there cannot be proven: IN_TOOL_RESULT). */
async function sizeInResult(place: (content: string, blockEnd: number) => Promise<{ start: number; end: number } | string>, content: string): Promise<{ size: number } | string> {
  const at = await place(content, 0)

  return typeof at === 'string' ? at : { size: at.end - at.start }
}

/** Your instruction files and their texts, read once a message. */
let fileCache: { message: number; files: { path: string; rel: string; text: string }[] } | null = null

async function filesNow($: Engine, message: number): Promise<{ path: string; rel: string; text: string }[]> {
  if (fileCache !== null && fileCache.message === message) return fileCache.files
  const files: { path: string; rel: string; text: string }[] = []
  for (const path of await yourFiles($)) {
    try {
      const text = (await $.fs.read(path)) as string
      if (text.trim() !== '') files.push({ path, rel: await shortPath($, path), text })
    } catch {
      // Unreadable: not looked for.
    }
  }
  fileCache = { message, files }

  return files
}

/** Where a file's text is in a tool result: as the Read tool shows it (numbered lines), or as it is (a command printed it). */
function fileSpan(content: string, text: string): { from: number; to: number } | null {
  const numbered = text.split('\n').map((line, i) => `${i + 1}\t${line}`).join('\n')
  // To its last character that shows: the white space after it belongs with what follows (a cut there is between tokens).
  // Whole lines only: a file's text met inside a longer line (another file, a log) is not that file.
  for (const t of [numbered.trimEnd(), text.trimEnd()]) {
    if (t.trim() === '') continue
    for (let at = content.indexOf(t); at >= 0; at = content.indexOf(t, at + 1)) {
      const to = at + t.length
      if ((at === 0 || content[at - 1] === '\n') && (to === content.length || /\s/.test(content[to] ?? ''))) return { from: at, to }
    }
  }

  return null
}

/**
 * Your instruction files whose text is in the tool results of a request's last
 * message (Claude read one, or a command printed it): each becomes a piece of
 * yours, with its exact size there. A file Claude Code injected itself
 * (`Contents of …`) is its own piece already.
 */
async function recordFiles($: Engine, message: ApiMessage, asked: ApiMessage | undefined, step: Step, instance: number, turn: number): Promise<void> {
  const files = [...(await filesNow($, turn))]
  // A file the tools were asked about by path (a Read of it, a command naming it): read now, so one made this turn counts too.
  const root = await $.session.root()
  const named = new Set<string>()
  for (const b of asked?.content ?? []) {
    if (b.type !== 'tool_use') continue
    for (const m of JSON.stringify(b.input ?? {}).matchAll(/[\w./~-]*(?:CLAUDE(?:\.local)?\.md|\.claude\/rules\/[\w./-]+\.md)/g)) named.add(m[0])
    // Any file of yours a command names (`cat notes.md`): what it prints of it is looked for in its output.
    if (b.name === 'Bash') for (const word of String((b.input as { command?: unknown } | undefined)?.command ?? '').split(/[\s;&|<>()'"`]+/)) if (/^[\w./~-]+\.\w+$/.test(word)) named.add(word)
  }
  for (const name of named) {
    const path = name.startsWith('/') ? name : `${root}/${name.replace(/^\.\//, '')}`
    if (files.some(f => f.path === path) || /\/\.claude\/skills\/prompt-inspector\/|\/node_modules\//.test(path) || MEDIA.test(path) || !(await isYourFile($, path))) continue
    try {
      const text = (await $.fs.read(path)) as string
      if (text.trim() !== '') files.push({ path, rel: await shortPath($, path), text })
    } catch {
      // Not a file: nothing to look for.
    }
  }
  const pieces = await read($, injectionsAtom)
  const added: Piece[] = []
  const texts: Record<string, string> = {}
  const toolOf = new Map((asked?.content ?? []).filter(b => b.type === 'tool_use').map(b => [String(b.id), String(b.name)]))
  for (const [j, block] of message.content.entries()) {
    if (block.type !== 'tool_result') continue
    // The inspector's own report quotes everything: not a read.
    if ((toolOf.get(String(block.tool_use_id)) ?? '').startsWith('mcp__prompt-inspector')) continue
    const content = resultText(block)
    if (content === null) continue
    const spans = files.map(f => ({ f, span: fileSpan(content, f.text) })).filter((x): x is { f: (typeof files)[number]; span: { from: number; to: number } } => x.span !== null)
    for (const { f, span } of spans) {
      // Inside another file's text (one file quoting another): that other file's.
      if (spans.some(o => o.f !== f && o.span.from <= span.from && span.to <= o.span.to && o.span.to - o.span.from > span.to - span.from)) continue
      if (content.slice(Math.max(0, span.from - 400), span.from).includes(`Contents of ${f.path}`)) continue
      const key = `file:${f.rel}@${instance}`
      if (pieces.some(p => p.key === key) || added.some(p => p.key === key)) continue
      const spanText = content.slice(span.from, span.to)
      const at = await sizeInResult(c => placeSpan($, step.model, c, span.from, span.to, 0), content)
      const base = piece({ key, group: `file:${f.rel}`, kind: 'rule', zone: 'conversation', label: f.rel, isYours: true, attachment: 'file' }, spanText, turn)
      added.push(withPlace({ ...base, step: step.id }, at))
      texts[base.hash] = spanText
    }
  }
  // Any other file of yours Claude read (a text, a PDF, a picture): as the Read tool showed it.
  for (const use of asked?.content ?? []) {
    if (use.type !== 'tool_use' || use.name !== 'Read') continue
    const path = (use.input as { file_path?: unknown } | undefined)?.file_path
    if (typeof path !== 'string' || files.some(f => f.path === path) || !(await isYourFile($, path))) continue
    const block = message.content.find(b => b.type === 'tool_result' && b.tool_use_id === use.id)
    const rel = await shortPath($, path)
    const key = `file:${rel}@${instance}`
    if (block === undefined || pieces.some(p => p.key === key) || added.some(p => p.key === key)) continue
    const shown = await readShown($, step.model, block)
    if (shown === null) continue
    const base = piece({ key, group: `file:${rel}`, kind: 'rule', zone: 'conversation', label: rel, isYours: true, attachment: 'file' }, shown.text, turn)
    added.push(withPlace({ ...base, step: step.id }, shown.at))
    texts[base.hash] = shown.text
  }
  if (added.length === 0) return
  await remember($, texts)
  await update($, injectionsAtom, list => [...list, ...added])
}

/** A call to the API itself, through the session's credential (`betas`: any it needs beyond the credential's own). */
async function apiCall($: Engine, path: string, body: unknown, betas: readonly string[] = []): Promise<{ status: number; json: Record<string, any> | null; text: string }> {
  // An engine without `authorize` is asked without a credential (the API refuses it, and nothing is placed).
  let auth: { handle: string | undefined; kind: 'bearer' | 'api-key' } | null
  try {
    auth = await $.session.authorize()
  } catch {
    auth = { handle: undefined, kind: 'api-key' }
  }
  if (auth === null) return { status: 0, json: null, text: 'no credential' }
  const headers: Record<string, string> = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }
  const beta = [...(auth.kind === 'bearer' ? ['oauth-2025-04-20'] : []), ...betas]
  if (beta.length > 0) headers['anthropic-beta'] = beta.join(',')
  const r = await $.http.fetch(`https://api.anthropic.com${path}`, { method: 'POST', headers, body: JSON.stringify(body), auth: auth.handle })
  let json: Record<string, any> | null = null
  try {
    json = JSON.parse(r.text)
  } catch {
    json = null
  }

  return { status: r.status, json, text: r.text.slice(0, 300) }
}

/**
 * Tokens of a tool result's content as the API counts it (the same message shape
 * as the request, so the closing and framing are the same), through the session's
 * own credential. The count is cached. Null when the API can't be reached.
 */
async function toolResultTokens($: Engine, model: string, content: string | readonly unknown[]): Promise<number | null> {
  const key = `tr:${model}:${hash(typeof content === 'string' ? content : JSON.stringify(content))}`
  const stored = await $.store.get(key)
  if (typeof stored === 'number') return stored
  const messages = [
    { role: 'user', content: [{ type: 'text', text: '.' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01', name: 'Bash', input: { command: 'ls' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content }] },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await apiCall($, '/v1/messages/count_tokens', { model, messages })
      const n = r.json?.input_tokens
      if (typeof n === 'number') {
        await $.store.set(key, n)

        return n
      }
    } catch {
      // Tried once more, then not measured.
    }
  }

  return null
}

/**
 * Where a reminder lies inside a tool result's content, counted back from
 * `blockEnd` standing for where the content ends: the content's tokens after
 * it are the whole content's minus those up to it, and each cut is proven to
 * fall between two tokens (the text before it plus the text after it, counted
 * alone, equal the whole). The range takes in the reminder's tags and the
 * blank lines before it. Answers why not, when not.
 */
async function placeInResult($: Engine, model: string, content: string, text: string, blockEnd: number): Promise<{ start: number; end: number } | string> {
  const at = content.indexOf(text)
  if (at < 0 || text.trim() === '') return 'text not in content'
  let from = at
  let to = at + text.length
  const open = content.lastIndexOf('<system-reminder>', at)
  if (open >= 0 && at - open <= 24) from = open
  const closing = '</system-reminder>'
  const close = content.indexOf(closing, to)
  if (close >= 0 && close - to <= 8) to = close + closing.length

  return placeSpan($, model, content, content.slice(0, from).trimEnd().length, to, blockEnd)
}

/**
 * Where the characters `from`..`to` of a tool result's content lie, counted
 * back from `blockEnd` standing for where the content ends: the span ends the
 * content's tokens after it before that, and starts the tokens from it on
 * before that. A count alone is the content's count less
 * that of one '.' (one token), plus one. Each cut must fall between two
 * tokens: the text before it and the text after it, counted alone, add up to
 * the whole. Answers why not, when not.
 */
async function placeSpan($: Engine, model: string, content: string, from: number, to: number, blockEnd: number): Promise<{ start: number; end: number } | string> {
  if (from < 0 || to <= from || to > content.length) return 'no span'
  const [whole, dot] = await Promise.all([toolResultTokens($, model, content), toolResultTokens($, model, '.')])
  if (whole === null || dot === null) return 'the API count failed'
  const alone = (n: number) => n - dot + 1
  const wholeAlone = alone(whole)
  // Tokens from a cut to the content's end, when the cut falls between two tokens (the text before it and the text after
  // it, counted alone, add up to the whole); null when it falls inside one; undefined when the API failed.
  const fromCut = async (cut: number): Promise<number | null | undefined> => {
    if (cut <= 0) return wholeAlone
    if (cut >= content.length) return 0
    const [before, after] = await Promise.all([toolResultTokens($, model, content.slice(0, cut)), toolResultTokens($, model, content.slice(cut))])
    if (before === null || after === null) return undefined
    return alone(before) + alone(after) === wholeAlone ? alone(after) : null
  }
  // A cut inside a token moves over the white space next to it (a line break joined to the last word): the range then
  // takes in that white space, and nothing else.
  const nearby = (cut: number, step: 1 | -1): number[] => {
    const cuts = [cut]
    for (let c = cut; cuts.length < 5; ) {
      const ch = step === 1 ? content[c] : content[c - 1]
      if (ch === undefined || !/\s/.test(ch)) break
      c += step
      cuts.push(c)
    }
    return cuts
  }
  let startTokens: number | null = null
  for (const cut of nearby(from, -1)) {
    const n = await fromCut(cut)
    if (n === undefined) return 'the API count failed'
    if (n !== null) {
      startTokens = n
      break
    }
  }
  if (startTokens === null) return 'its start falls inside a token'
  let endTokens: number | null = null
  for (const cut of nearby(to, 1)) {
    const n = await fromCut(cut)
    if (n === undefined) return 'the API count failed'
    if (n !== null) {
      endTokens = n
      break
    }
  }
  if (endTokens === null) return 'its end falls inside a token'

  return { start: blockEnd - startTokens, end: blockEnd - endTokens }
}

async function report($: Engine): Promise<Record<string, unknown>> {
  // Debug only: `.claude/prompt-inspector.act` holds {"label", "action": "delete" | "move"} to press 🗑 or 🔄 on a row.
  let acted: string | null = null
  const actFile = `${await $.session.root()}/.claude/prompt-inspector.act`
  try {
    const raw = ((await $.fs.read(actFile)) as string).trim()
    if (raw !== '') {
      const want = JSON.parse(raw) as { label: string; action: string }
      const row = (await rowsFor($, 'yours')).rows.find(r => r.label === want.label)
      if (want.action === 'compacted') {
        await $.store.set(`compacted:${await $.session.id()}`, true)
        acted = 'marked compacted'
      } else if (row === undefined) acted = `no row ${want.label}`
      else if (want.action === 'delete') {
        await remove($, row.group)
        acted = `deleted ${row.key}`
      } else {
        acted = `${(await moveToEnd($, row)) ? 'moved' : 'could not move'} ${row.key}`
      }
      await $.fs.write(actFile, '')
    }
  } catch {
    // No action asked.
  }
  await measure($, 'all')
  const steps = await read($, requestsAtom)
  const model = steps[steps.length - 1]?.model ?? (await $.session.model())
  const done = (await $.store.get(`selftest2:${model}`)) as Record<string, number | string | boolean> | undefined
  const test = done ?? (await selfTest($, model))
  if (done === undefined) await $.store.set(`selftest2:${model}`, test)
  const exact = exactSteps(steps)
  const yours = await rowsFor($, 'yours')
  const all = await rowsFor($, 'all')

  return {
    selfTest: test,
    boundaries: await boundaries($, model),
    promptStart: await read($, promptStartAtom),
    requests: steps.slice(-8).map(({ tail, change, ...step }) => ({
      ...step,
      isExact: exact.has(step.id),
      tailBlocks: tail.length,
      change: change.kind === 'unknown' ? 'unknown' : { blocks: change.blocks.length, brokenAt: change.brokenAt, system: typeof change.system === 'string' ? change.system : 'changed' },
    })),
    acted,
    removed: await read($, removedAtom),
    moved: await read($, movedAtom),
    countErrors,
    lastMessages: summarise(((await $.session.messages({ as: 'api' })) as readonly { role: string; content: readonly ApiBlock[] }[]).slice(-3)),
    // Your pieces as kept: their text, the request they are placed in and where, or why not.
    pieces: await (async () => {
      const kept = await read($, textsAtom)

      return (await read($, injectionsAtom)).filter(p => p.isYours || p.copyOf !== null).map(p => ({ key: p.key, label: p.label, step: p.step, at: p.at, lost: p.lost, tokens: p.tokens, text: kept[p.hash] ?? null }))
    })(),
    yours: yours.rows.map(r => `${cardLabel(r)}  [${describe(r)}]`),
    earlier: yours.earlier,
    all: all.rows.slice(0, (await $.fs.exists(`${await $.session.root()}/.claude/prompt-inspector.brief`)) ? 3 : undefined).map(r => `${cardLabel(r)}  [${describe(r)}]`),
  }
}

/** At each turn's end in debug mode: the report, written to `.claude/prompt-inspector.report.json`. */
async function debugReport($: Engine): Promise<void> {
  if (!(await isDebug($))) return
  await $.fs.write(`${await $.session.root()}/.claude/prompt-inspector.report.json`, JSON.stringify(await report($), null, 2))
}

/** Drops what nothing needs any more: old requests no piece is placed in, and texts nothing refers to. */
async function prune($: Engine): Promise<void> {
  const pieces = await read($, injectionsAtom)
  const steps = await read($, requestsAtom)
  const start = await read($, promptStartAtom)
  const last = steps[steps.length - 1]
  if (last === undefined || last.id % 20 !== 0) return
  const used = [...pieces.filter(p => p.step !== null && p.was === null && p.lost === null).map(p => p.step ?? last.id), ...(start === null ? [] : [start.step])]
  const oldest = Math.min(last.id, ...used)
  const isRetry = (p: Piece) => p.lost === null || ['counting failed', 'the closing'].some(why => p.lost?.startsWith(why) ?? false)
  const waiting = new Set(pieces.filter(p => p.at === null && isRetry(p) && p.was === null && p.step !== null).map(p => p.step))
  // A request that carried a change keeps its whole form while a piece the change moved waits to be placed again.
  const lostAt = new Set(pieces.filter(p => p.at === null && Object.values(LOST).includes(p.lost ?? '')).map(p => steps.find(s => s.id > (p.step ?? 0))?.id))
  const kept = steps.filter(s => s.id >= oldest).map(s => (waiting.has(s.id) || s.id >= last.id - 1 ? s : { ...s, tail: [], wire: undefined, ...(lostAt.has(s.id) ? {} : { whole: undefined }) }))
  const refs = new Set<string>()
  for (const p of pieces) {
    refs.add(p.hash)
    if (p.at !== null) refs.add(p.at.key)
  }
  for (const s of kept) {
    for (const k of s.tail) refs.add(k)
    if (s.wire !== undefined) refs.add(s.wire)
    if (s.whole !== undefined) refs.add(s.whole)
    if (s.change.kind === 'known') {
      for (const c of s.change.blocks) for (const k of [c.before, c.after]) if (k !== null) refs.add(k)
      if (typeof s.change.system !== 'string') for (const k of [...s.change.system.before, ...s.change.system.after]) refs.add(k)
    }
  }
  for (const k of (await read($, systemAtom))?.sides ?? []) refs.add(k)
  await update($, requestsAtom, () => kept)
  await update($, textsAtom, texts => Object.fromEntries(Object.entries(texts).filter(([k]) => refs.has(k))))
}

/** After a compaction or /clear, a piece moved by 🔄 no longer has its copy: it goes back to its place. */
async function forgetMoves($: Engine): Promise<void> {
  await update($, movedAtom, () => ({}))
  await update($, savedAtom, () => ({}))
  await persist($)
}

function originOf(origin: PromptAttachmentOrigin, type: string): string {
  if (origin.kind === 'hook') return `${type} from a ${origin.event} hook`
  if (origin.kind === 'plugin') return `${type} from a plugin`

  return type
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'inspect',
      description: 'Your rules and skills in the prompt, at exact token positions: delete or re-inject them',
      argumentHint: '[all]',
      immediate: true,
    })
    previous = null
    try {
      isJoinedLate = (await $.session.messages()).length > 0 && (await read($, requestsAtom)).length === 0
    } catch {
      isJoinedLate = false
    }
    // Debug mode only: a tool that returns the report, so a session can check the inspector mid-turn.
    if (await isDebug($)) {
      await $.tool.register({
        name: 'debug',
        description: 'Prompt inspector debug mode: measures every injected piece, runs the exactness self-test, and returns the report as JSON.',
        isDeferred: false,
      })
    }
    await refreshYours($)
    await learnRoles($)
    // A resumed session: what the person deleted or moved keeps applying.
    try {
      const isEmpty = (await read($, removedAtom)).length === 0 && Object.keys(await read($, movedAtom)).length === 0
      const kept = isEmpty ? ((await $.store.get(`choices:${await $.session.id()}`)) as { removed: string[]; moved: Record<string, Move>; saved: Record<string, string> } | undefined) : undefined
      if (kept !== undefined) {
        await update($, removedAtom, () => kept.removed)
        await update($, movedAtom, () => kept.moved)
        await update($, savedAtom, () => kept.saved)
      }
    } catch {
      // No session bound yet, or nothing kept.
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, messageAtom, n => n + 1)

    return next(e)
  })

  // Each request of the main conversation: its exact size, how it differs from the one before, and its last message.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const api = await $.session.messages({ as: 'api' })
    const flat = flatKeys(api)
    const lastMessage = api[api.length - 1]
    const tail = lastMessage === undefined || lastMessage.role !== 'user' ? [] : lastMessage.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? textKey(b.text) : '-'))
    const system = await read($, systemAtom)
    // Kept: the last message's texts (the request as sent is read again once it is sent).
    await remember($, Object.fromEntries(Object.entries(flat.texts).filter(([k]) => tail.includes(k))))
    // A piece already listed whose text arrives again with this message: another injection of it.
    const message = await read($, messageAtom)
    const texts = await read($, textsAtom)
    const tailTexts = tail.map(k => texts[k] ?? '')
    const again: Piece[] = []
    for (const p of await read($, injectionsAtom)) {
      const text = texts[p.hash]
      if (p.zone !== 'conversation' || p.attachment === null || p.attachment === 'file' || p.copyOf !== null || p.step === null || text === undefined) continue
      if (!tailTexts.some(t => t.includes(text))) continue
      const key = keys.instance(p.key, message * 1000 + e.index)
      again.push({ ...p, key, group: p.group, message, step: null, at: null, was: null, lost: null })
    }
    if (again.length > 0) {
      const known = new Set((await read($, injectionsAtom)).map(p => p.key))
      const fresh = again.filter(p => !known.has(p.key))
      if (fresh.length > 0) await update($, injectionsAtom, list => [...list, ...fresh])
    }

    // After a compaction: what is no longer in the conversation is not listed; the rest is placed again from this request.
    const compactedKey = `compacted:${await $.session.id()}`
    if ((await $.store.get(compactedKey)) === true) {
      await $.store.set(compactedKey, false)
      const pieces = await read($, injectionsAtom)
      const attachments = new Set(pieces.filter(p => p.attachment !== null).map(p => p.hash))
      const haystack = JSON.stringify(toWire(api, promoterOf(pieces), attachments))
      const kept = await read($, textsAtom)
      await update($, injectionsAtom, list =>
        list.flatMap(p => {
          if (p.zone === 'system') return [p]
          // A copy 🔄 sent is summarized away with the rest (what was moved goes back to its place).
          if (p.copyOf !== null) return []
          const text = kept[p.hash] ?? ''
          const isThere = text !== '' && haystack.includes(JSON.stringify(text).slice(1, -1))

          return isThere ? [{ ...p, step: null, at: null, was: null, lost: null, isEarlier: false }] : []
        }),
      )
      await update($, promptStartAtom, () => null)
      previous = null
    }
    // Only what waited before this request was sent: a skill used while the answer streams belongs to the next one.
    const waiting = new Set((await read($, injectionsAtom)).filter(p => p.step === null && p.zone !== 'system').map(p => p.key))
    const result = yield* next(e)
    const usage = result.usage
    // The request as it was sent: Claude Code joins some reminders into its messages only as it sends them.
    const asViewed = sentOf(api as readonly ApiMessage[], (await $.session.messages({ as: 'api' })) as readonly ApiMessage[])
    // As the model receives it: a model that takes system turns gets most reminders as one, after the user message.
    const pieces = await read($, injectionsAtom)
    const attachments = new Set(pieces.filter(p => p.attachment !== null).map(p => p.hash))
    const sent = takesSystemTurns(usage?.model ?? e.model) ? toWire(asViewed, promoterOf(pieces), attachments) : asViewed
    const sentFlat = flatKeys(sent)
    const sentLast = sent[sent.length - 1]
    const sentTail = sentLast === undefined || sentLast.role !== 'user' ? [] : sentLast.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? (b.isSystemTurn === true ? turnKey(b.text) : textKey(b.text)) : '-'))
    const systemTurn = sentLast === undefined || sentLast.role !== 'user' ? -1 : sentLast.content.findIndex(b => b.isSystemTurn === true)
    const sentDiff = previous === null ? null : diffBlocks(previous.keys, sentFlat.keys)
    const change: Change =
      previous === null || sentDiff === null ? { kind: 'unknown' } : { kind: 'known', blocks: sentDiff.blocks, brokenAt: sentDiff.brokenAt, system: systemChange(previous.system, system) }
    const sentKeep = new Set([...sentTail, ...(change.kind === 'known' ? change.blocks.map(c => c.after).filter((k): k is string => k !== null) : [])])
    await remember($, Object.fromEntries(Object.entries(sentFlat.texts).filter(([k]) => sentKeep.has(k))))
    previous = { keys: sentFlat.keys, system }
    if (usage === null) return result
    const end = usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    // Its end as sent, kept to count: what a piece in its last message is placed by.
    const wire = wireTail(sent)
    const wireJson = wire === null ? null : JSON.stringify(wire.messages)
    const wireKey = wireJson === null ? undefined : `w:${textKey(wireJson)}`
    if (wireJson !== null && wireKey !== undefined) await remember($, { [wireKey]: wireJson })
    const lastSent = wire?.messages[wire.messages.length - 1]
    const lastText = [...(lastSent?.content ?? [])].reverse().find(b => b.type === 'text' || b.type === 'tool_result')
    const endsInSpace = lastText === undefined || typeof lastText.text !== 'string' || /\s$/.test(lastText.text)
    const isWhole = (result.serverToolUses?.length ?? 0) === 0
    // A request that changed what came before (a deletion, a move): kept whole, where a piece the change moved is placed again.
    const isEdited = change.kind === 'known' && (change.blocks.length > 0 || change.brokenAt !== null)
    const sentJson = isEdited ? JSON.stringify(sent) : null
    const wholeKey = sentJson === null ? undefined : `S:${textKey(sentJson)}`
    if (sentJson !== null && wholeKey !== undefined) await remember($, { [wholeKey]: sentJson })
    let id = 0
    let before: Step | undefined
    await update($, requestsAtom, steps => {
      before = steps[steps.length - 1]
      id = (before?.id ?? -1) + 1
      const step: Step = {
        id,
        message,
        index: e.index,
        // The API messages it carried, as sent (the engine's own count includes rows the API never sees).
        messageCount: sent.length,
        total: usageTotal(usage),
        end,
        cacheRead: usage.cache_read_input_tokens,
        uncached: usage.input_tokens,
        // Few tokens uncached: the cache mark may sit at the last block's end (exactSteps decides).
        isAnchor: usage.input_tokens <= 8 && (result.serverToolUses?.length ?? 0) === 0,
        blocks: sentFlat.keys.length,
        tail: sentTail,
        ...(systemTurn >= 0 ? { systemTurn } : {}),
        ...(wireKey !== undefined && wire !== null ? { wire: wireKey, wireFirst: wire.first, lastRole: lastSent?.role ?? '' } : {}),
        endsInSpace,
        isWhole,
        thinkingAt: sentFlat.keys.flatMap((k, i) => (k.startsWith('x:thinking:') ? [i] : [])),
        ...(wholeKey !== undefined ? { whole: wholeKey } : {}),
        change,
        model: usage.model,
      }

      return [...steps, step]
    })
    const known = await read($, textsAtom)
    const tailNow = sentTail.map(k => known[k] ?? '')
    const prior = before?.id
    const isExactNow = usage.input_tokens === 2
    // Waiting pieces this request carries in its last message are bound to it; one announced only after the request it rode
    // with was sent is found below, in the messages.
    await update($, injectionsAtom, list =>
      list.map(p => {
        if (p.step === null) {
          const text = known[p.hash] ?? ''
          if (text === '') return p
          const isInText = tailNow.some(t => t.includes(text)) || (p.parent === null && waiting.has(p.key) && blockOf(tailNow, text) >= 0)
          if (isInText) return { ...p, step: id, isEarlier: false, lost: null }
          // A file of yours moved out of its read is its own text block: never the same text met inside a tool result.
          if (p.attachment === 'file') return p
          if (isInBlock(sentLast, text, false)) return { ...p, step: id, isEarlier: false, lost: 'sent inside a tool result' }
          if (waiting.has(p.key) && isJoinedLate && before === undefined) return { ...p, isEarlier: true }

          return p
        }
        // The cache proves everything up to its end unchanged: the same place in this request.
        if (p.at !== null && p.step === prior && usage.cache_read_input_tokens >= p.at.end) return { ...p, step: id }

        return p
      }),
    )
    const stepNow = (await read($, requestsAtom)).find(x => x.id === id)
    // A reminder joined into a tool result of this request's last message: its exact size from the API's own counts.
    const inTool = (await read($, injectionsAtom)).filter(p => p.step === id && p.lost === 'sent inside a tool result')
    if (inTool.length > 0 && stepNow !== undefined && sentLast !== undefined) {
      const placed = await Promise.all(
        inTool.map(async p => {
          const text = known[p.hash] ?? ''
          const escaped = JSON.stringify(text).slice(1, -1)
          const j = sentLast.content.findIndex(b => b.type !== 'text' && JSON.stringify(b).includes(escaped))
          const block = sentLast.content[j]
          const content = block === undefined || block.type !== 'tool_result' ? null : resultText(block)
          const at = content === null ? 'not in a tool result of text' : await sizeInResult(c => placeInResult($, stepNow.model, c, text, 0), content)

          return { key: p.key, at }
        }),
      )
      await update($, injectionsAtom, list =>
        list.map(p => {
          const hit = placed.find(x => x.key === p.key)

          return hit === undefined ? p : withPlace(p, hit.at)
        }),
      )
    }
    // Announced after the request that carried it was sent: the message that holds it, and the request whose last message
    // it was.
    const late = (await read($, injectionsAtom)).filter(p => p.step === null && p.zone !== 'system' && !p.isEarlier && p.attachment !== 'file')
    if (late.length > 0) {
      const steps = await read($, requestsAtom)
      const fresh = await read($, textsAtom)
      const found = await Promise.all(late.map(async p => ({ key: p.key, hit: await findLate($, fresh[p.hash] ?? '', sent, steps) })))
      // What waited before this request and is in none of its messages: not found as sent.
      const missing = new Set(late.filter(p => waiting.has(p.key) && found.find(f => f.key === p.key)?.hit === null).map(p => p.key))
      // Found further back, in a request the inspector did not see (it joined the conversation late): sent before it started.
      const history = missing.size > 0 && isJoinedLate ? JSON.stringify(sent) : ''
      const isOlder = (p: Piece) => history !== '' && (fresh[p.hash] ?? '') !== '' && history.includes(JSON.stringify(fresh[p.hash]).slice(1, -1))
      await update($, injectionsAtom, list =>
        list.map(p => {
          if (missing.has(p.key)) return isOlder(p) ? { ...p, isEarlier: true } : { ...p, step: id, lost: 'not found in its request as sent' }
          const hit = found.find(f => f.key === p.key)?.hit
          if (hit === undefined || hit === null) return p
          const bound = { ...p, step: hit.step, isEarlier: false, lost: null }

          return hit.isText ? bound : withPlace(bound, hit.at)
        }),
      )
    }
    // Your instruction files whose text came back in a tool result of this request's last message (Claude read one, or a
    // command printed it).
    try {
      if (stepNow !== undefined && sentLast !== undefined && sentLast.role === 'user') await recordFiles($, sentLast, sent[sent.length - 2], stepNow, message * 1000 + e.index, message)
    } catch (err) {
      countErrors = [...countErrors.slice(-9), `files: ${err instanceof Error ? err.message : String(err)}`]
    }
    const start = await read($, promptStartAtom)
    if (start !== null && start.step === prior && usage.cache_read_input_tokens >= start.at) await update($, promptStartAtom, () => ({ at: start.at, step: id }))
    await prune($)

    return result
  })

  // 🗑 on a file Claude read: later reads of it stop (what was read stays where it is).
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const path = typeof e.file_path === 'string' ? e.file_path : ''
    if (path === '' || e.agentId !== undefined) return next(e)
    const removed = await read($, removedAtom)
    if (!removed.some(g => g.startsWith('file:'))) return next(e)
    const name = await shortPath($, path.startsWith('/') ? path : `${await $.session.root()}/${path}`)
    if (removed.includes(`file:${name}`)) return { deny: `${name} is left out of the context for this test (prompt inspector).` }

    return next(e)
  })

  on('tool.call', { tool: /^mcp__prompt-inspector__debug$/ }, async ($, e, next) => {
    const id = (e as { tool_use_id?: unknown }).tool_use_id
    if (typeof id === 'string') ownCalls.add(id)
    try {
      return { result: JSON.stringify(await report($), null, 2) }
    } catch (err) {
      return { deny: `The report failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}` }
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId === undefined) await debugReport($)
    } catch {
      // Debug mode only: a failed report changes nothing.
    }

    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await forgetMoves($)
      invalidate($)
      // The next request is the compacted conversation's first: every place is taken again from it.
      await $.store.set(`compacted:${await $.session.id()}`, true)
    }

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, injectionsAtom, () => [])
      await update($, requestsAtom, () => [])
      await update($, textsAtom, () => ({}))
      await update($, messageAtom, () => 0)
      await update($, promptStartAtom, () => null)
      await forgetMoves($)
      previous = null
    }

    return next(e)
  })

  // The system prompt, section by section: sized exactly; its position is inside tools + system prompt.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const out = await gone($)
    const kept = result.sections.filter(s => !out.has(keys.section(s.id)))
    if (!e.traits.includes('analysis')) {
      await record(
        $,
        result.sections.map(s => ({
          piece: piece({ key: keys.section(s.id), kind: 'section', zone: 'system', label: `system: ${s.id}` }, s.text, 0),
          text: s.text,
        })),
      )
      // Each side of the cache boundary is its sections joined by a blank line: what a deletion changes.
      const sides = (['shared', 'session'] as const).map(scope =>
        kept
          .filter(s => s.scope === scope)
          .map(s => s.text)
          .join('\n\n'),
      )
      await remember($, Object.fromEntries(sides.map(t => [textKey(t), t])))
      const snapshot: SystemSnapshot = { sides: sides.map(textKey), tools: e.tools.join(',') }
      await update($, systemAtom, () => snapshot)
    }

    return kept.length === result.sections.length ? result : { sections: kept }
  })

  // The first message's context: CLAUDE.md files and rules (claudeMd), and its other blocks.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const files = result.instructionFiles ?? e.instructionFiles ?? []
    const memory = result.blocks.find(b => b.name === 'claudeMd')
    const spans = memory === undefined ? [] : spansOfFiles(memory.text, files)
    const seen: { piece: Piece; text: string }[] = []
    for (const block of result.blocks) {
      if (block.text.length === 0) continue
      const label = block.name === 'claudeMd' ? 'context: CLAUDE.md files' : `context: ${block.name}`
      seen.push({ piece: piece({ key: keys.context(block.name), kind: 'context', zone: 'context', label }, block.text, 1), text: block.text })
    }
    for (const [j, file] of files.entries()) {
      const span = spans[j] ?? null
      if (memory === undefined) continue
      // Not found in the block (a hook beneath rewrote it): still listed by its own text, so it reads "not measured".
      const text = span === null ? file.content.trim() || file.path : memory.text.slice(span.offset, span.offset + span.chars)
      const fields: Fields = {
        key: keys.rule(file.path),
        kind: 'rule',
        zone: 'context',
        label: await shortPath($, file.path),
        isYours: YOUR_FILES.has(file.kind),
        parent: keys.context('claudeMd'),
      }
      seen.push({ piece: piece(fields, text, 1), text })
    }
    await record($, seen)

    const out = await gone($)
    const blocks = result.blocks.filter(b => !out.has(keys.context(b.name)))
    if (result.instructionFiles !== undefined) {
      const kept = files.filter(f => !out.has(keys.rule(f.path)))
      if (blocks.length === result.blocks.length && kept.length === files.length) return result

      // The engine renders `claudeMd` again from the changed list.
      return { blocks, instructionFiles: kept }
    }
    // The list is unknown (a hook beneath rewrote the text): cut each deleted file's text where it is found.
    const texts = await read($, textsAtom)
    const pieces = await read($, injectionsAtom)
    const spanOf = (key: string): Span | null => {
      const j = files.findIndex(f => keys.rule(f.path) === key)
      if (j >= 0) return spans[j] ?? null
      const p = pieces.find(x => x.key === key)
      const text = p === undefined ? undefined : texts[p.hash]
      const found = text === undefined || memory === undefined ? -1 : memory.text.indexOf(text)

      return text === undefined || found < 0 ? null : { name: key, offset: found, chars: text.length }
    }
    const drop = [...out].filter(k => k.startsWith('rule:')).map(spanOf)
    if (blocks.length === result.blocks.length && drop.every(span => span === null)) return result

    return { blocks: blocks.map(b => (b === memory ? { ...b, text: cutSpans(b.text, drop) } : b)) }
  })

  // Everything injected later: CLAUDE.md files from subfolders, path rules, the skill list, reminders,
  // and pieces re-injected by 🔄 (they ride as the next message's context).
  on('prompt.attachment', async ($, e, next) => {
    const result = await next(e)
    // A message the person typed while Claude worked rides as an attachment: their own words, never a piece.
    if (result.text === null || PERSON_WORDS.has(e.type)) return result
    const isMain = e.agentId === undefined
    const message = await read($, messageAtom)

    // 🔄: each copy inside the riding text is its own piece; a copy whose piece was deleted is cut out.
    if (e.origin.kind === 'plugin' && e.origin.event === 'prompt.submit') {
      const saved = await read($, savedAtom)
      const removed = new Set(await read($, removedAtom))
      const pieces = await read($, injectionsAtom)
      let text = result.text
      const seen: { piece: Piece; text: string }[] = []
      for (const [group, copy] of Object.entries(saved)) {
        if (copy === '' || !text.includes(copy)) continue
        if (removed.has(group)) {
          text = text.replace(`${copy}\n`, '').replace(copy, '')
          continue
        }
        const original = pieces.find(p => p.group === group && p.copyOf === null)
        const fields: Fields = {
          key: keys.copy(group),
          group,
          kind: original?.kind ?? 'reminder',
          zone: 'conversation',
          label: `🔄 ${original?.label ?? group}`,
          isYours: original?.isYours ?? false,
          copyOf: group,
        }
        seen.push({ piece: piece(fields, copy, message), text: copy })
      }
      if (isMain) await record($, seen)
      if (text === result.text) return result

      return text.replace(/^[^\n:]*context:\s*/, '').trim() === '' ? { text: null } : { text }
    }

    const out = await gone($)
    const key = keys.attachment(e.type, e.text)
    if (!knownTypes.has(e.type)) {
      knownTypes.add(e.type)
      await learnRoles($)
    }
    const entries = e.type === 'skill_listing' ? parseListing(result.text) : []
    if (isMain) {
      const userSkills = new Set(await read($, userSkillsAtom))
      const path = pathOfAttachment(result.text)
      const isRule = e.type === 'nested_memory' || e.type === 'instructions'
      // A file you sent with your message (or one Claude Code brings back after a compaction): yours, by its path.
      const isFile = e.type === 'file' && path !== null && (await isYourFile($, path))
      const kind: PieceKind = isRule ? 'rule' : 'reminder'
      const label =
        e.type === 'skill_listing'
          ? `skill list (${entries.length} skills)`
          : path !== null
            ? `${await shortPath($, path)}${isRule || isFile ? '' : ` (${e.type.replace(/_/g, ' ')})`}`
            : attachmentLabel(originOf(e.origin, e.type), result.text)
      const seen = [{ piece: piece({ key, kind, zone: 'conversation', label, attachment: e.type, isYours: isRule || isFile }, result.text, message), text: result.text }]
      for (const span of entries) {
        const text = result.text.slice(span.offset, span.offset + span.chars)
        const fields: Fields = {
          key: keys.skillLine(span.name),
          kind: 'skill-line',
          zone: 'conversation',
          label: `skill list: ${span.name}`,
          isYours: userSkills.has(span.name),
          parent: key,
        }
        seen.push({ piece: piece(fields, text, message), text })
      }
      await record($, seen)
    }
    if (out.has(key) || out.has(keys.attachmentType(e.type))) return { text: null }
    // A CLAUDE.md whose later reads were stopped (🗑 on the file): not injected either.
    const injectedPath = e.type === 'nested_memory' ? pathOfAttachment(result.text) : null
    if (injectedPath !== null && (await read($, removedAtom)).includes(`file:${await shortPath($, injectedPath)}`)) return { text: null }
    const drop = new Set(entries.filter(span => out.has(keys.skillLine(span.name))).map(span => span.name))

    return drop.size === 0 ? result : { text: filterListing(result.text, drop) }
  })

  // 🔄: what was moved rides with this message, at the end of the context.
  on('prompt.submit', async ($, e, next) => {
    const moved = await read($, movedAtom)
    const queued = Object.keys(moved).filter(k => moved[k] === 'queued')
    if (queued.length === 0) return next(e)
    const saved = await read($, savedAtom)
    // Each copy on a line of its own: the words Claude Code puts before it can't share a token with its first characters.
    const riding = queued.map(k => saved[k] ?? '').filter(text => text !== '').map(text => `\n${text}`)
    const result = await next({ ...e, context: [...(e.context ?? []), ...riding] })
    if (result.drop !== undefined) return result
    await update($, movedAtom, current => {
      const sent: Record<string, Move> = { ...current }
      for (const k of queued) sent[k] = 'sent'

      return sent
    })
    await persist($)

    return result
  })

  // A skill's text, each time it is used: a new injection, placed from the request that carries it.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    const userSkills = new Set(await read($, userSkillsAtom))
    const message = await read($, messageAtom)
    const group = keys.skill(e.skill)
    const fields: Fields = { key: keys.instance(group, message), group, kind: 'skill', zone: 'conversation', label: `skill: ${e.skill}`, isYours: userSkills.has(e.skill) }
    await record($, [{ piece: piece(fields, result.text, message), text: result.text }])

    // Only 🗑 stops later uses; a skill moved by 🔄 keeps its text (its copy rides once).
    return (await read($, removedAtom)).includes(group) ? { text: `(prompt-inspector deleted the ${e.skill} skill's instructions.)` } : result
  })

  on('command.run', { command: 'inspect' }, async ($, e) => {
    const scope = e.args.trim() === 'all' ? 'all' : 'yours'

    // The cards show the list; Claude reads only this line.
    return { text: await inspect($, scope) }
  })
}
