---
name: ai-data-export
description: Export, normalize, and re-inject user data across AI services (ChatGPT, Claude, Perplexity, …). Trigger when the user asks to "export my AI data", "back up my ChatGPT chats", "move my conversations to another LLM", "own my AI history", or anything similar.
---

# ai-data-export

Helps the user take their conversations out of one AI service and into another,
in a clean, paste-ready format. The actual work runs locally via the `ai-export`
CLI in this repo (see `cli/README.md`).

## When to use

Trigger on intents like:

- "Export my ChatGPT data"
- "Back up my Claude / Perplexity conversations"
- "Move my AI history into another model"
- "Set up automatic exports of my AI data"
- "Delete my data from <service>"

## How to use

Delegate to the `ai-data-exporter` subagent. The subagent will:

1. Pick the right adapter (or research a new one if missing)
2. Run `ai-export request <service>` and surface the next steps to the user
3. Set up `ai-export cron install` if the user wants automatic polling
4. Once data is in hand, point the user at the canonical JSON + `PASTE.md` so
   they can paste it into any other LLM
5. For deletions: **always** ask the user before doing anything, and use the
   `--i-understand-this-is-irreversible` flag explicitly

## Provider note

The "brain" used inside the agent is configurable: `--provider anthropic`
(default), `--provider openai`, `--provider ollama`, or `--provider llamacpp`.
The user can also set a default in `~/.config/ai-export/config.yaml`. If the
user mentions wanting to use a local model or a different LLM, pass it through.
