# prompt-inspector

A Claude Code mod for testing rules. It shows where each of your rules and skills sits in the prompt
Claude receives, from token 0 to the last token, and lets you delete a piece or re-inject it at the
end of the context. Then you can send the same message again and compare the answers.

## Use

| Command | What it shows |
|---|---|
<<<<<<< HEAD
| `/inspect` | Your pieces: your `CLAUDE.md` files, `.claude/rules` files, CLAUDE.md files picked up later from subfolders, and the skills you made (their line in the skill list, and their text each time it is used). |
=======
| `/inspect` | Only what is in the context right now, listed as `Name [start - end]` (a count says how many more are in context but not measured; nothing waiting or planned is listed). Your pieces: your `CLAUDE.md` files, `.claude/rules` files, CLAUDE.md files picked up later from subfolders, and the skills you made (their line in the skill list, and their text each time it is used). |
>>>>>>> origin/claude/prompt-inspector
| `/inspect all` | Every injected piece, Claude Code's own included, plus unnamed lines for what lies between them (tools + system prompt, the conversation), so the ranges run without gaps from 0 to the last token. Never your own messages. |

Both open a card, on any device including the phone:

<<<<<<< HEAD
1. The list: two pieces per card, each with its exact range (`CLAUDE.md · 76,489–77,102`), then
=======
1. The list: two pieces per card, each with its exact range (`CLAUDE.md [76,489 - 77,102]`), then
>>>>>>> origin/claude/prompt-inspector
   **More…** (it wraps back to the first page) and **Done**. You can also type a token position
   (`58002`, `58,002` or `58.002`) to open the piece there.
2. Tap a piece: its exact range, size and the message it came with, then:
   - **🗑 Delete** (asks to confirm): the piece leaves the prompt from your next message on. The list
     keeps it as `deleted, was 76,489–77,102`.
   - **🔄 Re-inject at end**: the piece leaves its place and a copy rides with your next message, at
     the end of the context. The copy gets its own row (`🔄 CLAUDE.md · …`) and the original reads
     `moved, was …`. A piece is re-injected once; 🗑 on either row takes it out altogether.
   - For a skill's text: **🗑 Stop later uses** (the text already sent stays where it is) and
     **🔄 Send a copy at end**.

Claude reads only the command's closing line, `Prompt inspector closed.`; the cards stay out of its
context.

## How the numbers are exact

- The API reports each request's size exactly. Where its cached part ends (`cache read + cache
  write`) is exactly where its last block ends, when only the closing tokens are left uncached.
- A piece is placed backwards from that point in the request that first carries it: everything
  after it is counted exactly, then the piece itself.
- Counting uses the API, because Claude's tokenizer is not public. Each distinct text is counted
  once (8 at a time) and the count is kept.
- From then on a position is carried to each new request only by proof: the cache read proves
  everything before it unchanged; or, after a change (your 🗑 or 🔄), the two requests are compared
  block by block and every block that changed before it is counted whole, as sent.
- Counts only ever cover text that runs to the end of its block: a text counted alone loses its
  trailing whitespace, so a piece's start is taken from the piece with the rest of its block.
- Claude Code sends some of its own reminders reworded; those are found by their lines and placed
  as the whole block they were sent in (the card says so). A few are added only as a request is
  sent, outside the messages: those read `not found in its request as sent`.
- What can't be proven says `not measured` and why (compaction, a block that isn't text, text sent
  before the inspector started), never a guess. Sizes are always exact. System-prompt sections show
  their size; their position inside tools + system prompt is not reported by the API.
- Debug mode runs a self-test of these facts against the model (`exact` when they hold).

## How it turns on

- **Cloud sessions** (web and phone): Claude Code loads a plugin under the project's
  `.claude/skills` only once the workspace is trusted, and a cloud session never asks. So the
  repository's `SessionStart` hook (`.claude/hooks/load-prompt-inspector.sh`, set in
  `.claude/settings.json`) copies the inspector to `~/.claude/skills/prompt-inspector` as the session
  starts. A copy there loads without asking, before the first message.
- **On your computer**: accept the trust dialog for the folder, and `.claude/skills/prompt-inspector`
  loads by itself. The hook does nothing outside cloud sessions.
- **In another repository**: copy `.claude/skills/prompt-inspector`, `.claude/hooks/load-prompt-inspector.sh`
  and the `SessionStart` hook in `.claude/settings.json`.

## Limits

- A skill's text, once sent, stays in the conversation; deleting a skill stops its later uses.
- Deleting a piece of the first message's context changes the start of the prompt, so the next
  request is sent without the prompt cache from that point.

## Develop

```
claude plugin validate .claude/skills/prompt-inspector
claude plugin test .claude/skills/prompt-inspector
```

Debug mode: while `.claude/prompt-inspector.debug` exists (git-ignored), the inspector registers a
`debug` tool that returns its report (the self-test, the boundary check, the last requests and every
row), and writes the same report to `.claude/prompt-inspector.report.json` at each turn's end.
