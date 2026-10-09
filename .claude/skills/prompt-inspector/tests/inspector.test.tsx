import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { cutSpans, filterListing, int, layout, parseListing, rangeFromEnd, spansOfFiles, withFillers } from '../hooks/model'
import type { Piece, Step } from '../types'

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

const RULE_A = '/repo/CLAUDE.md'
const RULE_B = '/repo/.claude/rules/tests.md'
const CLAUDE_MD = [
  'Codebase and user instructions are shown below.',
  '',
  `Contents of ${RULE_A} (project instructions, checked into the codebase):`,
  '',
  'Always answer in English.',
  '',
  `Contents of ${RULE_B} (project instructions, checked into the codebase):`,
  '',
  'Run the tests before every commit.',
].join('\n')
const FILES = [
  { path: RULE_A, kind: 'project', content: 'Always answer in English.' },
  { path: RULE_B, kind: 'project', content: 'Run the tests before every commit.' },
] as const
const CONTEXT = { blocks: [{ name: 'claudeMd', text: CLAUDE_MD }], instructionFiles: FILES } as const
/** The first message's context block, as a request carries it. */
const CONTEXT_BLOCK = `<system-reminder>\nAs you answer the user's questions, you can use the following context:\n# claudeMd\n${CLAUDE_MD}\n</system-reminder>`

const NESTED = { type: 'nested_memory', text: 'Contents of /repo/src/CLAUDE.md:\nUse tabs.', origin: { kind: 'engine' } } as const
const NESTED_BLOCK = `<system-reminder>\n${NESTED.text}\n</system-reminder>`
const TODO = { type: 'todo_reminder', text: 'Use the todo list.', origin: { kind: 'engine' } } as const
const TODO_BLOCK = `<system-reminder>\n${TODO.text}\n</system-reminder>`

const LISTING = ['The following skills are available:', '- commit: Writes the commit message.', '- anthropic-skills:docs: docs', '  more about docs', '- review (project): Reviews the diff.'].join('\n')

type Card = { question: string; header: string; options: { label: string }[] }

/**
 * The engine beneath the plugin. Its tokenizer counts one token per character
 * (plus a fixed 8 for every request), so every exact range is checkable by
 * arithmetic on the strings. `world` is what the test sets for the next request.
 */
function engine(on: On) {
  const world = {
    /** The last message of the next request, block by block. */
    tail: [] as string[],
    /** cache read + cache write the next request reports (its last block's end). */
    end: 0,
    /** What the person taps on the next cards, in order; none left closes the card. */
    taps: [] as string[],
    cards: [] as Card[],
    counted: 0,
    /** The conversation's rows before this point (non-empty: the inspector joined late). */
    history: [] as unknown[],
  }
  mock.clock(on)
  mock.store(on)
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.model', () => ({ value: 'm' }))
  on('session.messages', ($, e) => ({ value: e.as === 'api' ? [{ role: 'user', content: world.tail.map(text => ({ type: 'text', text })) }] : world.history }) as never)
  on('model.complete', ($, e) => {
    world.counted += 1
    const usage = { input_tokens: 8 + e.prompt.length, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

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
    const usage = { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: world.end - 100, cache_creation_input_tokens: 100, model: 'm' }

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

/** One request of the main conversation: its last message is `tail`; its content ends at `end`. */
async function request($: Engine, world: ReturnType<typeof engine>, tail: string[], end: number, messageCount: number): Promise<void> {
  world.tail = tail
  world.end = end
  for await (const chunk of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount })) void chunk
}

async function inspect($: Engine, args = ''): Promise<string> {
  const ran = await $.command.run({ command: 'inspect', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 40 } })

  return ran.text ?? ''
}

/** The first message: context with two rule files, then "Hello there". Its request ends at 10,000. */
async function firstMessage($: Engine, world: ReturnType<typeof engine>): Promise<void> {
  await $.prompt.compose(COMPOSE)
  await $.prompt.context(CONTEXT)
  await $.turn.start({ text: 'Hello there', turnId: 't' })
  await request($, world, [CONTEXT_BLOCK, 'Hello there'], 10_000, 1)
}

/** Where a rule's text sits in the first request, by arithmetic on the strings. */
function expectedRule(path: string, end = 10_000) {
  const [a, b] = spansOfFiles(CLAUDE_MD, FILES)
  const span = path === RULE_A ? a : b
  const text = CLAUDE_MD.slice(span?.offset, (span?.offset ?? 0) + (span?.chars ?? 0))
  const at = CONTEXT_BLOCK.lastIndexOf(text)
  const suffix = CONTEXT_BLOCK.length - at - text.length

  return rangeFromEnd(end, 'Hello there'.length, suffix, text.length)
}

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

  test('moves a piece by exactly what was deleted before it since its request', () => {
    const base = { isYours: true, attachment: null, parent: null, isEarlier: false, copyOf: null, message: 1, zone: 'conversation' as const, kind: 'rule' as const }
    const pieces: Piece[] = [
      { ...base, key: 'a', label: 'a', hash: 'a', step: 0, tokens: 40, removalTokens: 50, start: 100, end: 140 },
      { ...base, key: 'b', label: 'b', hash: 'b', step: 0, tokens: 10, removalTokens: 10, start: 200, end: 210 },
    ]
    const step = (id: number, gone: string[]): Step => ({ id, message: id + 1, index: 0, messageCount: 1, total: 1000, end: 998, isAnchor: true, tail: [], gone, model: 'm' })
    const { rows } = layout(pieces, [step(0, []), step(1, ['a'])], new Set(['a']))
    expect(rows.find(r => r.key === 'b')).toMatchObject({ start: 150, end: 160, isDeleted: false })
    expect(rows.find(r => r.key === 'a')).toMatchObject({ start: null, isDeleted: true, was: { start: 100, end: 140 } })
    const all = withFillers(rows, 1000, 80)
    expect(all.map(r => `${r.label}:${r.start}-${r.end}`)).toEqual(['tools + system prompt:0-80', 'conversation:80-150', 'b:150-160', 'conversation:160-1000', 'a:null-null'])
  })
})

describe('plugin', () => {
  const labels = (card: Card | undefined) => card?.options.map(o => o.label)
  const range = (r: { start: number; end: number }) => `${int(r.start)}–${int(r.end)}`

  test("places each CLAUDE.md file exactly, from the first request's end", async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    world.taps = ['Done']
    expect(await inspect($)).toBe('Prompt inspector closed.')
    const card = world.cards[0]
    expect(card?.question).toBe('Your rules & skills · last request 10,002 tokens · page 1/1. Tap one, or type a token position.')
    expect(labels(card)).toEqual([`CLAUDE.md · ${range(expectedRule(RULE_A))}`, `.claude/rules/tests.md · ${range(expectedRule(RULE_B))}`, 'Done'])
  })

  test('deletes a rule after confirming; the next request leaves it out, and the list says where it was', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    world.taps = ['.claude/rules/tests.md', '🗑 Delete', 'Yes, delete', 'Done']
    await inspect($)
    expect(world.cards.map(c => c.header)).toEqual(['Inspect', 'Piece', 'Confirm', 'Inspect'])
    const b = expectedRule(RULE_B)
    expect(world.cards[1]?.question).toStartWith(`.claude/rules/tests.md: ${int(b.start)} → ${int(b.end)} · ${int(b.end - b.start)} tok. `)
    expect(world.cards[3]?.question).toStartWith('Deleted .claude/rules/tests.md. ')
    expect(labels(world.cards[3])).toContain(`.claude/rules/tests.md · deleted, was ${range(b)}`)
    expect((await $.prompt.context(CONTEXT)).instructionFiles?.map(f => f.path)).toEqual([RULE_A])
  })

  test('a piece injected later is placed from the end of the request that first carries it', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    await $.turn.start({ text: 'Edit src/app.ts', turnId: 't2' })
    await $.prompt.attachment(NESTED)
    await $.prompt.attachment(TODO)
    await request($, world, ['Edit src/app.ts', NESTED_BLOCK, TODO_BLOCK], 20_000, 3)
    world.taps = ['src/CLAUDE.md', 'Back', 'Done']
    await inspect($)
    const end = 20_000 - TODO_BLOCK.length - '\n</system-reminder>'.length
    const nested = { start: end - NESTED.text.length, end }
    expect(labels(world.cards[0])).toContain(`src/CLAUDE.md · ${range(nested)}`)
    expect(world.cards[1]?.question).toStartWith(`src/CLAUDE.md: ${int(nested.start)} → ${int(nested.end)} · 42 tok · message 2. `)
  })

  test('🔄 moves a rule to ride with the next message, where it is placed exactly again', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    world.taps = ['CLAUDE.md', '🔄 Re-inject at end', 'Done']
    await inspect($)
    expect(world.cards[2]?.question).toStartWith('CLAUDE.md will ride with your next message. ')
    const submitted = await $.prompt.submit({ text: 'Again', wait: false, origin: { kind: 'composer' } })
    const riding = submitted.context?.[0] ?? ''
    expect(riding).toContain('Always answer in English.')
    expect((await $.prompt.context(CONTEXT)).instructionFiles?.map(f => f.path)).toEqual([RULE_B])

    await $.turn.start({ text: 'Again', turnId: 't2' })
    await $.prompt.attachment({ type: 'plugin_context', text: riding, origin: { kind: 'plugin', event: 'prompt.submit' } })
    await request($, world, ['Again', `<system-reminder>\n${riding}\n</system-reminder>`], 30_000, 3)
    world.taps = ['Done']
    await inspect($)
    const end = 30_000 - '\n</system-reminder>'.length
    expect(labels(world.cards[3])).toContain(`🔄 CLAUDE.md · ${range({ start: end - riding.length, end })}`)
  })

  test('/inspect all runs from token 0: tools + system prompt, the pieces, and the conversation between them', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    world.taps = ['More…', 'Done']
    await inspect($, 'all')
    const systemEnd = 10_000 - CONTEXT_BLOCK.length - 'Hello there'.length
    expect(world.cards[0]?.header).toBe('Inspect all')
    expect(labels(world.cards[0])).toEqual(['system: intro · in system prompt', 'system: memory · in system prompt', `▒ tools + system prompt · 0–${int(systemEnd)}`, 'More…'])
    const contextStart = 10_000 - 'Hello there'.length - CONTEXT_BLOCK.length + CONTEXT_BLOCK.lastIndexOf(CLAUDE_MD)
    expect(labels(world.cards[1])).toEqual([
      `▒ conversation · ${range({ start: systemEnd, end: contextStart })}`,
      `context: CLAUDE.md files · ${range({ start: contextStart, end: contextStart + CLAUDE_MD.length })}`,
      `CLAUDE.md · ${range(expectedRule(RULE_A))}`,
      'More…',
    ])
  })

  test('a typed token position opens the piece there; a filler cannot be deleted', async ($, on) => {
    const world = engine(on)
    await firstMessage($, world)
    const a = expectedRule(RULE_A)
    world.taps = [String(a.start + 3), 'Back', '5', 'Done']
    await inspect($, 'all')
    expect(world.cards[1]?.question).toStartWith('CLAUDE.md: ')
    expect(world.cards[3]?.question).toStartWith('The tools + system prompt (0 → ')
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

  test('marks what was in the conversation before the inspector started as not measured', async ($, on) => {
    const world = engine(on)
    world.history = [{ role: 'user', text: 'earlier prompt', toolUses: [] }]
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('command.list', () => ({ value: [] }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
    await $.prompt.attachment(NESTED)
    world.taps = ['src/CLAUDE.md', 'Back', 'Done']
    await inspect($)
    expect(labels(world.cards[0])).toContain('src/CLAUDE.md · not measured')
    expect(world.cards[1]?.question).toStartWith('src/CLAUDE.md: sent before the inspector started (not measured) · 42 tok. ')
  })

  test('a skill you made: its list line and its text when used; deleting it stops later uses', async ($, on) => {
    const world = engine(on)
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('command.list', () => ({ value: [{ name: 'commit', description: '', source: 'user' }] }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: true })
    await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
    await $.skill.prompt({ skill: 'commit', text: 'Write a conventional commit.' })
    await request($, world, [`<system-reminder>\n${LISTING}\n</system-reminder>`, 'Write a conventional commit.'], 5_000, 1)
    world.taps = ['skill: commit', '🗑 Delete', 'Yes, delete', 'Done']
    await inspect($)
    const card = labels(world.cards[0]) ?? []
    expect(card[0]).toStartWith('skill list: commit · ')
    expect(card.slice(1)).toEqual([`skill: commit · ${range({ start: 5_000 - 28, end: 5_000 })}`, 'Done'])
    expect(world.cards[3]?.question).toContain('Its text already sent stays; later uses are stopped.')
    expect((await $.skill.prompt({ skill: 'commit', text: 'Write a conventional commit.' })).text).toContain('deleted the commit skill')
  })
})
