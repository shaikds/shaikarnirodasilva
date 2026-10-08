import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { cutSpans, filterListing, parseListing, spansOfFiles } from '../hooks/model'


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

const CONTEXT = {
  blocks: [
    { name: 'claudeMd', text: CLAUDE_MD },
    { name: 'currentDate', text: "Today's date is 2026-10-08." },
  ],
  instructionFiles: FILES,
} as const

const LISTING = [
  'The following skills are available:',
  '- commit: Writes the commit message.',
  '- anthropic-skills:docs: docs (editable docs people share)',
  '  more about docs',
  '- review (project): Reviews the diff.',
].join('\n')

/** The engine beneath the plugin: each prompt event answered as core would; the log kept. */
function engine(on: On): string[] {
  const logs: string[] = []
  mock.clock(on)
  on('ui.log', ($, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('prompt.compose', () => ({
    sections: [
      { id: 'intro', text: 'You are Claude Code.', scope: 'shared' },
      { id: 'memory', text: 'Remember: be terse.', scope: 'session' },
    ],
  }))
  on('prompt.context', ($, e) => ({ blocks: e.blocks, instructionFiles: e.instructionFiles }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('prompt.attachment', ($, e) => ({ text: e.text }))
  on('skill.prompt', ($, e) => ({ text: e.text }))

  return logs
}

function inspect($: Engine, args: string) {
  return $.command.run({
    command: 'inspect',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
}

describe('model', () => {
  test('cuts a span and the line breaks after it', () => {
    expect(cutSpans('a\n\nbb\n\nc', [{ name: 'b', offset: 3, chars: 2 }])).toBe('a\n\nc')
  })

  test('parses a skill listing, names with colons and continuation lines included', () => {
    expect(parseListing(LISTING).map(s => s.name)).toEqual(['commit', 'anthropic-skills:docs', 'review'])
    const kept = filterListing(LISTING, new Set(['anthropic-skills:docs']))
    expect(kept).not.toContain('docs')
    expect(kept).toContain('- commit:')
    expect(kept).toContain('- review (project):')
  })

  test('finds each instruction file inside claudeMd, header line included', () => {
    const [a, b] = spansOfFiles(CLAUDE_MD, FILES)
    expect(CLAUDE_MD.slice(a?.offset, (a?.offset ?? 0) + (a?.chars ?? 0))).toStartWith(`Contents of ${RULE_A}`)
    expect(CLAUDE_MD.slice(b?.offset, (b?.offset ?? 0) + (b?.chars ?? 0))).toEndWith('every commit.')
  })
})

describe('plugin', () => {
  test('lists system sections with token ranges and drops a removed one', async ($, on) => {
    const logs = engine(on)
    expect((await $.prompt.compose(COMPOSE)).sections).toHaveLength(2)

    await inspect($, 'list')
    const listed = logs.join('\n')
    expect(listed).toMatch(/✓\s+1 0–5\s+≈5 system\s+t0\s+intro/)
    expect(listed).toMatch(/✓\s+2 5–10\s+≈5 system\s+t0\s+memory/)

    await inspect($, 'rm sys:memory')
    expect((await $.prompt.compose(COMPOSE)).sections.map(s => s.id)).toEqual(['intro'])

    await inspect($, 'restore all')
    expect((await $.prompt.compose(COMPOSE)).sections).toHaveLength(2)
  })

  test('lists each CLAUDE.md file inside claudeMd and removes one file by name', async ($, on) => {
    const logs = engine(on)
    await $.prompt.compose(COMPOSE)
    await $.prompt.context(CONTEXT)
    await inspect($, 'list focus')
    const listed = logs.join('\n')
    expect(listed).toContain(`└ ${RULE_A}`)
    expect(listed).toContain(`└ ${RULE_B}`)

    await inspect($, 'rm tests.md')
    const out = await $.prompt.context(CONTEXT)
    expect(out.instructionFiles?.map(f => f.path)).toEqual([RULE_A])
    expect(out.blocks.map(b => b.name)).toEqual(['claudeMd', 'currentDate'])

    // With the list unknown (a hook beneath rewrote the text), the file's text is cut instead.
    const unlisted = await $.prompt.context({ blocks: CONTEXT.blocks })
    expect(unlisted.blocks[0]?.text).toContain('Always answer in English.')
    expect(unlisted.blocks[0]?.text).not.toContain('Run the tests')
    expect(unlisted.blocks[0]?.text).not.toContain(RULE_B)

    await inspect($, 'rm ctx:claudeMd')
    const none = await $.prompt.context(CONTEXT)
    expect(none.blocks.map(b => b.name)).toEqual(['currentDate'])
  })

  test('removes reminders by type and single entries of the skill listing', async ($, on) => {
    engine(on)
    const todo = { type: 'todo_reminder', text: 'Use the todo list.', origin: { kind: 'engine' } } as const
    expect((await $.prompt.attachment(todo)).text).toBe('Use the todo list.')
    await inspect($, 'rm type:todo_reminder')
    expect((await $.prompt.attachment(todo)).text).toBeNull()

    const listing = { type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } } as const
    await $.prompt.attachment(listing)
    await inspect($, 'rm listing:commit')
    const out = await $.prompt.attachment(listing)
    expect(out.text).not.toContain('- commit:')
    expect(out.text).toContain('- review (project):')
  })

  test('logs each skill invocation while on, and stubs the skill once removed', async ($, on) => {
    const logs = engine(on)
    await inspect($, 'on')
    const skill = { skill: 'commit', text: 'Write a conventional commit.' }
    expect((await $.skill.prompt(skill)).text).toBe(skill.text)
    await inspect($, 'rm skill:commit')
    expect((await $.skill.prompt(skill)).text).toContain('removed the commit skill')
    expect(logs.filter(line => line.includes('+skill commit'))).toHaveLength(2)
  })

  test('the pane lists the rows and a press removes one, on every surface', async ($, on) => {
    engine(on)
    await $.prompt.compose(COMPOSE)
    for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: 'prompt-inspector',
        surface,
        component: 'Pane',
        requestId: 'prompt-inspector',
        props: {
          title: 'Prompt inspector',
          isFocused: true,
          bodyColumns: 100,
          placement: 'dock',
          scroll: { offset: 0, bodyRows: 30 },
          view: {},
        },
      })
      expect((await ui.find({ key: 'sys:memory' }))?.text).toContain('memory')
      await ui.press({ key: 'sys:memory' })
      expect((await $.prompt.compose(COMPOSE)).sections.map(s => s.id)).toEqual(['intro'])
      await ui.press({ key: 'sys:memory' })
      expect((await $.prompt.compose(COMPOSE)).sections).toHaveLength(2)
      await ui.unmount()
    }
  })
})
