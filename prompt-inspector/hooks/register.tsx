import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptAttachmentOrigin, Register } from 'claude-code'

import type { Segment } from '../types'
import {
  DEFAULT_CHARS_PER_TOKEN,
  cutSpans,
  estimate,
  filterListing,
  fmt,
  isFocus,
  keys,
  kindOfAttachment,
  labelOfAttachment,
  layout,
  merge,
  parseListing,
  preview,
  rangeOf,
  row,
  spansOfFiles,
} from './model'
import type { Placed, Span } from './model'

type Engine = EngineInterface

const PANE = 'prompt-inspector'
const TAG = 'inspector ·'

const segmentsAtom = atom({ plugin: 'prompt-inspector', key: 'segments' } as const, [])
const removedAtom = atom({ plugin: 'prompt-inspector', key: 'removed' } as const, [])
const liveAtom = atom({ plugin: 'prompt-inspector', key: 'isLive' } as const, false)
const turnAtom = atom({ plugin: 'prompt-inspector', key: 'turn' } as const, 0)
const anchorsAtom = atom({ plugin: 'prompt-inspector', key: 'anchors' } as const, {})
const lastRequestAtom = atom({ plugin: 'prompt-inspector', key: 'lastRequest' } as const, null)
const toolsAtom = atom({ plugin: 'prompt-inspector', key: 'toolsTokens' } as const, null)
const cptAtom = atom({ plugin: 'prompt-inspector', key: 'charsPerToken' } as const, DEFAULT_CHARS_PER_TOKEN)
const filterAtom = atom({ plugin: 'prompt-inspector', key: 'filter' } as const, 'all')

/** Each segment's full text, by key: what `show` prints and `count` measures. */
const texts = new Map<string, string>()

type Stamp = { turn: number; at: number }

type Fields = Pick<Segment, 'key' | 'kind' | 'zone' | 'label' | 'detail'> & Partial<Segment>

function make(fields: Fields, text: string, stamp: Stamp): Segment {
  texts.set(fields.key, text)

  return {
    attachment: null,
    parent: null,
    offsetChars: 0,
    order: 0,
    anchor: null,
    agent: null,
    exactTokens: null,
    hits: 1,
    isPresent: true,
    ...fields,
    chars: text.length,
    turn: stamp.turn,
    firstSeenAt: stamp.at,
    lastSeenAt: stamp.at,
    preview: preview(text),
  }
}

async function stamp($: Engine): Promise<Stamp> {
  return { turn: await read($, turnAtom), at: await $.clock.now() }
}

async function placed($: Engine): Promise<Placed[]> {
  return layout(await read($, segmentsAtom), await read($, removedAtom), await read($, cptAtom), await read($, toolsAtom))
}

function originOf(origin: PromptAttachmentOrigin, type: string): string {
  if (origin.kind === 'hook') return `${type}, from a ${origin.event} hook`
  if (origin.kind === 'plugin') return `${type}, from a plugin's ${origin.event}`

  return type
}

function line(p: Placed, sign: string): string {
  const tok = `${p.exactTokens === null ? '≈' : ''}${fmt(p.tokens)} tok`
  const where = p.agent === null ? `turn ${p.turn}` : `turn ${p.turn}, subagent ${p.agent}`

  return `${TAG} ${sign}${p.kind} ${p.label} · ${rangeOf(p)} (${tok}) · ${where} · #${p.n}`
}

/** Records what a render saw; while the mode is on, says what is new in the transcript. */
async function record(
  $: Engine,
  seen: Segment[],
  options: { zone?: Segment['zone']; isRepeatNews?: boolean } = {},
): Promise<void> {
  let added: Segment[] = []
  let changed: Segment[] = []
  await update($, segmentsAtom, list => {
    const merged = merge(list, seen, { zone: options.zone })
    added = merged.added
    changed = merged.changed

    return merged.list
  })
  const isRepeat = options.isRepeatNews === true && added.length === 0 && changed.length === 0
  const news = isRepeat ? seen.slice(0, 1) : []
  if (added.length + changed.length + news.length === 0) return
  await refreshStatus($)
  if (!(await read($, liveAtom))) return

  const rows = new Map((await placed($)).map(p => [p.key, p]))
  const isBulk = (s: Segment) => s.kind === 'system' || (s.kind === 'context' && s.key !== keys.context('claudeMd'))
  const bulk = added.filter(isBulk)
  if (bulk.length > 0) {
    const tokens = bulk.reduce((sum, s) => sum + (rows.get(s.key)?.tokens ?? 0), 0)
    const names = bulk.map(s => s.label).join(', ')
    $.ui.log(`${TAG} +${bulk.length} ${bulk[0]?.kind} section(s), ≈${fmt(tokens)} tok: ${names}`)
  }
  for (const s of [...added.filter(s => !isBulk(s)), ...news]) {
    const p = rows.get(s.key)
    if (p !== undefined) $.ui.log(line(p, '+'))
  }
  for (const s of changed) {
    const p = rows.get(s.key)
    if (p !== undefined) $.ui.log(line(p, '~'))
  }
}

async function refreshStatus($: Engine): Promise<void> {
  const removed = await read($, removedAtom)
  const isLive = await read($, liveAtom)
  if (!isLive && removed.length === 0) {
    $.ui.status(undefined)

    return
  }
  const count = (await read($, segmentsAtom)).length
  $.ui.status(`inspector${isLive ? '' : ' (quiet)'}: ${count} injected · ${removed.length} removed`)
}

/** The tool schemas' share of the window, from the engine's own /context estimate. */
async function refreshTools($: Engine): Promise<void> {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const categories = usage.context.breakdown?.categories ?? []
    const tools = categories
      .filter(c => c.kind === 'used' && /tool/i.test(c.name))
      .reduce((sum, c) => sum + c.tokens, 0)
    await update($, toolsAtom, () => tools)
  } catch {
    // No session bound yet: the layout starts at 0 until the next try.
  }
}

/** Takes the keys out of the prompt, or puts them back, from the next request on. */
async function setRemoved($: Engine, targets: readonly string[], isRemoving: boolean): Promise<void> {
  await update($, removedAtom, list =>
    isRemoving ? [...new Set([...list, ...targets])] : list.filter(k => !targets.includes(k)),
  )
  // Context blocks and attachments are cached answers: ask for them again.
  $.ui.invalidate('prompt.context')
  $.ui.invalidate('prompt.attachment')
  await refreshStatus($)
  const verb = isRemoving ? 'removed' : 'restored'
  const isSkill = targets.some(k => k.startsWith('skill:'))
  const note = isSkill ? ' A skill body already in the conversation stays; its next invocation follows this.' : ''
  $.ui.log(`${TAG} ${verb} ${targets.join(', ')} from the next request on.${note}`)
}

async function toggle($: Engine, key: string): Promise<void> {
  const isRemoved = (await read($, removedAtom)).includes(key)
  await setRemoved($, [key], !isRemoved)
}

/** `3`, `3,7`, `sys:memory`, `type:todo_reminder`, a label or the end of a path. */
async function resolve($: Engine, target: string): Promise<string[]> {
  const rows = await placed($)
  const found = new Set<string>()
  for (const part of target.split(/[\s,]+/).filter(Boolean)) {
    if (/^\d+$/.test(part)) {
      const p = rows.find(r => r.n === Number(part))
      if (p !== undefined) found.add(p.key)
      continue
    }
    if (part.startsWith('type:')) {
      found.add(part)
      continue
    }
    const exact = rows.find(r => r.key === part)
    if (exact !== undefined) {
      found.add(exact.key)
      continue
    }
    for (const r of rows.filter(r => r.label === part || r.label.endsWith(`/${part}`))) found.add(r.key)
  }

  return [...found]
}

function chunks(lines: readonly string[], size = 1900): string[] {
  const out: string[] = []
  let current = ''
  for (const one of lines) {
    if (current.length > 0 && current.length + one.length + 1 > size) {
      out.push(current)
      current = ''
    }
    current = current.length === 0 ? one : `${current}\n${one}`
  }
  if (current.length > 0) out.push(current)

  return out
}

async function summary($: Engine): Promise<string> {
  const rows = await placed($)
  const sent = rows.filter(p => p.parent === null && p.start !== null).reduce((sum, p) => sum + p.tokens, 0)
  const last = await read($, lastRequestAtom)
  const removed = (await read($, removedAtom)).length
  const cpt = await read($, cptAtom)
  const tools = await read($, toolsAtom)
  const lastText = last === null ? 'no request yet' : `last request ${fmt(last.input)} tok in`

  return `≈${fmt(sent)} tok mapped · tools ≈${tools === null ? '?' : fmt(tools)} · ${lastText} · ${removed} removed · ${cpt} chars/tok`
}

async function logList($: Engine, filter: 'all' | 'focus'): Promise<void> {
  const rows = (await placed($)).filter(p => filter === 'all' || isFocus(p))
  const head = `${TAG} ${await summary($)}`
  const columns = '    #  range         tokens kind     when    name'
  const body = rows.length === 0 ? ['(nothing injected yet: send a prompt first)'] : rows.map(p => row(p, 120))
  for (const text of chunks([head, columns, ...body])) $.ui.log(text)
}

async function show($: Engine, target: string): Promise<void> {
  const targets = await resolve($, target)
  if (targets.length === 0) {
    $.ui.log(`${TAG} nothing matches "${target}". /inspect list numbers the rows.`)

    return
  }
  for (const key of targets.slice(0, 3)) {
    const text = texts.get(key)
    if (text === undefined) {
      $.ui.log(`${TAG} ${key}: its text was not captured since the mod reloaded; it is on the next request.`)
      continue
    }
    const lines = [`${TAG} ${key} (${text.length} chars):`, ...text.slice(0, 18000).split('\n')]
    for (const piece of chunks(lines)) $.ui.log(piece)
  }
}

/**
 * Counts each captured segment with the session model's tokenizer: one
 * one-token completion per segment, less a baseline. It spends input tokens,
 * so it runs only when asked; it also calibrates the estimate for the rest.
 */
async function countExact($: Engine): Promise<void> {
  const todo = (await read($, segmentsAtom)).filter(s => s.exactTokens === null && texts.has(s.key))
  if (todo.length === 0) {
    $.ui.log(`${TAG} nothing left to count.`)

    return
  }
  const model = (await read($, lastRequestAtom))?.model ?? (await $.session.model())
  const measure = async (prompt: string): Promise<number> => {
    try {
      const result = await $.model.complete({ model, prompt, maxTokens: 1 })

      return result.usage.input_tokens
    } catch {
      return 0
    }
  }
  const baseline = await measure('.')
  if (baseline <= 0) {
    $.ui.log(`${TAG} counting failed: ${model} did not answer a one-token request.`)

    return
  }
  const cpt = await read($, cptAtom)
  const total = todo.reduce((sum, s) => sum + s.chars, 0)
  $.ui.log(`${TAG} counting ${todo.length} segments with ${model} (≈${fmt(estimate(total, cpt))} input tokens)…`)
  const counted = new Map<string, number>()
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async s => {
        const n = await measure(texts.get(s.key) ?? '')
        if (n > 0) counted.set(s.key, Math.max(1, n - baseline + 1))
      }),
    )
  }
  await update($, segmentsAtom, list =>
    list.map(s => {
      const n = counted.get(s.key)

      return n === undefined ? s : { ...s, exactTokens: n }
    }),
  )
  const exact = (await read($, segmentsAtom)).filter(s => s.parent === null && s.exactTokens !== null && s.chars > 0)
  const tokens = exact.reduce((sum, s) => sum + (s.exactTokens ?? 0), 0)
  if (tokens > 0) {
    const calibrated = Math.round((exact.reduce((sum, s) => sum + s.chars, 0) / tokens) * 100) / 100
    await update($, cptAtom, () => calibrated)
  }
  $.ui.log(`${TAG} counted ${counted.size} of ${todo.length}; estimates now use ${await read($, cptAtom)} chars/tok.`)
}

async function openPane($: Engine): Promise<void> {
  const opened = await $.ui.open({ id: PANE, title: 'Prompt inspector' })
  if (!opened.isPlaced) $.ui.toast('The inspector pane is waiting for room; /inspect list prints the same rows.')
}

const HELP = [
  `${TAG} /inspect            open the pane and turn the mode on (each injection is logged here)`,
  '  /inspect on | off     log injections in the transcript, or stop (removals stay)',
  '  /inspect list [focus] print every segment: # · token range · tokens · kind · turn · name',
  '  /inspect show 12      print what segment 12 injected, in full',
  '  /inspect rm 12        take it out of the prompt from the next request on (also: rm 3,7 · rm sys:memory',
  '                        · rm type:todo_reminder · rm CLAUDE.md)',
  '  /inspect restore 12   put it back · /inspect restore all (or /inspect reset)',
  '  /inspect count        count tokens exactly with the session model (spends input tokens)',
  'Rows: ✓ sent / ✗ removed; "≈" marks an estimate; t0 is before the first prompt.',
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'inspect',
      description: 'Prompt inspector: which rules and skills are injected, at which token range; remove them to test',
      argumentHint: '[on|off|list|show N|rm N|restore N|count|help]',
      immediate: true,
    })
    await refreshStatus($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, turnAtom, n => n + 1)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (usage !== null) {
      const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      await update($, anchorsAtom, anchors => ({ ...anchors, [e.agentId ?? 'main']: input + usage.output_tokens }))
      if (e.agentId === undefined) {
        await update($, lastRequestAtom, () => ({ input, output: usage.output_tokens, model: usage.model }))
      }
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (await read($, liveAtom)) await refreshTools($)

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      texts.clear()
      await update($, segmentsAtom, () => [])
      await update($, anchorsAtom, () => ({}))
      await update($, turnAtom, () => 0)
    }

    return next(e)
  })

  // The system prompt, section by section.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.traits.includes('analysis')) {
      const at = await stamp($)
      const seen = result.sections.map((s, i) =>
        make({ key: keys.system(s.id), kind: 'system', zone: 'system', label: s.id, detail: s.scope, order: i }, s.text, at),
      )
      await record($, seen, { zone: 'system' })
    }
    const removed = new Set(await read($, removedAtom))
    const kept = result.sections.filter(s => !removed.has(keys.system(s.id)))

    return kept.length === result.sections.length ? result : { sections: kept }
  })

  // The first message's context: `claudeMd` and each instruction file in it.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const files = result.instructionFiles ?? e.instructionFiles ?? []
    const memory = result.blocks.find(b => b.name === 'claudeMd')
    const spans = memory === undefined ? [] : spansOfFiles(memory.text, files)
    const at = await stamp($)
    const seen: Segment[] = []
    result.blocks.forEach((block, i) => {
      const isMemory = block === memory
      const detail = isMemory ? `${files.length} instruction file(s)` : 'context block'
      seen.push(make({ key: keys.context(block.name), kind: 'context', zone: 'context', label: block.name, detail, order: i }, block.text, at))
      if (!isMemory) return
      files.forEach((file, j) => {
        const span = spans[j] ?? null
        const text = span === null ? file.content : block.text.slice(span.offset, span.offset + span.chars)
        const tier = file.parent === undefined ? file.kind : `${file.kind}, imported by ${file.parent}`
        const fields: Fields = {
          key: keys.rule(file.path),
          kind: 'rule',
          zone: 'context',
          label: file.path,
          detail: tier,
          parent: keys.context('claudeMd'),
          offsetChars: span?.offset ?? block.text.length,
          order: j,
        }
        seen.push(make(fields, text, at))
      })
    })
    await record($, seen, { zone: 'context' })

    const removed = new Set(await read($, removedAtom))
    const blocks = result.blocks.filter(b => !removed.has(keys.context(b.name)))
    if (result.instructionFiles !== undefined) {
      const kept = files.filter(f => !removed.has(keys.rule(f.path)))
      if (blocks.length === result.blocks.length && kept.length === files.length) return result

      // The engine renders `claudeMd` again from the changed list.
      return { blocks, instructionFiles: kept }
    }
    // The list is unknown (a hook beneath rewrote the text): cut each removed
    // file's text where it is found, as this render or an earlier one saw it.
    const spanOf = (key: string): Span | null => {
      const j = files.findIndex(f => keys.rule(f.path) === key)
      if (j >= 0) return spans[j] ?? null
      const text = texts.get(key)
      const at = text === undefined || memory === undefined ? -1 : memory.text.indexOf(text)

      return text === undefined || at < 0 ? null : { name: key, offset: at, chars: text.length }
    }
    const drop = [...removed].filter(k => k.startsWith('rule:')).map(spanOf)
    if (blocks.length === result.blocks.length && drop.every(span => span === null)) return result

    return { blocks: blocks.map(b => (b === memory ? { ...b, text: cutSpans(b.text, drop) } : b)) }
  })

  // Everything injected later: nested CLAUDE.md, path rules, reminders, the skill listing.
  on('prompt.attachment', async ($, e, next) => {
    const result = await next(e)
    if (result.text === null) return result
    const key = keys.attachment(e.type, e.text)
    const at = await stamp($)
    const agent = e.agentId ?? null
    const anchor = (await read($, anchorsAtom))[agent ?? 'main'] ?? null
    const common = { zone: 'conversation', agent, anchor, order: at.at } as const
    const fields: Fields = {
      ...common,
      key,
      kind: kindOfAttachment(e.type),
      label: labelOfAttachment(e.type, result.text),
      detail: originOf(e.origin, e.type),
      attachment: e.type,
    }
    const seen = [make(fields, result.text, at)]
    const entries = e.type === 'skill_listing' ? parseListing(result.text) : []
    for (const span of entries) {
      const entry: Fields = {
        ...common,
        key: keys.listing(span.name),
        kind: 'listing',
        label: span.name,
        detail: 'skill listing entry',
        parent: key,
        offsetChars: span.offset,
      }
      seen.push(make(entry, result.text.slice(span.offset, span.offset + span.chars), at))
    }
    await record($, seen)

    const removed = new Set(await read($, removedAtom))
    if (removed.has(key) || removed.has(keys.attachmentType(e.type))) return { text: null }
    const drop = new Set(entries.filter(span => removed.has(keys.listing(span.name))).map(span => span.name))

    return drop.size === 0 ? result : { text: filterListing(result.text, drop) }
  })

  // A skill's body, each time it is expanded for the model.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    const at = await stamp($)
    const anchor = (await read($, anchorsAtom)).main ?? null
    const fields: Fields = {
      key: keys.skill(e.skill),
      kind: 'skill',
      zone: 'conversation',
      label: e.skill,
      detail: 'skill body',
      anchor,
      order: at.at,
    }
    await record($, [make(fields, result.text, at)], { isRepeatNews: true })
    const removed = await read($, removedAtom)

    return removed.includes(keys.skill(e.skill))
      ? { text: `(prompt-inspector removed the ${e.skill} skill's instructions for this test.)` }
      : result
  })

  on('command.run', { command: 'inspect' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const target = rest.join(' ')
    switch (verb) {
      case '':
        await update($, liveAtom, () => true)
        await refreshTools($)
        await openPane($)
        $.ui.log(`${TAG} on. ${await summary($)}`)
        break
      case 'on':
      case 'off':
        await update($, liveAtom, () => verb === 'on')
        $.ui.log(`${TAG} logging ${verb}.`)
        break
      case 'list':
        await refreshTools($)
        await logList($, target === 'focus' ? 'focus' : 'all')
        break
      case 'show':
        await show($, target)
        break
      case 'rm':
      case 'remove':
      case 'restore': {
        const isRemoving = verb !== 'restore'
        const targets = target === 'all' && !isRemoving ? await read($, removedAtom) : await resolve($, target)
        if (targets.length === 0) $.ui.log(`${TAG} nothing matches "${target}". /inspect list numbers the rows.`)
        else await setRemoved($, targets, isRemoving)
        break
      }
      case 'reset':
        await setRemoved($, await read($, removedAtom), false)
        break
      case 'count':
        await countExact($)
        break
      default:
        for (const text of chunks(HELP)) $.ui.log(text)
    }
    await refreshStatus($)

    // No text: the inspector's own output stays out of what the model reads.
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const all = await placed($)
    const filter = await read($, filterAtom)
    const isLive = await read($, liveAtom)
    const removed = await read($, removedAtom)
    const rows = filter === 'all' ? all : all.filter(isFocus)
    const width = e.props.bodyColumns
    const colorOf = (p: Placed) =>
      p.kind === 'rule' ? 'suggestion' : p.kind === 'skill' ? 'claude' : p.kind === 'listing' ? 'permission' : undefined

    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          {await summary($)}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Button
            key="live"
            hotkey="l"
            label={isLive ? 'Logging on' : 'Logging off'}
            onPress={async () => {
              await update($, liveAtom, isOn => !isOn)
              await refreshStatus($)
            }}
          />
          <Button
            key="filter"
            hotkey="f"
            label={filter === 'all' ? 'Showing all' : 'Showing rules + skills'}
            onPress={() => update($, filterAtom, f => (f === 'all' ? 'focus' : 'all'))}
          />
          <Button key="count" hotkey="c" label="Count exact" onPress={() => countExact($)} />
          {removed.length > 0 && (
            <Button key="restore" hotkey="r" label={`Restore ${removed.length}`} onPress={() => setRemoved($, removed, false)} />
          )}
        </Box>
        <Text dimColor wrap="truncate-end">
          {'    #  range         tokens kind     when    name'}
        </Text>
        {rows.length === 0 && <Text dimColor>Nothing injected yet: send a prompt and the rows appear here.</Text>}
        {rows.map(p => (
          <Button key={p.key} plain onPress={() => toggle($, p.key)}>
            <Text
              color={p.isRemoved ? undefined : colorOf(p)}
              dimColor={p.isRemoved || p.start === null}
              strikethrough={p.isRemoved}
              wrap="truncate-end"
            >
              {row(p, width)}
            </Text>
          </Button>
        ))}
        <Text dimColor wrap="wrap">
          Press a row to remove or restore it from the next request on. /inspect show N prints a row in full.
        </Text>
      </Box>
    )
  })
}
