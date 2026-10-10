# prompt-inspector

A Claude Code mod for testing rules. It shows where each of your rules and skills sits in the prompt
Claude receives, from token 0 to the last token, and lets you delete a piece or re-inject it at the
end of the context. Then you can send the same message again and compare the answers.

## Use

| Command | What it shows |
|---|---|
| `/inspect` | Your pieces: your `CLAUDE.md` files, `.claude/rules` files, CLAUDE.md files picked up later from subfolders, and the skills you made (their line in the skill list, and their text when used). |
| `/inspect all` | Every injected piece, Claude Code's own included, plus unnamed lines for what lies between them (tools + system prompt, the conversation), so the ranges run without gaps from 0 to the last token. |

Both open a card, on any device including the phone:

1. The list: three pieces per card, each with its exact range (`CLAUDE.md · 76,489–77,102`), then
   **More…** or **Done**. You can also type a token position to open the piece there.
2. Tap a piece: **🗑 Delete** (asks to confirm), **🔄 Re-inject at end**, or **Back**.
   - 🗑 takes the piece out of the prompt from your next message on. The list keeps it as
     `deleted, was 76,489–77,102`.
   - 🔄 takes the piece out of its place and sends it with your next message, at the end of the
     context, where it gets a new exact range.

Claude reads only the command's closing line, `Prompt inspector closed.`; the cards stay out of its
context.

## How the numbers are exact

- The API reports each request's size exactly. Where its cached part ends (`cache read + cache
  write`) is exactly where its last block of text ends.
- A piece is placed backwards from that point: everything after it in the request is counted
  exactly, then the piece itself.
- Counting uses the API, because Claude's tokenizer is not public. Each distinct text is counted
  once and the count is kept, so it costs about the text's own size in input tokens once.
- What cannot be measured exactly says so (`not measured`, `in system prompt`) instead of showing a
  guess: the system prompt's sections sit inside the tools + system prompt block, whose split the
  API does not report.
- Exact positions need the inspector running from a session's first message. In this repository it
  turns on by itself in every session; see below.

## How it turns on

- **Cloud sessions** (web and phone): Claude Code loads a plugin under the project's
  `.claude/skills` only once the workspace is trusted, and a cloud session never asks. So the
  repository's `SessionStart` hook (`.claude/hooks/load-prompt-inspector.sh`, set in
  `.claude/settings.json`) copies the inspector to `~/.claude/skills/prompt-inspector` as the session
  starts. A copy there loads without asking, before the first message.
- **On your computer**: accept the trust dialog for the folder, and `.claude/skills/prompt-inspector`
  loads by itself. The hook does nothing outside cloud sessions.

## Limits

- A skill's text, once sent, stays in the conversation. Deleting a skill stops its later uses and
  can take its line out of the skill list.
- Deleting a piece of the first message's context or an earlier reminder changes the start of the
  prompt, so the next request is sent without the prompt cache up to that point.

## Develop

```
claude plugin validate .claude/skills/prompt-inspector
claude plugin test .claude/skills/prompt-inspector
```

Debug mode: while `.claude/prompt-inspector.debug` exists (git-ignored), each turn's end measures
everything, runs a self-test of the exactness assumptions, and writes
`.claude/prompt-inspector.report.json`.
