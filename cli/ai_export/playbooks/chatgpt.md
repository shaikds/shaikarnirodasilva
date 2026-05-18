# Playbook: ChatGPT

## Discovery

- Settings URL: https://chatgpt.com/#settings/DataControls
- Section: **Data Controls** → **Export data**
- Confirmation modal — click **Confirm export**

## Delivery

- Sender: `noreply@tm.openai.com`
- Subject contains: `ChatGPT - Your data export is ready`
- Body contains a link to a `.zip` artifact (download link is single-use, expires
  within 24h on OpenAI's side).

## Artifact layout

The ZIP contains:

- `conversations.json` — all chats (this is the canonical source)
- `chat.html` — pre-rendered HTML view
- `user.json`, `message_feedback.json`, `model_comparisons.json`, `shared_conversations.json`
- `dalle-generations/` (if any)

## Parsing notes

`conversations.json` is a list of conversations. Each has:

- `title`, `create_time` / `update_time` (unix seconds, float)
- `mapping` — a node tree keyed by node id
- `current_node` — leaf to walk back from to get chronological order

Each `mapping[node_id]` has:

- `parent`, `children`, `message` (or null for the root)
- `message.author.role` — `user` | `assistant` | `system` | `tool`
- `message.content.content_type` — usually `text` or `multimodal_text`
- `message.content.parts` — list of strings to join

## Deletion

There's no public endpoint; user must go to **Settings → Data Controls → Delete account**
or **Archive all chats**. The agent should not attempt this automatically.
