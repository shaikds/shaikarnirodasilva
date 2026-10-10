import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { carry, cutSpans, diffBlocks, filterListing, int, parseListing, rangeFromEnd, typedPosition, withFillers } from '../hooks/model'
import type { Row } from '../hooks/model'
import type { Position, Step } from '../types'

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: ['Bash'], outputStyle: null, traits: [] } as const

const RULE_A = '/repo/CLAUDE.md'
const RULE_B = '/repo/.claude/rules/tests.md'
// Real files end with a newline; the engine renders each one trimmed.
const FILES = [
  { path: RULE_A, kind: 'project', content: 'Always answer in English.\n' },
  { path: RULE_B, kind: 'project', content: 'Run the tests before every commit.\n' },
] as const

/** The engine's render of the instruction files, as `claudeMd`. */
function renderClaudeMd(files: readonly { path: string; content: string }[]): string {
  const body = files.map(f => `Contents of ${f.path} (project instructions, checked into the codebase):\n\n${f.content.trim()}`).join('\n\n')

  return `Codebase and user instructions are shown below.\n\n${body}`
}
const CLAUDE_MD = renderClaudeMd(FILES)
const CONTEXT = { blocks: [{ name: 'claudeMd', text: CLAUDE_MD }], instructionFiles: FILES } as const
/** The first message's context block, as a request carries it. */
const contextBlock = (md: string) => `<system-reminder>\nAs you answer the user's questions, you can use the following context:\n# claudeMd\n${md}\n</system-reminder>`
const wrap = (text: string) => `<system-reminder>\n${text}\n</system-reminder>`

const NESTED = { type: 'nested_memory', text: 'Contents of /repo/src/CLAUDE.md:\nUse tabs.', origin: { kind: 'engine' } } as const
const TODO = { type: 'todo_reminder', text: 'Use the todo list.', origin: { kind: 'engine' } } as const

const LISTING = ['The following skills are available:', '- commit: Writes the commit message.', '- anthropic-skills:docs: docs', '  more about docs', '- review (project): Reviews the diff.'].join('\n')

/** Tools + system prompt, in the fake engine's tokens. */
const SYSTEM = 9_000

type Card = { question: string; header: string; options: { label: string }[] }
type Message = { role: 'user' | 'assistant'; content: { type: string; text: string }[] }

/**
 * The engine beneath the plugin. Its tokenizer counts one token per character
 * (plus a fixed 8 for every counting request), drops a counted text's trailing
 * whitespace as the real API does, and blocks add nothing between them, so a request is SYSTEM plus its texts' characters, and every exact
 * range is arithmetic on the strings. `world` is the conversation and what the
 * test sets for the next request.
 */
function engine(on: On) {
  const world = {
    /** The conversation as the next request carries it. */
    api: [] as Message[],
    /** cache read the next request reports; by default the last request's end (nothing before it changed). */
    cacheRead: null as number | null,
    lastEnd: 0,
    /** The tokens it leaves uncached: the closing 2, or more when text follows its cache mark. */
    uncached: 2,
    /** What the person taps on the next cards, in order; none left closes the card. */
    taps: [] as string[],
    cards: [] as Card[],
    counted: 0,
    /** Every counting request's prompt, and the most that were in flight at once. */
    prompts: [] as string[],
    inFlight: 0,
    most: 0,
    isDebug: false,
    tools: [] as string[],
    /** The conversation's rows before the inspector started (non-empty: it joined late). */
    history: [] as unknown[],
  }
  mock.clock(on)
  mock.store(on)
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'm' }))
  on('fs.exists', () => ({ value: world.isDebug }))
  on('session.messages', ($, e) => ({ value: e.as === 'api' ? world.api : world.history }) as never)
  on('model.complete', async ($, e) => {
    world.counted += 1
    world.prompts.push(e.prompt)
    world.inFlight += 1
    world.most = Math.max(world.most, world.inFlight)
    for (let i = 0; i < 20; i++) await Promise.resolve()
    world.inFlight -= 1
    // Like the real API: a text counted alone loses its trailing whitespace.
    const blocks = e.promptBlocks ?? [{ text: e.prompt }]
    const usage = { input_tokens: 8 + blocks.reduce((n, b) => n + b.text.trimEnd().length, 0), output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    return { value: { isAnswered: true, text: '', usage } } as never
  })
  on('prompt.compose', () => ({
    sections: [
      { id: 'intro', text: 'You are Claude Code.', scope: 'shared' },
      { id: 'memory', text: 'Remember: be terse.', scope: 'session' },
    ],
  }))
  on('prompt.context', ($, e) => ({ blocks: e.blocks, instructionFiles: e.instructionFiles }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    const end = SYSTEM + chars(world.api)
    const read = world.cacheRead ?? world.lastEnd
    const usage = { input_tokens: world.uncached, output_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: end - read, model: 'm' }
    world.lastEnd = end
    world.cacheRead = null

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const asked = e.questions[0] as Card
    world.cards.push(asked)
    const tap = world.taps.shift()
    if (tap === undefined) return { deny: 'closed' } as never
    // A tap names a choice by its name (before " · "); anything else is typed under Other.
    const choice = asked.options.find(o => o.label === tap || o.label.startsWith(`${tap} · `))?.label ?? tap

    return { result: { questions: e.questions, answers: { [asked.question]: choice } } } as never
  })

  return world
}

type World = ReturnType<typeof engine>

const chars = (api: readonly Message[]) => api.reduce((n, m) => n + m.content.reduce((k, b) => k + b.text.length, 0), 0)

/** Where a text's last occurrence sits in the conversation, in the fake engine's tokens. */
function where(world: World, text: string): { start: number; end: number } {
  let before = SYSTEM
  let found = -1
  for (const m of world.api) {
    for (const b of m.content) {
      const at = b.text.lastIndexOf(text)
      if (at >= 0) found = before + at
      before += b.text.length
    }
  }

  return { start: found, end: found + text.length }
}

/** One request of the main conversation: an answer, then a user message of these blocks. */
async function request($: Engine, world: World, tail: string[], messageCount = world.api.length + 2): Promise<void> {
  if (world.api.length > 0) world.api.push({ role: 'assistant', content: [{ type: 'text', text: 'ok' }] })
  world.api.push({ role: 'user', content: tail.map(text => ({ type: 'text', text })) })
  for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount })) void chunk
}

async function inspect($: Engine, args = ''): Promise<string> {
  const ran = await $.command.run({ command: 'inspect', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 40 } })

  return ran.text ?? ''
}

async function startSession($: Engine, on: On, skills: { name: string; source: string }[] = []): Promise<void> {
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: skills.map(s => ({ ...s, description: '' })) }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
}

/** The first message: context with two rule files, then "Hello there". */
async function firstMessage($: Engine, world: World): Promise<void> {
  await $.prompt.compose(COMPOSE)
  await $.prompt.context(CONTEXT)
  await $.turn.start({ text: 'Hello there', turnId: 't' })
  await request($, world, [contextBlock(CLAUDE_MD), 'Hello there'], 1)
}

/** A rule's text as claudeMd holds it: its header line and its content. */
const ruleText = (file: (typeof FILES)[number]) => `Contents of ${file.path} (project instructions, checked into the codebase):\n\n${file.content.trim()}`

const labels = (card: Card | undefined) => card?.options.map(o => o.label)

/** Every row of a view: pages through it with More… until the cards close. */
async function everyLabel($: Engine, world: World, args = ''): Promise<string[]> {
  const from = world.cards.length
  world.taps = Array.from({ length: 40 }, () => 'More…')
  await inspect($, args)

  return [...new Set(world.cards.slice(from).flatMap(card => labels(card) ?? []))].filter(l => l !== 'More…' && l !== 'Done')
}

/** Opens a piece by typing a token inside it, then taps what follows. */
async function open($: Engine, world: World, at: number, then: string[], args = ''): Promise<Card[]> {
  const from = world.cards.length
  world.taps = [String(at), ...then, 'Done']
  await inspect($, args)

  return world.cards.slice(from)
}
const range = (r: { start: number; end: number }) => `${int(r.start)}–${int(r.end)}`

describe('model', () => {
  test('cuts a span and the line breaks after it', () => {
    expect(cutSpans('a\n\nbb\n\nc', [{ name: 'b', offset: 3, chars: 2 }])).toBe('a\n\nc')
  })

  test('parses a skill listing, names with colons and continuation lines included', () => {
    expect(parseListing(LISTING).map(s => s.name)).toEqual(['commit', 'anthropic-skills:docs', 'review'])
    expect(filterListing(LISTING, new Set(['anthropic-skills:docs']))).not.toContain('docs')
  })

  test('places a piece from the end of its request: blocks after it, then the rest of its own block', () => {
    expect(rangeFromEnd(10_000, 300, 20, 50)).toEqual({ start: 9_630, end: 9_680 })
  })

  test('tells which blocks changed between two requests, and stops where a change can’t be counted', () => {
    expect(diffBlocks(['m:user', 'A', 'B', 'C'], ['m:user', 'A', 'C', 'm:assistant'])).toEqual({ blocks: [{ at: 2, before: 'B', after: null }], brokenAt: null })
    expect(diffBlocks(['m:user', 'A', 'C'], ['m:user', 'A', 'B', 'C'])).toEqual({ blocks: [{ at: 2, before: null, after: 'B' }], brokenAt: null })
    expect(diffBlocks(['m:user', 'A', 'C'], ['m:user', 'A2', 'C', 'm:assistant'])).toEqual({ blocks: [{ at: 1, before: 'A', after: 'A2' }], brokenAt: null })
    expect(diffBlocks(['m:user', 'A', 'x:1', 'C'], ['m:user', 'A', 'x:2', 'C']).brokenAt).toBe(2)
    expect(diffBlocks(['m:user', 'A', 'm:assistant', 'B'], ['m:user', 'S']).brokenAt).toBe(1)
  })

  test('carries a position: unchanged under the cache, moved by exactly what changed before it, lost when it can’t be counted', () => {
    const texts: Record<string, string> = { A: 'aaaa', A2: 'aa', P: 'xxPIECExx', P2: 'PIECExx' }
    const count = (t: string) => t.length
    const at: Position = { start: 100, end: 105, block: 3, offset: 2, key: 'P' }
    const step = (id: number, cacheRead: number, change: Step['change']): Step => ({ id, message: 1, index: 0, messageCount: 3, total: 999, end: 997, cacheRead, uncached: 2, isAnchor: true, blocks: 9, tail: [], change, model: 'm' })
    const same = { kind: 'known', blocks: [], brokenAt: null, system: 'same' } as const
    expect(carry(at, 0, 'PIECE', 5, [step(1, 200, same)], texts, count)).toEqual({ kind: 'at', at, step: 1 })
    const shrunk = { kind: 'known', blocks: [{ at: 1, before: 'A', after: 'A2' }], brokenAt: null, system: 'same' } as const
    expect(carry(at, 0, 'PIECE', 5, [step(1, 50, shrunk)], texts, count)).toEqual({ kind: 'at', at: { ...at, start: 98, end: 103 }, step: 1 })
    const own = { kind: 'known', blocks: [{ at: 3, before: 'P', after: 'P2' }], brokenAt: null, system: 'same' } as const
    expect(carry(at, 0, 'PIECE', 5, [step(1, 50, own)], texts, count)).toEqual({ kind: 'at', at: { start: 98, end: 103, block: 3, offset: 0, key: 'P2' }, step: 1 })
    const out = { kind: 'known', blocks: [{ at: 3, before: 'P', after: null }], brokenAt: null, system: 'same' } as const
    expect(carry(at, 0, 'PIECE', 5, [step(1, 50, out)], texts, count)).toEqual({ kind: 'gone', was: { start: 100, end: 105 }, step: 0 })
    const broken = { kind: 'known', blocks: [], brokenAt: 2, system: 'same' } as const
    expect(carry(at, 0, 'PIECE', 5, [step(1, 50, broken)], texts, count).kind).toBe('lost')
    expect(carry(at, 0, 'PIECE', 5, [step(1, 50, { kind: 'unknown' })], texts, count).kind).toBe('lost')
  })

  test('the first stretch of /inspect all is named for both when the split is not known', () => {
    const row = { key: 'b', group: 'b', label: 'b', kind: 'rule', isYours: true, start: 150, end: 160, tokens: 10, message: 1, isDeleted: false, isMoved: false, isCopy: false, was: null, note: null, isActionable: true } as Row
    expect(withFillers([row], 1000, 80).map(r => `${r.label}:${r.start}-${r.end}`)).toEqual(['tools + system prompt:0-80', 'conversation:80-150', 'b:150-160', 'conversation:160-1000'])
    expect(withFillers([row], 1000, null)[0]?.label).toBe('tools + system prompt + conversation')
  })

  test('reads a typed token position written with any thousands separator', () => {
    expect(typedPosition('58,002')).toBe(58_002)
    expect(typedPosition('58.002')).toBe(58_002)
    expect(typedPosition('58 002')).toBe(58_002)
    expect(typedPosition('CLAUDE')).toBeNull()
  })
})

describe('plugin', () => {
  test("places each CLAUDE.md file exactly, from the first request's end", async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    world.taps = ['Done']
    expect(await inspect($)).toBe('Prompt inspector closed.')
    const card = world.cards[0]
    const [a, b] = FILES
    expect(card?.question).toBe(`Your rules & skills · last request ${int(SYSTEM + chars(world.api) + 2)} tokens · 2 pieces, page 1/1. Tap one, or type a token position.`)
    expect(labels(card)).toEqual([`CLAUDE.md · ${range(where(world, ruleText(a)))}`, `.claude/rules/tests.md · ${range(where(world, ruleText(b)))}`, 'Done'])
  })

  test('deletes a rule after confirming; the next request leaves it out, and the other rule is carried there exactly', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const [a, b] = FILES
    const wasA = where(world, ruleText(a))
    world.taps = ['CLAUDE.md', '🗑 Delete', 'Yes, delete', 'Done']
    await inspect($)
    expect(world.cards.map(c => c.header)).toEqual(['Inspect', 'Piece', 'Confirm', 'Inspect'])
    expect(world.cards[1]?.question).toStartWith(`CLAUDE.md: ${int(wasA.start)} → ${int(wasA.end)} · ${int(wasA.end - wasA.start)} tok · message 1. `)
    expect(world.cards[3]?.question).toStartWith('Deleted CLAUDE.md: it leaves the prompt from your next message. ')
    const answer = await $.prompt.context(CONTEXT)
    expect(answer.instructionFiles?.map(f => f.path)).toEqual([RULE_B])
    // The engine renders claudeMd again from the shorter list; the first message changes, so the cache reads up to it only.
    world.api[0] = { role: 'user', content: [{ type: 'text', text: contextBlock(renderClaudeMd([b])) }, { type: 'text', text: 'Hello there' }] }
    world.cacheRead = SYSTEM
    await $.turn.start({ text: 'Again', turnId: 't2' })
    await request($, world, ['Again'])
    world.taps = ['Done']
    await inspect($)
    expect(labels(world.cards[4])).toEqual([`CLAUDE.md · deleted, was ${range(wasA)}`, `.claude/rules/tests.md · ${range(where(world, ruleText(b)))}`, 'Done'])
  })

  test('a piece injected later is placed from the end of the request that first carries it, and stays exact while the cache proves it', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    await $.turn.start({ text: 'Edit src/app.ts', turnId: 't2' })
    await $.prompt.attachment(NESTED)
    await $.prompt.attachment(TODO)
    await request($, world, ['Edit src/app.ts', wrap(NESTED.text), wrap(TODO.text)])
    await $.turn.start({ text: 'More', turnId: 't3' })
    await request($, world, ['More'])
    const nested = where(world, NESTED.text)
    expect(await everyLabel($, world)).toContain(`src/CLAUDE.md · ${range(nested)}`)
    const cards = await open($, world, nested.start, ['Back'])
    expect(cards[1]?.question).toStartWith(`src/CLAUDE.md: ${int(nested.start)} → ${int(nested.end)} · 42 tok · message 2. `)
  })

  test('deleting a reminder takes its block out; a later piece moves by exactly that block', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    await $.turn.start({ text: 'Edit', turnId: 't2' })
    await $.prompt.attachment(TODO)
    await request($, world, ['Edit', wrap(TODO.text)])
    await $.turn.start({ text: 'More', turnId: 't3' })
    await $.prompt.attachment(NESTED)
    await request($, world, ['More', wrap(NESTED.text)])
    await open($, world, where(world, TODO.text).start, ['🗑 Delete', 'Yes, delete'], 'all')
    expect((await $.prompt.attachment(TODO)).text).toBeNull()
    // The next request: the reminder's block is gone from message 2.
    const message2 = world.api[2]
    if (message2 !== undefined) message2.content = message2.content.filter(b => b.text !== wrap(TODO.text))
    world.cacheRead = SYSTEM + chars(world.api.slice(0, 2))
    await $.turn.start({ text: 'Third', turnId: 't4' })
    await request($, world, ['Third'])
    expect(await everyLabel($, world)).toContain(`src/CLAUDE.md · ${range(where(world, NESTED.text))}`)
  })

  test('after a compaction, what it summarized away reads not measured', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    await $.turn.start({ text: 'Edit', turnId: 't2' })
    await $.prompt.attachment(NESTED)
    await request($, world, ['Edit', wrap(NESTED.text)])
    world.api = [{ role: 'user', content: [{ type: 'text', text: 'Summary of the conversation so far.' }] }]
    world.cacheRead = SYSTEM
    await $.turn.start({ text: 'Go on', turnId: 't3' })
    await request($, world, ['Go on'])
    expect(await everyLabel($, world)).toContain('src/CLAUDE.md · not measured')
    expect(world.cards[0]?.question).toContain(`last request ${int(SYSTEM + chars(world.api) + 2)} tokens`)
  })

  test('a request that left more than the closing tokens uncached places nothing: its end is not its last block’s', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    await $.turn.start({ text: 'Edit src/app.ts', turnId: 't2' })
    await $.prompt.attachment(NESTED)
    world.uncached = 4
    await request($, world, ['Edit src/app.ts', wrap(NESTED.text)])
    expect(await everyLabel($, world)).toContain('src/CLAUDE.md · not measured')
    // The size shown is the last request's, exact even where it places nothing.
    expect(world.cards[0]?.question).toContain(`last request ${int(SYSTEM + chars(world.api) + 4)} tokens`)
  })

  test('🔄 moves a rule to ride with the next message, where its copy is placed exactly; the original reads moved', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const [a, b] = FILES
    const wasA = where(world, ruleText(a))
    world.taps = ['CLAUDE.md', '🔄 Re-inject at end', 'Done']
    await inspect($)
    expect(world.cards[2]?.question).toStartWith('CLAUDE.md will ride with your next message, at the end. ')
    const submitted = await $.prompt.submit({ text: 'Again', wait: false, origin: { kind: 'composer' } })
    const copy = submitted.context?.[0] ?? ''
    expect(copy).toBe(ruleText(a))
    expect((await $.prompt.context(CONTEXT)).instructionFiles?.map(f => f.path)).toEqual([RULE_B])
    world.api[0] = { role: 'user', content: [{ type: 'text', text: contextBlock(renderClaudeMd([b])) }, { type: 'text', text: 'Hello there' }] }
    world.cacheRead = SYSTEM
    await $.turn.start({ text: 'Again', turnId: 't2' })
    const riding = `prompt.submit hook additional context: ${copy}`
    await $.prompt.attachment({ type: 'hook_additional_context', text: riding, origin: { kind: 'plugin', event: 'prompt.submit' } })
    await request($, world, ['Again', wrap(riding)])
    expect(await everyLabel($, world)).toEqual([`CLAUDE.md · moved, was ${range(wasA)}`, `.claude/rules/tests.md · ${range(where(world, ruleText(b)))}`, `🔄 CLAUDE.md · ${range(where(world, copy))}`])
  })

  test('/inspect all runs from token 0: tools + system prompt, the pieces, and the conversation between them', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const all = await everyLabel($, world, 'all')
    expect(all).toContain(`▒ tools + system prompt · 0–${int(SYSTEM)}`)
    expect(all).toContain(`context: CLAUDE.md files · ${range(where(world, CLAUDE_MD))}`)
    expect(all[0]).toBe('system: intro · in system prompt')
  })

  test('a typed token position opens the piece there; a filler cannot be deleted', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const b = where(world, ruleText(FILES[1]))
    world.taps = [String(b.start + 3).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), 'Back', '5', 'Done']
    await inspect($, 'all')
    expect(world.cards[1]?.question).toStartWith('.claude/rules/tests.md: ')
    expect(world.cards[3]?.question).toStartWith(`The tools + system prompt (0 → ${int(SYSTEM)} · ${int(SYSTEM)} tok) can't be deleted. `)
  })

  test('counts each text once: a second look sends no new counting requests', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    world.taps = ['Done']
    await inspect($)
    const first = world.counted
    expect(first).toBeGreaterThan(0)
    world.taps = ['Done']
    await inspect($)
    expect(world.counted).toBe(first)
  })

  test('/inspect counts only your pieces; /inspect all counts the rest, at most 8 requests at once', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const reminders = Array.from({ length: 12 }, (_, i) => ({ type: 'todo_reminder', text: `Reminder number ${i}.`, origin: { kind: 'engine' } }) as const)
    await $.turn.start({ text: 'Next', turnId: 't2' })
    for (const r of reminders) await $.prompt.attachment(r)
    await request($, world, [...reminders.map(r => wrap(r.text)), 'Next'])
    world.taps = ['Done']
    await inspect($)
    expect(world.prompts.some(p => p.includes('You are Claude Code.') || p.includes('Reminder number'))).toBe(false)
    world.taps = ['Done']
    await inspect($, 'all')
    expect(world.prompts.some(p => p.includes('Reminder number 11.'))).toBe(true)
    expect(world.most).toBeGreaterThan(1)
    expect(world.most).toBeLessThanOrEqual(8)
  })

  test('a reminder Claude Code sends reworded is found by its lines and placed as its whole block, as sent', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const note = { type: 'session_note', text: 'Notes for this session:\nRemember to keep every answer short and friendly.\nAsk before deleting anything at all.', origin: { kind: 'engine' } } as const
    const sent = wrap('Session notes, as sent:\nRemember to keep every answer short and friendly.\nAsk before deleting anything at all.')
    await $.turn.start({ text: 'Hi', turnId: 't2' })
    await $.prompt.attachment(note)
    await request($, world, ['Hi', sent])
    expect(await everyLabel($, world, 'all')).toContain(`session note: Notes for this session: · ${range(where(world, sent))}`)
  })

  test('the same reminder arriving with two messages is two pieces, each at its own place', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    for (const [n, word] of ['Two', 'Three'].entries()) {
      await $.turn.start({ text: word, turnId: `t${n}` })
      await $.prompt.attachment(TODO)
      await request($, world, [word, wrap(TODO.text)])
    }
    const all = await everyLabel($, world, 'all')
    expect(all.filter(l => l.startsWith('todo reminder: Use the todo list. · ')).length).toBe(2)
    expect(all).toContain(`todo reminder: Use the todo list. · ${range(where(world, TODO.text))}`)
  })

  test('debug mode registers a tool that returns the report, the self-test included', async ($, on) => {
    const world = engine(on)
    world.isDebug = true
    on('tool.register', ($, e) => {
      world.tools.push(e.name)

      return { value: { tool: `mcp__prompt-inspector__${e.name}` } }
    })
    await startSession($, on)
    expect(world.tools).toEqual(['debug'])
    await firstMessage($, world)
    // A plugin's own tool is not in the built-in tool table the call is typed by.
    const ran = await $.tool.call({ tool: 'mcp__prompt-inspector__debug' } as never)
    const report = JSON.parse(String(ran.result)) as { selfTest: { result: string }; yours: string[] }
    // The fake tokenizer has no cache, so the self-test says so rather than guess.
    expect(report.selfTest.result).toBe('caching or counting unavailable')
    expect(report.yours[0]).toStartWith('CLAUDE.md · ')
  })

  test('a message you typed while Claude worked is your own words: never listed, never deleted', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const typed = { type: 'queued_command', text: 'also rename the helper', origin: { kind: 'engine' } } as const
    expect((await $.prompt.attachment(typed)).text).toBe('also rename the helper')
    expect((await everyLabel($, world, 'all')).some(l => l.includes('rename the helper'))).toBe(false)
  })

  test('what was in the conversation before the inspector started reads not measured', async ($, on) => {
    const world = engine(on)
    world.history = [{ role: 'user', text: 'earlier prompt', toolUses: [] }]
    world.api = [{ role: 'user', content: [{ type: 'text', text: 'earlier prompt' }] }]
    await startSession($, on)
    await $.prompt.attachment(NESTED)
    await $.turn.start({ text: 'Now', turnId: 't' })
    await request($, world, ['Now'])
    world.taps = ['src/CLAUDE.md', 'Back', 'Done']
    await inspect($)
    expect(labels(world.cards[0])).toContain('src/CLAUDE.md · not measured')
    expect(world.cards[1]?.question).toStartWith('src/CLAUDE.md: sent before the inspector started (not measured) · 42 tok')
  })

  test('a skill you made: its list line and its text when used; 🗑 stops later uses and the text already sent keeps its place', async ($, on) => {
    const world = engine(on)
    await startSession($, on, [{ name: 'commit', source: 'user' }])
    await $.turn.start({ text: '/commit', turnId: 't' })
    await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
    await $.skill.prompt({ skill: 'commit', text: 'Write a conventional commit.' })
    await request($, world, [wrap(LISTING), 'Write a conventional commit.'], 1)
    const text = where(world, 'Write a conventional commit.')
    world.taps = ['skill: commit', '🗑 Stop later uses', 'Yes, stop them', 'Done']
    await inspect($)
    const card = labels(world.cards[0]) ?? []
    expect(card[0]).toStartWith('skill list: commit · ')
    expect(card[1]).toBe(`skill: commit · ${range(text)}`)
    expect(world.cards[3]?.question).toStartWith('Later uses of skill: commit stopped; its text already sent stays. ')
    expect((await $.skill.prompt({ skill: 'commit', text: 'Write a conventional commit.' })).text).toBe("(prompt-inspector deleted the commit skill's instructions.)")
    await $.turn.start({ text: 'Next', turnId: 't2' })
    await request($, world, ['Next'])
    expect(await everyLabel($, world)).toContain(`skill: commit · ${range(text)}, later uses stopped`)
  })

  test('🔄 on a skill sends a copy and keeps later uses whole', async ($, on) => {
    const world = engine(on)
    await startSession($, on, [{ name: 'commit', source: 'user' }])
    await $.turn.start({ text: '/commit', turnId: 't' })
    await $.skill.prompt({ skill: 'commit', text: 'Write a conventional commit.' })
    await request($, world, ['Write a conventional commit.'], 1)
    world.taps = ['skill: commit', '🔄 Send a copy at end', 'Done']
    await inspect($)
    expect((await $.skill.prompt({ skill: 'commit', text: 'Write a conventional commit.' })).text).toBe('Write a conventional commit.')
  })
})
