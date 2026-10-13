# prompt-inspector

A Claude Code mod for testing rules. It shows where each of your rules and skills sits in the prompt
Claude receives, from token 0 to the last token, and lets you delete a piece or re-inject it at the
end of the context. Then you can send the same message again and compare the answers.

## Use

| Command | What it shows |
|---|---|
| `/inspect` | Only what is in the context right now, listed as `Name [start - end]` (a count says how many more are in context but not measured; nothing waiting or planned is listed). Your pieces: your `CLAUDE.md` files, `.claude/rules` files, CLAUDE.md files picked up later from subfolders, and the skills you made (their line in the skill list, and their text each time it is used). |
| `/inspect all` | Every injected piece, Claude Code's own included, plus unnamed lines for what lies between them (tools + system prompt, the conversation), so the ranges run without gaps from 0 to the last token. Never your own messages. |

Your instruction files count wherever their text reaches the context: injected by Claude Code (a `CLAUDE.md` of a folder Claude reads in), read by Claude itself (`files/CLAUDE.md` opened with the Read tool), or printed by a command (`cat sub/CLAUDE.md`). Each is listed by its path, with its exact range. **🔄** sends a copy to the end of the context, where the copy gets its own exact range. A file whose text is not in the context is not listed.

Your other files count the same way: any file of yours Claude opens with the Read tool (a `.txt`, `.md`, `.csv`, a PDF, a picture; anything but source code), in the project or one you uploaded, any file a command prints (`cat notes.md`), and any file you send with your message (`@notes/a.txt`). A file you send comes as its own text, with its exact range. A file Claude reads or a command prints stays inside the tool's result, as Claude Code sent it: no place inside a tool result can be told, so its range is Claude's call and the results that hold it (from the end of what came before the call to the end of the results, both exact), shown with the file's own exact size. A PDF or a picture has no 🔄: no text to send as a copy.

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

- **The request as the model gets it.** The inspector rebuilds each request from what the session
  holds, as Claude Code sends it: your messages in a row are one, and on models that read system
  turns (Opus 5.5 and others) the reminders leave your message and follow it as one system turn (an
  attachment drawn as several reminders joined by a line break, attachments by a blank line). Rebuilt
  requests were compared with real captured ones: identical.
- **Where a request ends.** The API reports a request's size exactly. It is its messages and the
  closing tokens after its last message (4 after a message of yours, 2 after a system turn on
  Opus 5.5). The inspector measures those closings once per model, with a short request of its own
  whose cache mark ends its last text (only the closing is left uncached).
- **Where a piece is.** A piece is placed in the request that first carries it, from that request's
  end: the API's own token counter (`count_tokens`) counts the request's end as sent, and again cut
  just after the piece. The difference is everything after the piece, so the piece ends that far
  before the end; it starts its own size earlier. Both edges are checked to fall between two tokens,
  and a piece's range is its text as it shows (white space at its edges belongs to what is beside it).
- Claude Code sends some of its own reminders reworded; those are found by most of their lines and
  placed as the whole block they were sent in (the card says so).
- **Checked against the API.** Every kind of range (a CLAUDE.md, a rule, a skill line, a file you
  sent, a 🔄 copy, a call and its results, ranges after 🗑, 🔄 and a compaction) was checked by replaying
  the real request cut at the piece's edge, with the cache mark there: the API's cached part ends on
  the same token.
- **It stays.** A range stays the same until something before it changes: each request's cache read
  proves everything before it unchanged. After your 🗑 or 🔄, a block taken out before it is counted
  whole as sent (a system turn with its framing).
- **After a change, thinking.** When what precedes an answer that thought changes (your 🗑 of a
  reminder before it), the API stops counting that answer's thinking, which no count shows. So a
  piece after it is placed again in the request that carried the change, from its end, and trusted
  only once proven: placed the same way, the end of the block where the change began must land
  exactly on the token where the API says that request's cache read ended. (An answer of text alone
  that begins Claude's turn costs 2 tokens more while a thinking block is still bound in the
  conversation; the proof also says which.)
- **Compaction.** After a compaction, what it summarized away leaves the list, and what is still in
  the context (the files Claude Code brings back with the summary, your CLAUDE.md files) is placed
  again from the next request. A `CLAUDE.md` you deleted stays out: Claude Code brings its file back
  with the summary, and the inspector leaves it out.
- **Inside a tool result** (a file Claude read, a command's output, a picture, a PDF) no place can be
  told: the API wraps a tool result in tokens of its own before and after its content and reports
  only their sum, and no request cut between two results is accepted. So the range shown is Claude's
  call and its results: it starts where the request before ended (the cache read proves it
  unchanged) and ends where the results end (counted the same way as a piece). The piece's own size
  comes from `count_tokens` (the result with and without it).
- What came before the inspector started (a session resumed in a new process too) can't be placed:
  no request it saw first carried it. It is counted in the list's header, not listed.
- What can't be proven says `not measured` and why, never a guess: after a 🗑 or 🔄, a piece later
  in the conversation whose new place the cache read can't prove (counting without Claude Code's own
  system prompt and tools differs from the request by a token or two across later answers and tool
  results; the API takes no system prompt or tool list the inspector could read), and a request in
  which a server tool ran. Sizes are always exact. System-prompt sections show their size; their
  position inside tools + system prompt is not reported by the API.
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
- Deleting or moving a piece drops the thinking of the answers after it from the context (the API
  binds thinking to what came before it).

## Develop

```
claude plugin validate .claude/skills/prompt-inspector
claude plugin test .claude/skills/prompt-inspector
```

Debug mode: while `.claude/prompt-inspector.debug` exists (git-ignored), the inspector registers a
`debug` tool that returns its report (the self-test, the boundary check, the last requests and every
row), and writes the same report to `.claude/prompt-inspector.report.json` at each turn's end.

In debug mode, writing `{"label": "<path>", "action": "delete"}` (or `"move"`) to `.claude/prompt-inspector.act` presses 🗑 or 🔄 on that row at the next `debug` call, for testing without the cards (`"action": "compacted"` treats the conversation as just compacted).
