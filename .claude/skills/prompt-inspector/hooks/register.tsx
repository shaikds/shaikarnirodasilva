import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, PromptAttachmentOrigin, Register } from 'claude-code'

import type { Move, Piece, PieceKind, PieceZone } from '../types'
import {
  cardLabel,
  cutSpans,
  describe,
  filterListing,
  firstLine,
  goneKeys,
  hash,
  int,
  keys,
  layout,
  locate,
  parseListing,
  pathOfAttachment,
  rangeFromEnd,
  rowAt,
  spansOfFiles,
  textsToCount,
  withFillers,
} from './model'
import type { Row, Span } from './model'

const piecesAtom = atom({ plugin: 'prompt-inspector', key: 'pieces' } as const, [])
const stepsAtom = atom({ plugin: 'prompt-inspector', key: 'steps' } as const, [])
const textsAtom = atom({ plugin: 'prompt-inspector', key: 'texts' } as const, {})
const removedAtom = atom({ plugin: 'prompt-inspector', key: 'removed' } as const, [])
const movedAtom = atom({ plugin: 'prompt-inspector', key: 'moved' } as const, {})
const savedAtom = atom({ plugin: 'prompt-inspector', key: 'saved' } as const, {})
const messageAtom = atom({ plugin: 'prompt-inspector', key: 'message' } as const, 0)
const systemEndAtom = atom({ plugin: 'prompt-inspector', key: 'systemEnd' } as const, null)
const catchingUpAtom = atom({ plugin: 'prompt-inspector', key: 'isCatchingUp' } as const, false)
const userSkillsAtom = atom({ plugin: 'prompt-inspector', key: 'userSkills' } as const, [])

type Engine = EngineInterface

/** Where a text is kept, and what its exact count is cached by. */
const textKey = (text: string) => `${hash(text)}:${text.length}`

/** Kinds of instruction file that are yours (not your organization's policy, not auto-memory). */
const YOUR_FILES = new Set(['user', 'project', 'local'])

type Fields = Pick<Piece, 'key' | 'kind' | 'zone' | 'label'> & Partial<Piece>

function piece(fields: Fields, text: string, message: number, isEarlier: boolean): Piece {
  return {
    isYours: false,
    attachment: null,
    parent: null,
    step: null,
    tokens: null,
    removalTokens: null,
    start: null,
    end: null,
    copyOf: null,
    ...fields,
    hash: textKey(text),
    message,
    isEarlier,
  }
}

/** Keeps texts by key: each piece's, and each block of a request's last message. */
async function remember($: Engine, entries: Record<string, string>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  await update($, textsAtom, texts => ({ ...texts, ...entries }))
}

/**
 * Records what a render injected. A piece seen before keeps where it was
 * measured, unless its text changed: then it is a new injection, measured
 * from the next request that carries it.
 */
async function record($: Engine, seen: { piece: Piece; text: string }[]): Promise<void> {
  if (seen.length === 0) return
  await remember($, Object.fromEntries(seen.map(s => [s.piece.hash, s.text])))
  await update($, piecesAtom, list => {
    const byKey = new Map(list.map(p => [p.key, p]))
    for (const { piece: p } of seen) {
      const old = byKey.get(p.key)
      if (old === undefined || old.hash !== p.hash) byKey.set(p.key, p)
      else byKey.set(p.key, { ...old, label: p.label, isYours: p.isYours, parent: p.parent, copyOf: p.copyOf })
    }

    return [...byKey.values()]
  })
}

async function gone($: Engine): Promise<Set<string>> {
  return goneKeys(await read($, removedAtom), Object.keys(await read($, movedAtom)))
}

/** Where this message stands, and whether recording is catching up on a conversation it joined late. */
async function now($: Engine): Promise<{ message: number; isEarlier: boolean }> {
  return { message: await read($, messageAtom), isEarlier: await read($, catchingUpAtom) }
}

/** A file path as the person knows it: relative to the project, or under `~`. */
async function shortPath($: Engine, path: string): Promise<string> {
  const root = await $.session.root()
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1)
  const home = /^\/(?:root|home\/[^/]+)\//.exec(path)?.[0]

  return home === undefined ? path : `~/${path.slice(home.length)}`
}

/** The last message of the request about to be sent, block by block; texts are kept. */
async function captureTail($: Engine): Promise<string[]> {
  const api = await $.session.messages({ as: 'api' })
  const last = api[api.length - 1]
  if (last === undefined || last.role !== 'user') return []
  const entries: Record<string, string> = {}
  const tail = last.content.map(block => {
    if (block.type !== 'text' || typeof block.text !== 'string') return '-'
    const key = textKey(block.text)
    entries[key] = block.text

    return key
  })
  await remember($, entries)

  return tail
}

const usageTotal = (u: ModelUsage) => u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

/**
 * A text's exact token count with the model's own tokenizer: sent as its own
 * block after a one-character block, less that one-character request. Blocks
 * add no tokens between them, so the difference is the text alone. Each text
 * is counted once and kept (it costs about its own size in input tokens).
 */
async function tokensOf($: Engine, model: string, text: string): Promise<number | null> {
  if (text.length === 0) return 0
  const cacheKey = `n:${model}:${textKey(text)}`
  const cached = await $.store.get(cacheKey)
  if (typeof cached === 'number') return cached
  const baseKey = `base:${model}`
  const stored = await $.store.get(baseKey)
  try {
    let base = typeof stored === 'number' ? stored : 0
    if (base <= 0) {
      base = usageTotal((await $.model.complete({ model, prompt: '.', maxTokens: 1 })).usage)
      if (base <= 0) return null
      await $.store.set(baseKey, base)
    }
    const total = usageTotal((await $.model.complete({ model, prompt: [{ text: '.' }, { text }], maxTokens: 1 })).usage)
    if (total <= 0) return null
    const tokens = total - base
    await $.store.set(cacheKey, tokens)

    return tokens
  } catch {
    return null
  }
}

/**
 * Measures every piece not measured yet. A piece's request ended at an exact
 * token (cache read + cache write); the piece ends where the blocks after it
 * begin, and starts its own exact size before that.
 */
async function measure($: Engine): Promise<void> {
  const pieces = await read($, piecesAtom)
  const steps = await read($, stepsAtom)
  const texts = await read($, textsAtom)
  const stepById = new Map(steps.map(s => [s.id, s]))
  const fallbackModel = steps[steps.length - 1]?.model ?? (await $.session.model())
  const done = new Map<string, Partial<Piece>>()
  let systemEnd: number | null = await read($, systemEndAtom)

  for (const p of pieces) {
    const text = texts[p.hash]
    if (text === undefined) continue
    const step = p.step === null ? undefined : stepById.get(p.step)
    const model = step?.model ?? fallbackModel
    const tokens = p.tokens ?? (await tokensOf($, model, text))
    if (tokens === null) continue
    const result: Partial<Piece> = { tokens }
    done.set(p.key, result)
    if (p.zone === 'system') {
      if (p.removalTokens === null) result.removalTokens = await tokensOf($, model, `${text}\n\n`)
      continue
    }
    if (step === undefined || !step.isAnchor || p.start !== null) continue
    const blocks = step.tail.map(key => (key === '-' ? null : (texts[key] ?? null)))
    const at = locate(
      blocks.map(b => b ?? ''),
      text,
    )
    if (at === null || blocks.slice(at.block + 1).some(b => b === null)) continue
    const { after, suffix } = textsToCount(blocks.map(b => b ?? ''), at, text)
    let afterTokens = 0
    for (const block of after) {
      const n = await tokensOf($, model, block)
      if (n === null) {
        afterTokens = Number.NaN
        break
      }
      afterTokens += n
    }
    const suffixTokens = await tokensOf($, model, suffix)
    if (Number.isNaN(afterTokens) || suffixTokens === null) continue
    const range = rangeFromEnd(step.end, afterTokens, suffixTokens, tokens)
    result.start = range.start
    result.end = range.end
    // Deleting an attachment takes its whole block out, its framing included.
    const own = blocks[at.block] ?? ''
    result.removalTokens = p.attachment !== null && p.parent === null ? await tokensOf($, model, own) : tokens

    // The first request's last message is the first message: what precedes it is tools + system prompt.
    if (systemEnd === null && step.messageCount === 1) {
      let all = 0
      for (const block of blocks) {
        const n = block === null ? null : await tokensOf($, model, block)
        if (n === null) {
          all = Number.NaN
          break
        }
        all += n
      }
      if (!Number.isNaN(all)) systemEnd = step.end - all
    }
  }
  if (done.size > 0) {
    await update($, piecesAtom, list => list.map(p => ({ ...p, ...(done.get(p.key) ?? {}) })))
  }
  if (systemEnd !== null) await update($, systemEndAtom, () => systemEnd)
}

/** Context blocks and attachments are cached answers: ask for them again with the next request. */
function invalidate($: Engine): void {
  $.ui.invalidate('prompt.context')
  $.ui.invalidate('prompt.attachment')
}

/** Deletes a piece from the next request on (or puts it back). */
async function setRemoved($: Engine, key: string, isRemoving: boolean): Promise<void> {
  await update($, removedAtom, list => (isRemoving ? [...new Set([...list, key])] : list.filter(k => k !== key)))
  invalidate($)
}

/** 🔄: the piece leaves its place and rides with the next message, at the end of the context. */
async function moveToEnd($: Engine, key: string): Promise<boolean> {
  const pieces = await read($, piecesAtom)
  const texts = await read($, textsAtom)
  const p = pieces.find(x => x.key === key)
  const text = p === undefined ? undefined : texts[p.hash]
  if (p === undefined || text === undefined) return false
  // Moving a copy moves the piece it copies; the old copy leaves with it.
  const target = p.copyOf ?? p.key
  await update($, savedAtom, saved => ({ ...saved, [target]: text }))
  await update($, movedAtom, moved => ({ ...moved, [target]: 'queued' as const }))
  await update($, removedAtom, list => list.filter(k => k !== target))
  if (p.copyOf !== null) await update($, removedAtom, list => [...new Set([...list, p.key])])
  invalidate($)

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

const PAGE = 3
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

async function rowsFor($: Engine, scope: 'yours' | 'all'): Promise<{ rows: Row[]; total: number | null }> {
  const { rows, total } = layout(await read($, piecesAtom), await read($, stepsAtom), await gone($))
  if (scope === 'yours') return { rows: rows.filter(r => r.isYours), total }

  return { rows: withFillers(rows, total, await read($, systemEndAtom)), total }
}

/** The card for one piece: 🗑 (with a confirmation) or 🔄; answers what to say on the list card. */
async function act($: Engine, row: Row): Promise<string> {
  const choices = [...(row.isDeleted ? [] : ['🗑 Delete']), '🔄 Re-inject at end', 'Back']
  const choice = await ask($, `${row.label}: ${describe(row)}. 🗑 takes it out from your next message on; 🔄 moves it to ride with your next message.`, 'Piece', choices)
  if (choice === '🗑 Delete') {
    const confirm = await ask($, `Delete ${row.label} (${describe(row)})?`, 'Confirm', ['Yes, delete', 'No'])
    if (confirm !== 'Yes, delete') return ''
    await setRemoved($, row.key, true)
    const skillNote = row.kind === 'skill' ? ' Its text already sent stays; later uses are stopped.' : ''

    return `Deleted ${row.label}.${skillNote} `
  }
  if (choice === '🔄 Re-inject at end') {
    const isMoved = await moveToEnd($, row.key)

    return isMoved ? `${row.label} will ride with your next message. ` : `${row.label}: its text is not kept, so it can't be re-injected. `
  }

  return ''
}

/** The inspector: a paged list card, then a card for the piece tapped. */
async function inspect($: Engine, scope: 'yours' | 'all'): Promise<string> {
  await measure($)
  let page = 0
  let said = ''
  for (let round = 0; round < 100; round++) {
    const { rows, total } = await rowsFor($, scope)
    const pages = Math.max(1, Math.ceil(rows.length / PAGE))
    page = Math.min(page, pages - 1)
    const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
    const labels = uniqueLabels(shown)
    const title = scope === 'all' ? 'Everything injected' : 'Your rules & skills'
    const size = total === null ? 'no request measured yet' : `last request ${int(total)} tokens`
    const question = `${said}${title} · ${size} · page ${page + 1}/${pages}. Tap one, or type a token position.`
    const choices = [...labels, page < pages - 1 ? MORE : DONE]
    if (choices.length < 2) choices.unshift('Refresh')
    const answer = await ask($, question, scope === 'all' ? 'Inspect all' : 'Inspect', choices)
    said = ''
    if (answer === null || answer === DONE) break
    if (answer === MORE) {
      page += 1
      continue
    }
    if (answer === 'Refresh') {
      await measure($)
      continue
    }
    const index = labels.indexOf(answer)
    const typed = Number(answer.replace(/[,\s]/g, ''))
    const row = index >= 0 ? shown[index] : Number.isFinite(typed) ? rowAt(rows, typed) : undefined
    if (row === undefined) {
      said = `Nothing is at ${answer}. `
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

/**
 * Proves the two facts exact ranges rest on, with the model itself: a request
 * whose cache mark sits on a long first block reports that block's end as
 * cache read + cache write, and the text after it costs exactly what counting
 * it alone gives, plus the same few closing tokens real requests leave uncached.
 */
async function selfTest($: Engine, model: string): Promise<Record<string, number | string>> {
  const long = 'The inspector measures every injected piece exactly. '.repeat(400)
  const after = 'Use the todo list.'
  const marked = (await $.model.complete({ model, prompt: [{ text: long, cache: true }], maxTokens: 1 })).usage
  const both = (await $.model.complete({ model, prompt: [{ text: long, cache: true }, { text: after }], maxTokens: 1 })).usage
  const afterTokens = await tokensOf($, model, after)
  const markEnd = both.cache_read_input_tokens + both.cache_creation_input_tokens
  if (markEnd === 0 || afterTokens === null) return { result: 'caching or counting unavailable', markEnd, afterTokens: afterTokens ?? -1 }

  return {
    result: 'measured',
    markAloneEnd: marked.cache_read_input_tokens + marked.cache_creation_input_tokens,
    markEnd,
    uncachedAfterMark: both.input_tokens,
    afterTokens,
    closingTokens: both.input_tokens - afterTokens,
  }
}

/**
 * Debug mode, for checking the inspector in a real session: while the project
 * holds `.claude/prompt-inspector.debug`, each turn's end measures everything
 * and writes `.claude/prompt-inspector.report.json` (never committed).
 */
async function debugReport($: Engine): Promise<void> {
  const root = await $.session.root()
  const isOn = await $.fs.exists(`${root}/.claude/prompt-inspector.debug`)
  await trace($, 'turn end', isOn ? `debug on in ${root}` : `debug off in ${root}`)
  if (!isOn) return
  await measure($)
  const steps = await read($, stepsAtom)
  const model = steps[steps.length - 1]?.model ?? (await $.session.model())
  const done = (await $.store.get(`selftest:${model}`)) as Record<string, number | string> | undefined
  const test = done ?? (await selfTest($, model))
  if (done === undefined) await $.store.set(`selftest:${model}`, test)
  const yours = await rowsFor($, 'yours')
  const all = await rowsFor($, 'all')
  const report = {
    selfTest: test,
    systemEnd: await read($, systemEndAtom),
    steps: steps.slice(-8).map(({ tail, ...step }) => ({ ...step, tailBlocks: tail.length })),
    yours: yours.rows.map(r => cardLabel(r)),
    all: all.rows.map(r => `${cardLabel(r)}  [${describe(r)}]`),
  }
  await $.fs.write(`${root}/.claude/prompt-inspector.report.json`, JSON.stringify(report, null, 2))
  await trace($, 'report written', `${root}/.claude/prompt-inspector.report.json`)
}

/** The last few debug events, kept in the store (a file on disk) where a failing report can still be read. */
async function trace($: Engine, what: string, detail: string): Promise<void> {
  const log = ((await $.store.get('debug:trace')) as string[] | undefined) ?? []
  await $.store.set('debug:trace', [...log, `${what}: ${detail}`].slice(-20))
}

function originOf(origin: PromptAttachmentOrigin, type: string): string {
  if (origin.kind === 'hook') return `${type} from a ${origin.event} hook`
  if (origin.kind === 'plugin') return `${type} from a plugin`

  return type
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await trace($, 'loaded', `cwd ${e.cwd}, interactive ${e.isInteractive}`)
    await $.command.register({
      name: 'inspect',
      description: 'Your rules and skills in the prompt, at exact token positions: delete or re-inject them',
      argumentHint: '[all]',
      immediate: true,
    })
    try {
      const commands = await $.command.list()
      const mine = commands.filter(c => c.source === 'user').map(c => c.name)
      await update($, userSkillsAtom, () => mine)
    } catch {
      // No commands listed: no skill counts as yours.
    }
    // Joined a conversation already under way, with nothing recorded: what is already in it is not measured.
    try {
      const history = await $.session.messages()
      const isFresh = (await read($, piecesAtom)).length === 0
      await update($, catchingUpAtom, () => history.length > 0 && isFresh)
    } catch {
      // No session bound yet.
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, messageAtom, n => n + 1)

    return next(e)
  })

  // Each request of the main conversation: its exact size, and the last message it ends with.
  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    const goneThen = [...(await gone($))]
    let tail: string[] = []
    if (isMain) {
      const waiting = (await read($, piecesAtom)).some(p => p.step === null && !p.isEarlier && p.zone !== 'system')
      if (waiting) tail = await captureTail($)
    }
    const result = yield* next(e)
    const usage = result.usage
    if (!isMain || usage === null) return result
    const total = usageTotal(usage)
    const end = usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    // Only the closing tokens uncached: the cache mark sits at the last block's end.
    const isAnchor = usage.input_tokens <= 8 && (result.serverToolUses?.length ?? 0) === 0
    const message = await read($, messageAtom)
    let id = 0
    await update($, stepsAtom, steps => {
      id = (steps[steps.length - 1]?.id ?? -1) + 1
      const step = { id, message, index: e.index, messageCount: e.messageCount, total, end, isAnchor, tail, gone: goneThen, model: usage.model }

      return [...steps, step].slice(-300)
    })
    if (tail.length > 0) {
      await update($, piecesAtom, list => list.map(p => (p.step === null && !p.isEarlier && p.zone !== 'system' ? { ...p, step: id } : p)))
    }
    if (await read($, catchingUpAtom)) await update($, catchingUpAtom, () => false)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      await debugReport($)
    } catch (err) {
      // Debug mode only: a failed report changes nothing but its trace.
      await trace($, 'report failed', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    }

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, piecesAtom, () => [])
      await update($, stepsAtom, () => [])
      await update($, textsAtom, () => ({}))
      await update($, messageAtom, () => 0)
      await update($, systemEndAtom, () => null)
      await update($, catchingUpAtom, () => false)
    }

    return next(e)
  })

  // The system prompt, section by section: sized exactly; its position is inside tools + system prompt.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.traits.includes('analysis')) {
      await record(
        $,
        result.sections.map(s => ({
          piece: piece({ key: keys.section(s.id), kind: 'section', zone: 'system', label: `system: ${s.id}` }, s.text, 0, false),
          text: s.text,
        })),
      )
    }
    const out = await gone($)
    const kept = result.sections.filter(s => !out.has(keys.section(s.id)))

    return kept.length === result.sections.length ? result : { sections: kept }
  })

  // The first message's context: `claudeMd`, each instruction file in it, and the other blocks.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const files = result.instructionFiles ?? e.instructionFiles ?? []
    const memory = result.blocks.find(b => b.name === 'claudeMd')
    const spans = memory === undefined ? [] : spansOfFiles(memory.text, files)
    const { isEarlier } = await now($)
    const seen: { piece: Piece; text: string }[] = []
    for (const block of result.blocks) {
      if (block.text.length === 0) continue
      const label = block.name === 'claudeMd' ? 'context: CLAUDE.md files' : `context: ${block.name}`
      seen.push({ piece: piece({ key: keys.context(block.name), kind: 'context', zone: 'context', label }, block.text, 0, isEarlier), text: block.text })
    }
    for (const [j, file] of files.entries()) {
      const span = spans[j] ?? null
      if (memory === undefined || span === null) continue
      const text = memory.text.slice(span.offset, span.offset + span.chars)
      const fields: Fields = {
        key: keys.rule(file.path),
        kind: 'rule',
        zone: 'context',
        label: await shortPath($, file.path),
        isYours: YOUR_FILES.has(file.kind),
        parent: keys.context('claudeMd'),
      }
      seen.push({ piece: piece(fields, text, 0, isEarlier), text })
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
    const pieces = await read($, piecesAtom)
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
  // and a piece re-injected by 🔄 (it rides as the next message's context).
  on('prompt.attachment', async ($, e, next) => {
    const result = await next(e)
    if (result.text === null) return result
    const out = await gone($)
    const key = keys.attachment(e.type, e.text)
    const entries = e.type === 'skill_listing' ? parseListing(result.text) : []
    if (e.agentId === undefined) {
      const saved = await read($, savedAtom)
      const isRiding = e.origin.kind === 'plugin' && e.origin.event === 'prompt.submit'
      const copyOf = isRiding ? (Object.keys(saved).find(k => (saved[k] ?? '') !== '' && e.text.includes(saved[k] ?? '')) ?? null) : null
      const pieces = await read($, piecesAtom)
      const original = copyOf === null ? undefined : pieces.find(p => p.key === copyOf)
      const userSkills = new Set(await read($, userSkillsAtom))
      const { message, isEarlier } = await now($)
      const path = pathOfAttachment(result.text)
      const isRule = e.type === 'nested_memory' || e.type === 'instructions'
      const kind: PieceKind = original?.kind ?? (isRule ? 'rule' : 'reminder')
      const label =
        original !== undefined
          ? `🔄 ${original.label}`
          : e.type === 'skill_listing'
            ? `skill list (${entries.length} skills)`
            : path !== null
              ? await shortPath($, path)
              : firstLine(result.text) || originOf(e.origin, e.type)
      const zone: PieceZone = 'conversation'
      const seen = [
        {
          piece: piece({ key, kind, zone, label, attachment: e.type, isYours: original?.isYours ?? isRule, copyOf }, result.text, message, isEarlier),
          text: result.text,
        },
      ]
      for (const span of entries) {
        const text = result.text.slice(span.offset, span.offset + span.chars)
        const fields: Fields = {
          key: keys.skillLine(span.name),
          kind: 'skill-line',
          zone,
          label: `skill list: ${span.name}`,
          isYours: userSkills.has(span.name),
          parent: key,
        }
        seen.push({ piece: piece(fields, text, message, isEarlier), text })
      }
      await record($, seen)
      // A copy whose piece was moved again, or put back, leaves with the next request.
      const moved = await read($, movedAtom)
      if (copyOf !== null && moved[copyOf] !== 'sent') return { text: null }
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

    return result
  })

  // A skill's text, each time it is used: a new injection, measured from the request that carries it.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    const userSkills = new Set(await read($, userSkillsAtom))
    const { message } = await now($)
    const key = keys.skill(e.skill)
    const fields: Fields = { key, kind: 'skill', zone: 'conversation', label: `skill: ${e.skill}`, isYours: userSkills.has(e.skill) }
    await remember($, { [textKey(result.text)]: result.text })
    await update($, piecesAtom, list => [...list.filter(p => p.key !== key), piece(fields, result.text, message, false)])

    return (await gone($)).has(key) ? { text: `(prompt-inspector deleted the ${e.skill} skill's instructions.)` } : result
  })

  on('command.run', { command: 'inspect' }, async ($, e) => {
    const scope = e.args.trim() === 'all' ? 'all' : 'yours'

    // The cards show the list; Claude reads only this line.
    return { text: await inspect($, scope) }
  })
}
