# prompt-inspector

A Claude Code mod that shows what was injected into the prompt and when: system-prompt
sections, CLAUDE.md and rule files, reminders, the skill listing and skill bodies. Each piece
gets its token range (start–end) in the request. Any piece can be removed from the prompt,
which makes it easy to test whether a rule or skill actually changes Claude's behaviour.

## Install

Once this branch is merged into `main`, type this at the prompt of a terminal session:

```
/plugin install prompt-inspector --marketplace shaikds/shaikarnirodasilva
```

Answer `y` to add the marketplace, then pick a scope.

To run it from a checkout instead:

```
claude --plugin-dir ./prompt-inspector
```

## Use

| Command | What it does |
|---|---|
| `/inspect` | Turns the mode on and opens the pane. Pressing a row removes it or puts it back. |
| `/inspect list` / `list focus` | Prints every row, or rules and skills only |
| `/inspect show 27` | Prints exactly what row 27 injected |
| `/inspect rm 27` | Removes row 27 from the next request on. Also takes `rm 3,7`, `rm CLAUDE.md`, `rm sys:memory`, `rm listing:commit`, `rm type:todo_reminder` |
| `/inspect restore 27` / `restore all` | Puts it back |
| `/inspect count` | Replaces the estimates with exact counts from the session model (spends input tokens) |
| `/inspect on` / `off` | Starts or stops the transcript lines that mark each new injection |

None of the inspector's output is sent to the model.

A row reads: `✓ #  range  tokens  kind  turn  name`. `✓` means sent and `✗` means removed. `≈` marks
an estimate, and `t0` means before the first prompt.

## What to know

- Token counts are estimated at about 4 characters per token until `/inspect count` measures them.
- Positions in the system prompt and CLAUDE.md come from adding up section sizes. Positions of
  later injections come from the real input size of the previous request.
- Removing a system section, a CLAUDE.md file or a reminder also takes it out of earlier
  messages from the next request on, at the cost of one prompt-cache miss.
- Removing a skill applies to its next invocation. A copy already in the conversation stays.
- Tool definitions are counted as one total, not per tool.
- Subagent system prompts can't be told apart from the main one.

## Develop

```
claude plugin validate ./prompt-inspector
claude plugin test ./prompt-inspector
```
