/**
 * What an injected piece is: a rule file (CLAUDE.md, `.claude/rules`), a
 * skill's text when it is used, one line of the skill list, a system-prompt
 * section, a block of the first message's context, or another reminder.
 */
export type PieceKind = 'rule' | 'skill' | 'skill-line' | 'section' | 'context' | 'reminder'

/** Where a piece sits: in the system prompt, the first message's context, or later in the conversation. */
export type PieceZone = 'system' | 'context' | 'conversation'

/** One injected piece of the prompt, and where it was measured. */
export type Piece = {
  /** Stable id, what deletion is keyed by (`rule:/repo/CLAUDE.md`, `listing:commit`). */
  key: string
  kind: PieceKind
  zone: PieceZone
  /** Yours: your rule files and the skills you made. */
  isYours: boolean
  label: string
  /** The attachment type, for an engine attachment; null otherwise. */
  attachment: string | null
  /** The key of the piece this one lies inside (a rule inside `claudeMd`, a line of the skill list). */
  parent: string | null
  /** Hash of its text as injected: where the text is kept, and what an exact count is cached by. */
  hash: string
  /** The message it arrived with; 0 = with the session's start. */
  message: number
  /** The request that first carried it, where its range is measured; null while it waits for one. */
  step: number | null
  /** It was in the conversation before the inspector started: never measured. */
  isEarlier: boolean
  /** Exact tokens of its text. */
  tokens: number | null
  /** Exact tokens taken out of the request when it is deleted (its whole block, framing included). */
  removalTokens: number | null
  /** Exact range in request `step`. */
  start: number | null
  end: number | null
  /** For a piece re-injected with a later message: the key of the piece it re-injects. */
  copyOf: string | null
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
  /** cache read + cache write: where the request's last block ends, exactly. */
  end: number
  /** True when only the few closing tokens are uncached, so `end` is the last block's end. */
  isAnchor: boolean
  /** The hashes of its last message's blocks, in order; `-` for a block that is not text. */
  tail: string[]
  /** Keys taken out of the prompt when it was sent. */
  gone: string[]
  model: string
}

/** A piece moved by 🔄: waiting for the next message, or sent with one. */
export type Move = 'queued' | 'sent'

declare module 'claude-code' {
  interface PluginState {
    'prompt-inspector': {
      pieces: Piece[]
      steps: Step[]
      /** Texts by hash: each piece's, and each block of a request's last message. */
      texts: Record<string, string>
      removed: string[]
      moved: Record<string, Move>
      /** The text a moved piece rides with, by its key. */
      saved: Record<string, string>
      message: number
      /** Exact token where the first message's content begins: the end of tools + system prompt. */
      systemEnd: number | null
      isCatchingUp: boolean
      /** Names of the skills the person made (source `user`). */
      userSkills: string[]
    }
  }
}
