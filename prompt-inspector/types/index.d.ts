/**
 * What an injected piece of the prompt is: a system-prompt section, a block
 * of the first message's context, an instruction file (CLAUDE.md, rules),
 * an engine reminder, the skill listing or one entry of it, a skill's body.
 */
export type SegmentKind = 'system' | 'context' | 'rule' | 'reminder' | 'listing' | 'skill'

/**
 * Where a segment sits in a request: the system prompt, the context the first
 * user message carries, or somewhere later in the conversation.
 */
export type SegmentZone = 'system' | 'context' | 'conversation'

/**
 * One piece of text the engine injected into the prompt, as first seen and
 * last seen. Its token range is computed from these at read time.
 */
export type Segment = {
  /** Stable id, what removal is keyed by (`sys:memory`, `rule:/x/CLAUDE.md`). */
  key: string
  kind: SegmentKind
  zone: SegmentZone
  /** Short name: a section id, a file path, a skill name. */
  label: string
  /** Where it came from: a scope, a tier, an attachment type, an origin. */
  detail: string
  /** The attachment type, for an engine attachment; null otherwise. */
  attachment: string | null
  /** The key of the segment this one lies inside (a rule inside `claudeMd`). */
  parent: string | null
  /** Characters into the parent's text where this one begins. */
  offsetChars: number
  /** Position inside its zone: list index, or arrival order in the conversation. */
  order: number
  /** Tokens of conversation ahead of it when it arrived; null when unknown. */
  anchor: number | null
  /** Subagent id when a subagent's request carried it; null on main. */
  agent: string | null
  chars: number
  /** Counted with the model's tokenizer by `/inspect count`; null = estimated. */
  exactTokens: number | null
  /** The main turn it was first injected in; 0 = before the first prompt. */
  turn: number
  firstSeenAt: number
  lastSeenAt: number
  hits: number
  /** In the latest render of its zone (system sections, context blocks). */
  isPresent: boolean
  preview: string
}

/** The last model request's input and output size, as the API reported it. */
export type LastRequest = { input: number; output: number; model: string }

/** Which rows the pane lists: all of them, or rules and skills only. */
export type Filter = 'all' | 'focus'

declare module 'claude-code' {
  interface PluginState {
    'prompt-inspector': {
      segments: Segment[]
      removed: string[]
      isLive: boolean
      turn: number
      anchors: Record<string, number>
      lastRequest: LastRequest | null
      toolsTokens: number | null
      charsPerToken: number
      filter: Filter
    }
  }
}
