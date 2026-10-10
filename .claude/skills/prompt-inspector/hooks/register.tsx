import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelTextBlock, ModelUsage, PromptAttachmentOrigin, Register } from 'claude-code'

import type { Move, Piece, PieceKind, Position, Step, SystemSnapshot } from '../types'
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
  blockOf,
  flatKeys,
  int,
  keys,
  layout,
  locate,
  parseListing,
  pathOfAttachment,
  rowAt,
  spansOfFiles,
  systemChange,
  textKey,
  textsToCount,
  typedPosition,
  withFillers,
} from './model'
import type { Row, Span } from './model'

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

const sumOf = (count: (t: string) => number | null, list: readonly string[]) =>
  list.reduce<number | null>((n, t) => {
    const c = count(t)

    return n === null || c === null ? null : n + c
  }, 0)

/**
 * Measures the pieces a view shows (`yours`: your pieces; `all`: every piece,
 * and where the first message begins). First each piece waiting is placed in
 * the request that first carried it: that request ended at an exact token
 * (cache read + cache write), and the piece ends where what follows it in the
 * last message begins. Then each placed piece is carried to the last request
 * by proof (see `carry`). Every text this takes is counted several at once.
 */
async function measure($: Engine, scope: 'yours' | 'all'): Promise<void> {
  const steps = await read($, requestsAtom)
  const texts = await read($, textsAtom)
  const last = steps[steps.length - 1]
  const model = last?.model ?? (await $.session.model())
  const stepById = new Map(steps.map(s => [s.id, s]))
  const exact = exactSteps(steps)
  const wanted = (await read($, injectionsAtom)).filter(p => scope === 'all' || p.isYours)
  const patches = new Map<string, Partial<Piece>>()
  const patch = (p: Piece, more: Partial<Piece>) => patches.set(p.key, { ...(patches.get(p.key) ?? {}), ...more })

  // 1. Sizes, and a place for each piece waiting in the request that first carried it.
  const toPlace: { p: Piece; text: string; s: Step; block: number; offset: number; after: string[]; suffix: string; own: string; isWholeBlock: boolean }[] = []
  const need: string[] = []
  for (const p of wanted) {
    const text = texts[p.hash]
    if (text === undefined) continue
    if (p.tokens === null) need.push(text)
    const isRetry = ['counting failed', 'sent outside', 'not found'].some(why => p.lost?.startsWith(why) ?? false)
    if (p.zone === 'system' || p.step === null || p.at !== null || p.was !== null || (p.lost !== null && !isRetry)) continue
    if (isRetry) patch(p, { lost: null })
    const s = stepById.get(p.step)
    if (s === undefined) {
      patch(p, { lost: 'its request was not kept' })
      continue
    }
    if (!exact.has(s.id)) {
      patch(p, { lost: 'text followed the cache mark in its request' })
      continue
    }
    const blocks = s.tail.map(k => (k === '-' ? null : (texts[k] ?? null)))
    const plain = blocks.map(b => b ?? '')
    const found = locate(plain, text)
    // Sent reworded (Claude Code rewrites some reminders): the block that holds its lines, whole.
    const wholeAt = found === null && p.parent === null ? blockOf(plain, text) : -1
    const at = found ?? (wholeAt >= 0 ? { block: wholeAt, offset: 0 } : null)
    if (at === null || blocks.slice(at.block + 1).some(b => b === null)) {
      patch(p, { lost: at === null ? 'not found in its request as sent' : 'a block after it is not text' })
      continue
    }
    const own = blocks[at.block] ?? ''
    const placed = found === null ? own : text
    const { after, suffix } = textsToCount(plain, at, placed)
    // Only texts that run to the block's end are counted: a text's trailing whitespace is dropped when it is counted alone.
    need.push(...after, suffix, placed + suffix)
    toPlace.push({ p, text: placed, s, block: s.blocks - s.tail.length + at.block, offset: at.offset, after, suffix, own, isWholeBlock: found === null })
  }
  let count = await countAll($, model, need)
  for (const p of wanted) {
    const n = p.tokens === null ? count(texts[p.hash] ?? '') : null
    if (n !== null && p.tokens === null) patch(p, { tokens: n })
  }
  for (const x of toPlace) {
    const afterTokens = sumOf(count, x.after)
    const suffixTokens = count(x.suffix)
    const toEnd = count(x.text + x.suffix)
    if (afterTokens === null || suffixTokens === null || toEnd === null) {
      patch(x.p, { lost: `counting failed${countErrors.length > 0 ? ` (${countErrors[countErrors.length - 1]})` : ''}; Refresh tries again` })
      continue
    }
    // Its block ends where the blocks after it begin; it starts where the text from it to its block's end begins.
    const blockEnd = x.s.end - afterTokens
    const range = { start: blockEnd - toEnd, end: blockEnd - suffixTokens }
    const key = x.s.tail[x.block - (x.s.blocks - x.s.tail.length)] ?? ''
    patch(x.p, { tokens: range.end - range.start, at: { ...range, block: x.block, offset: x.offset, key, ...(x.isWholeBlock ? { isWholeBlock: true } : {}) } })
  }

  // 2. Carry each placed piece to the last request, and where the first message begins.
  const current = wanted.map(p => ({ ...p, ...(patches.get(p.key) ?? {}) }))
  const toCarry = current.filter((p): p is Piece & { at: Position; step: number; tokens: number } => p.at !== null && p.step !== null && p.tokens !== null && last !== undefined && p.step < last.id)
  let start = await read($, promptStartAtom)
  const first = steps.find(s => s.messageCount === 1 && exact.has(s.id))
  const firstBlocks = first === undefined ? null : first.tail.map(k => (k === '-' ? null : (texts[k] ?? null)))
  const isStartWanted = scope === 'all' && start === null && first !== undefined && firstBlocks !== null && !firstBlocks.some(b => b === null)
  const asked: string[] = []
  const collect = (t: string) => {
    asked.push(t)

    return 0
  }
  for (const p of toCarry) carry(p.at, p.step, texts[p.hash] ?? '', p.tokens, steps, texts, collect)
  if (start !== null) carryStart(start.at, start.step, steps, texts, collect)
  if (isStartWanted && firstBlocks !== null) asked.push(...firstBlocks.map(b => b ?? ''))
  count = await countAll($, model, asked)
  for (const p of toCarry) {
    const r = carry(p.at, p.step, texts[p.hash] ?? '', p.tokens, steps, texts, count)
    if (r.kind === 'at') patch(p, { at: r.at, step: r.step })
    else if (r.kind === 'gone') patch(p, { at: null, was: r.was, step: r.step })
    else patch(p, { at: null, lost: r.reason, step: r.step })
  }
  if (isStartWanted && first !== undefined && firstBlocks !== null) {
    const all = sumOf(
      count,
      firstBlocks.map(b => b ?? ''),
    )
    if (all !== null) start = { at: first.end - all, step: first.id }
  }
  if (start !== null && last !== undefined && start.step < last.id) {
    const moved = carryStart(start.at, start.step, steps, texts, count)
    start = moved === null ? null : { at: moved, step: last.id }
  }
  await update($, promptStartAtom, () => start)
  if (patches.size > 0) await update($, injectionsAtom, list => list.map(p => (patches.has(p.key) ? { ...p, ...patches.get(p.key) } : p)))
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
  const text = p === undefined ? undefined : texts[p.hash]
  if (p === undefined || text === undefined) return false
  await update($, savedAtom, saved => ({ ...saved, [row.group]: text }))
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

<<<<<<< HEAD
async function rowsFor($: Engine, scope: 'yours' | 'all'): Promise<{ rows: Row[]; total: number | null }> {
  const steps = await read($, requestsAtom)
  const { rows, total } = layout(await read($, injectionsAtom), steps, new Set(await read($, removedAtom)), new Set(Object.keys(await read($, movedAtom))))
  if (scope === 'yours') return { rows: rows.filter(r => r.isYours), total }
=======
async function rowsFor($: Engine, scope: 'yours' | 'all'): Promise<{ rows: Row[]; total: number | null; unplaced?: number }> {
  const steps = await read($, requestsAtom)
  const { rows, total } = layout(await read($, injectionsAtom), steps, new Set(await read($, removedAtom)), new Set(Object.keys(await read($, movedAtom))))
  // Yours: only what is in the context now, at its exact place; what is not placed yet is not listed.
  if (scope === 'yours') return { rows: rows.filter(r => r.isYours && r.start !== null && r.end !== null), total, unplaced: rows.filter(r => r.isYours && !r.isDeleted && r.start === null && r.was === null && r.note !== null && !r.note.startsWith('arrives')).length }
>>>>>>> origin/claude/prompt-inspector
  const start = await read($, promptStartAtom)
  const isProven = start !== null && steps.every(s => s.id <= start.step || s.cacheRead >= start.at)

  return { rows: withFillers(rows, total, isProven && start !== null ? start.at : null), total }
}

/** The card for one piece: 🗑 (with a confirmation) or 🔄; answers what to say on the list card. */
async function act($: Engine, row: Row): Promise<string> {
  const isSkill = row.kind === 'skill'
  const remove1 = isSkill ? '🗑 Stop later uses' : '🗑 Delete'
  const move1 = isSkill ? '🔄 Send a copy at end' : '🔄 Re-inject at end'
  const choices =
    row.isCopy || row.isMoved
      ? row.isDeleted
        ? ['Back']
        : ['🗑 Delete', 'Back']
      : row.isDeleted
        ? [move1, 'Back']
        : [remove1, move1, 'Back']
  const help = isSkill
    ? '🗑 stops its later uses (the text already sent stays); 🔄 sends a copy with your next message.'
    : row.isCopy || row.isMoved
      ? '🗑 takes it out of the prompt altogether.'
<<<<<<< HEAD
      : '🗑 takes it out from your next message on; 🔄 moves it to ride with your next message, at the end.'
=======
      : '🗑 takes it out from your next message on; 🔄 moves it to ride at the end.'
>>>>>>> origin/claude/prompt-inspector
  const choice = await ask($, `${row.label}: ${describe(row)}. ${help}`, 'Piece', choices)
  if (choice === remove1 || choice === '🗑 Delete') {
    const confirm = await ask($, `${isSkill ? 'Stop later uses of' : 'Delete'} ${row.label} (${describe(row)})?`, 'Confirm', [isSkill ? 'Yes, stop them' : 'Yes, delete', 'No'])
    if (confirm === null || confirm === 'No') return ''
    await remove($, row.group)

<<<<<<< HEAD
    return isSkill ? `Later uses of ${row.label} stopped; its text already sent stays. ` : `Deleted ${row.label}: it leaves the prompt from your next message. `
=======
    return isSkill ? `Later uses of ${row.label} stopped; its text already sent stays. ` : `Deleted ${row.label}: it is taken out of the prompt. `
>>>>>>> origin/claude/prompt-inspector
  }
  if (choice === move1) {
    const isMoved = await moveToEnd($, row)

<<<<<<< HEAD
    return isMoved ? `${row.label} will ride with your next message, at the end. ` : `${row.label}: its text is not kept, so it can't be re-injected. `
=======
    return isMoved ? `${row.label} will ride at the end. ` : `${row.label}: its text is not kept, so it can't be re-injected. `
>>>>>>> origin/claude/prompt-inspector
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
<<<<<<< HEAD
    const { rows, total } = await rowsFor($, scope)
=======
    const { rows, total, unplaced = 0 } = await rowsFor($, scope)
>>>>>>> origin/claude/prompt-inspector
    const pages = Math.max(1, Math.ceil(rows.length / PAGE))
    page = page % pages
    const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
    const labels = uniqueLabels(shown)
    const title = scope === 'all' ? 'Everything injected' : 'Your rules & skills'
    const size = total === null ? 'no request measured yet' : `last request ${int(total)} tokens`
<<<<<<< HEAD
    const empty = rows.length === 0 ? (scope === 'all' ? ' Nothing recorded yet.' : ' None of yours is in the prompt yet.') : ''
    const question = `${said}${title} · ${size} · ${rows.length} pieces, page ${page + 1}/${pages}.${empty} Tap one, or type a token position.`
=======
    const empty = rows.length === 0 ? (scope === 'all' ? ' Nothing recorded yet.' : ' None of yours is in the context.') : ''
    const extra = unplaced > 0 ? ` ${unplaced} more in context, position not measured.` : ''
    const question = `${said}${title} · ${size} · ${rows.length} pieces, page ${page + 1}/${pages}.${empty}${extra} Tap one, or type a token position.`
>>>>>>> origin/claude/prompt-inspector
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
async function report($: Engine): Promise<Record<string, unknown>> {
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
    countErrors,
    yours: yours.rows.map(r => `${cardLabel(r)}  [${describe(r)}]`),
    all: all.rows.map(r => `${cardLabel(r)}  [${describe(r)}]`),
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
  const waiting = new Set(pieces.filter(p => p.at === null && p.lost === null && p.was === null && p.step !== null).map(p => p.step))
  const kept = steps.filter(s => s.id >= oldest).map(s => (waiting.has(s.id) || s.id >= last.id - 1 ? s : { ...s, tail: [] }))
  const refs = new Set<string>()
  for (const p of pieces) {
    refs.add(p.hash)
    if (p.at !== null) refs.add(p.at.key)
  }
  for (const s of kept) {
    for (const k of s.tail) refs.add(k)
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
    const diff = previous === null ? null : diffBlocks(previous.keys, flat.keys)
    const change =
      previous === null || diff === null ? ({ kind: 'unknown' } as const) : { kind: 'known' as const, blocks: diff.blocks, brokenAt: diff.brokenAt, system: systemChange(previous.system, system) }
    // Kept: the last message's texts, and the new texts of blocks that changed.
    const keep = new Set([...tail, ...(change.kind === 'known' ? change.blocks.map(c => c.after).filter((k): k is string => k !== null) : [])])
    await remember($, Object.fromEntries(Object.entries(flat.texts).filter(([k]) => keep.has(k))))
    // A piece already listed whose text arrives again with this message: another injection of it.
    const message = await read($, messageAtom)
    const texts = await read($, textsAtom)
    const tailTexts = tail.map(k => texts[k] ?? '')
    const again: Piece[] = []
    for (const p of await read($, injectionsAtom)) {
      const text = texts[p.hash]
      if (p.zone !== 'conversation' || p.attachment === null || p.copyOf !== null || p.step === null || text === undefined) continue
      if (!tailTexts.some(t => t.includes(text))) continue
      const key = keys.instance(p.key, message * 1000 + e.index)
      again.push({ ...p, key, group: p.group, message, step: null, at: null, was: null, lost: null })
    }
    if (again.length > 0) {
      const known = new Set((await read($, injectionsAtom)).map(p => p.key))
      const fresh = again.filter(p => !known.has(p.key))
      if (fresh.length > 0) await update($, injectionsAtom, list => [...list, ...fresh])
    }

    // Only what waited before this request was sent: a skill used while the answer streams belongs to the next one.
    const waiting = new Set((await read($, injectionsAtom)).filter(p => p.step === null && p.zone !== 'system').map(p => p.key))
    const result = yield* next(e)
    const usage = result.usage
    previous = { keys: flat.keys, system }
    if (usage === null) return result
    const end = usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    let id = 0
    let before: Step | undefined
    await update($, requestsAtom, steps => {
      before = steps[steps.length - 1]
      id = (before?.id ?? -1) + 1
      const step: Step = {
        id,
        message,
        index: e.index,
        // The API messages it carried (the engine's own count includes rows the API never sees).
        messageCount: api.length,
        total: usageTotal(usage),
        end,
        cacheRead: usage.cache_read_input_tokens,
        uncached: usage.input_tokens,
        // Few tokens uncached: the cache mark may sit at the last block's end (exactSteps decides).
        isAnchor: usage.input_tokens <= 8 && (result.serverToolUses?.length ?? 0) === 0,
        blocks: flat.keys.length,
        tail,
        change,
        model: usage.model,
      }

      return [...steps, step]
    })
    // Waiting pieces this request carries in its last message are placed in it; the others were sent before (or elsewhere).
    const tailNow = tail.map(k => texts[k] ?? '')
    const prior = before?.id
    await update($, injectionsAtom, list =>
      list.map(p => {
        if (p.step === null && waiting.has(p.key)) {
          const text = texts[p.hash] ?? ''
          if (text !== '' && (tailNow.some(t => t.includes(text)) || (p.parent === null && blockOf(tailNow, text) >= 0))) return { ...p, step: id, isEarlier: false }
          // Not in this request's last message: sent before the inspector started, or not found as sent.
          return isJoinedLate && before === undefined ? { ...p, isEarlier: true } : { ...p, step: id, lost: 'not found in its request as sent' }
        }
        // The cache proves everything up to its end unchanged: the same place in this request.
        if (p.at !== null && p.step === prior && usage.cache_read_input_tokens >= p.at.end) return { ...p, step: id }

        return p
      }),
    )
    const start = await read($, promptStartAtom)
    if (start !== null && start.step === prior && usage.cache_read_input_tokens >= start.at) await update($, promptStartAtom, () => ({ at: start.at, step: id }))
    await prune($)

    return result
  })

  on('tool.call', { tool: /^mcp__prompt-inspector__debug$/ }, async ($, e, next) => {
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
    const entries = e.type === 'skill_listing' ? parseListing(result.text) : []
    if (isMain) {
      const userSkills = new Set(await read($, userSkillsAtom))
      const path = pathOfAttachment(result.text)
      const isRule = e.type === 'nested_memory' || e.type === 'instructions'
      const kind: PieceKind = isRule ? 'rule' : 'reminder'
      const label =
        e.type === 'skill_listing'
          ? `skill list (${entries.length} skills)`
          : path !== null
            ? `${await shortPath($, path)}${isRule ? '' : ` (${e.type.replace(/_/g, ' ')})`}`
            : attachmentLabel(originOf(e.origin, e.type), result.text)
      const seen = [{ piece: piece({ key, kind, zone: 'conversation', label, attachment: e.type, isYours: isRule }, result.text, message), text: result.text }]
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
    const drop = new Set(entries.filter(span => out.has(keys.skillLine(span.name))).map(span => span.name))

    return drop.size === 0 ? result : { text: filterListing(result.text, drop) }
  })

  // 🔄: what was moved rides with this message, at the end of the context.
  on('prompt.submit', async ($, e, next) => {
    const moved = await read($, movedAtom)
    const queued = Object.keys(moved).filter(k => moved[k] === 'queued')
    if (queued.length === 0) return next(e)
    const saved = await read($, savedAtom)
    const riding = queued.map(k => saved[k] ?? '').filter(text => text !== '')
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
