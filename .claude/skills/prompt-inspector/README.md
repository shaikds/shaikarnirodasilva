# prompt-inspector

A Claude Code mod for testing rules. It shows where each of your rules and skills sits in the prompt
Claude receives, from token 0 to the last token, and lets you delete a piece or re-inject it at the
end of the context. Then you can send the same message again and compare the answers.

## Use

| Command | What it shows |
|---|---|
| `/inspect` | Only what is in the context right now, listed as `Name [start - end]` (a count says how many more are in context but not measured; nothing waiting or planned is listed). Your pieces: your `CLAUDE.md` files, `.claude/rules` files, CLAUDE.md files picked up later from subfolders, and the skills you made (their line in the skill list, and their text each time it is used). |
| `/inspect all` | Every injected piece, Claude Code's own included, plus unnamed lines for what lies between them (tools + system prompt, the conversation), so the ranges run without gaps from 0 to the last token. Never your own messages. |

Your instruction files count wherever their text reaches the context: injected by Claude Code (a `CLAUDE.md` of a folder Claude reads in), read by Claude itself (`files/CLAUDE.md` opened with the Read tool), or printed by a command (`cat sub/CLAUDE.md`). Each is listed by its path. One sent as its own text has its exact range; one inside a tool result (read, printed, or joined into a read) reads `[not measured]` with its exact size, since the API never says where a tool result's text lies (below). **🔄** sends a copy to the end of the context, where the copy gets an exact range. A file whose text is not in the context is not listed.

Your other files count the same way: any file of yours Claude opens with the Read tool (a `.txt`, `.md`, `.csv`, a PDF, a picture; anything but source code), in the project or one you uploaded, and any file you send with your message (`@notes/a.txt`). A file you send comes as its own text, with its exact range. One Claude read is inside its tool result: `[not measured]`, with its exact size, the Read tool's output (a text's numbered lines; a PDF's or a picture's whole output, counted on its own, since its pages and the text beside them cost a few tokens more together than apart). 🔄 on a PDF or a picture adds `@` and its path to your next message (you see it there), so Claude Code attaches the file itself again, at the end.

Both open a card, on any device including the phone:

1. The list: two pieces per card, each with its exact range (`CLAUDE.md [76,489 - 77,102]`), then
   **More…** (it wraps back to the first page) and **Done**. You can also type a token position
   (`58002`, `58,002` or `58.002`) to open the piece there.
2. Tap a piece: its exact range, size and the message it came with, then:
   - **🗑 Delete** (asks to confirm): the piece leaves the prompt from your next message on (Claude
     Code keeps its answer for an injected piece until the turn ends). The list keeps it as
     `deleted, was 76,489–77,102`; one that had no range reads `[deleted]` until it is gone, with the
     tokens it takes out (a `CLAUDE.md` joined into a read: its text, its tags and the blank line
     before them).
   - **🔄 Re-inject at end**: the piece leaves its place and a copy rides with your next message, at
     the end of the context. The copy gets its own row (`🔄 CLAUDE.md · …`) and the original reads
     `moved, was …`. A piece is re-injected once; 🗑 on either row takes it out altogether.
   - For a skill's text: **🗑 Stop later uses** (the text already sent stays where it is) and
     **🔄 Send a copy at end**.
   - For a file Claude read itself, or a command printed (it is Claude's own tool result, which no
     hook can take back): **🗑 Stop later reads** (later reads of it are refused, and Claude Code no
     longer injects it) and **🔄 Send a copy at end** (its text rides with your next message).
   - A rule Claude Code joined into a file read's result (a nested `CLAUDE.md`) is an injection: 🗑
     and 🔄 take it out of that result from your next request on.

Claude reads only the command's closing line, `Prompt inspector closed.`; the cards stay out of its
context.

## How the numbers are exact

- The API reports each request's size exactly. Where its cached part ends (`cache read + cache
  write`) is exactly where its last block ends, when only the closing tokens are left uncached.
- A piece is placed backwards from that point in the request that first carries it: everything
  after it is counted exactly, then the piece itself.
- Counting uses the API, because Claude's tokenizer is not public. Each distinct text is counted
  once (8 at a time) and the count is kept.
- Once placed, a range stays the same until you delete or re-inject the piece (or something before
  it changes). It is carried to each new request only by proof: the cache read proves
  everything before it unchanged; or, after a change (your 🗑 or 🔄), the two requests are compared
  block by block and every block that changed before it is counted whole, as sent.
- Counts only ever cover text that runs to the end of its block: a text counted alone loses its
  trailing whitespace, so a piece's start is taken from the piece with the rest of its block.
- Claude Code sends some of its own reminders reworded; those are found by their lines and placed
  as the whole block they were sent in (the card says so). A few are added only as a request is
  sent, outside the messages: those read `not found in its request as sent`.
- Inside a tool result (a nested `CLAUDE.md` Claude Code joins into a file read's result, or a file
  Claude read or printed) only the size is exact. The API wraps each tool result in tokens of its own
  before and after the text, and reports only their sum: a cache mark inside a tool result is
  refused, and one on it holds to the end of its message. So where the text starts and ends is not
  known, and the row reads `[not measured]`. Its size comes from the API's `count_tokens`, with each
  cut proven to fall between two tokens (the text before it and after it, counted alone, add up to
  the whole). A reminder's size takes in its tags and the blank lines before it; a file's ends at its
  last character that shows. It stays listed while its text is in the conversation.
- Claude Code adds some reminders (the skill list, a nested `CLAUDE.md`) to a request only as it sends it, and may announce one after the request is gone: the request is read again once sent, and a late one is matched to the message, and request, that carried it.
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

In debug mode, writing `{"label": "<path>", "action": "delete"}` (or `"move"`) to `.claude/prompt-inspector.act` presses 🗑 or 🔄 on that row at the next `debug` call, for testing without the cards.
