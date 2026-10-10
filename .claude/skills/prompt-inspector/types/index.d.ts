/**
 * What an injected piece is: a rule file (CLAUDE.md, `.claude/rules`), a
 * skill's text when it is used, one line of the skill list, a system-prompt
 * section, a block of the first message's context, or another reminder.
 */
export type PieceKind = 'rule' | 'skill' | 'skill-line' | 'section' | 'context' | 'reminder'

/** Where a piece sits: in the system prompt, the first message's context, or later in the conversation. */
export type PieceZone = 'system' | 'context' | 'conversation'

/** Where a piece's text sits in one request: its exact tokens, and its place among the request's blocks. */
export type Position = {
  /** Exact tokens from the request's start. */
  start: number
  end: number
  /** Its own block's index among every block of the request, messages in order (`flatKeys`). */
  block: number
  /** Where its text starts in that block, in characters. */
  offset: number
  /** Its own block's text key (in `texts`). */
  key: string
  /** It is its whole block, as sent: Claude Code sends some reminders reworded, found by their opening. */
  isWholeBlock?: boolean
}

/** One injected piece of the prompt, and where it is. */
export type Piece = {
  /** This injection's id (`rule:/repo/CLAUDE.md`, `skill:commit@3`). */
  key: string
  /** What 🗑 and 🔄 act on: the key itself, or the one several share (a skill's uses, a copy's original). */
  group: string
  kind: PieceKind
  zone: PieceZone
  /** Yours: your rule files and the skills you made. */
  isYours: boolean
  label: string
  /** The attachment type, for an engine attachment; null otherwise. */
  attachment: string | null
  /** The key of the piece this one lies inside (a rule inside `claudeMd`, a line of the skill list). */
  parent: string | null
  /** Its text's key (in `texts`), what an exact count is cached by. */
  hash: string
  /** The message it arrived with (1 for the first message's context); 0 for the system prompt. */
  message: number
  /** The request `at` is in, or the request that first carried it; null while it waits for one. */
  step: number | null
  /** It was in the conversation before the inspector started. */
  isEarlier: boolean
  /** Exact tokens of its text. */
  tokens: number | null
  /** Where it is in request `step`; null until measured, or once it can't be proven. */
  at: Position | null
  /** Where it was in the last request that carried it, once taken out. */
  was: { start: number; end: number } | null
  /** Why its position is not known; null when measured or not measured yet. */
  lost: string | null
  /** For a copy riding with a later message (🔄): the group of the piece it copies. */
  copyOf: string | null
}

/** One block that differs between a request and the one before it. */
export type BlockChange = {
  /** Index in the request before: of the block changed or taken out, or of the block an inserted one precedes. */
  at: number
  /** Its text key before and after; null for a block inserted (before) or taken out (after). */
  before: string | null
  after: string | null
}

/** The system prompt as one request carries it: its two sides' texts (keys) and its tools. */
export type SystemSnapshot = { sides: readonly string[]; tools: string }

/** How a request differs from the one before it, before the point it was appended to. */
export type Change =
  | { kind: 'unknown' }
  | {
      kind: 'known'
      blocks: readonly BlockChange[]
      /** The first block of the request before whose change can't be counted (not text, a message boundary). */
      brokenAt: number | null
      /** The system prompt: the same, its tools changed, or its text changed (side keys before and after). */
      system: 'same' | 'tools' | { before: readonly string[]; after: readonly string[] }
    }

/** One model request of the main conversation, as the API reported it. */
export type Step = {
  id: number
  /** The message (turn) it belongs to. */
  message: number
  index: number
  /** How many messages it carried: 1 for the conversation's first request. */
  messageCount: number
  /** input + cache read + cache write: the request's exact size in tokens. */
  total: number
  /** cache read + cache write: where its last block ends, when only the closing tokens followed (see `uncached`). */
  end: number
  /** Tokens read from the cache: everything before this point is the same as in the request before. */
  cacheRead: number
  /** Tokens left uncached (`input_tokens`): the closing count alone when `end` is the last block's end. */
  uncached: number
  /** A candidate anchor: few tokens uncached and no server tool ran. */
  isAnchor: boolean
  /** How many blocks it had, every message's. */
  blocks: number
  /** The text keys of its last message's blocks, in order; `-` for a block that is not text. */
  tail: string[]
  /** How it differs from the request before. */
  change: Change
  model: string
}

/** A piece moved by 🔄: waiting for the next message, or sent with one. */
export type Move = 'queued' | 'sent'

declare module 'claude-code' {
  interface PluginState {
    'prompt-inspector': {
      injections: Piece[]
      requests: Step[]
      /** Texts by key: each piece's, blocks of requests, and the system prompt's sides. */
      texts: Record<string, string>
      removed: string[]
      moved: Record<string, Move>
      /** The text a moved piece rides with, by its group. */
      saved: Record<string, string>
      message: number
      /** Where the first message begins (the end of tools + system prompt), in request `step`. */
      promptStart: { at: number; step: number } | null
      isCatchingUp: boolean
      /** Names of the skills the person made (source `user`). */
      userSkills: string[]
      /** The system prompt as the last render composed it. */
      system: SystemSnapshot | null
    }
  }
}
