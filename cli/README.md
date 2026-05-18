# ai-export

Own your AI data. Export conversations from ChatGPT (and friends), normalize them
into a canonical JSON + Markdown bundle, and re-inject the result into any other
LLM as project context.

The "brain" of the agent is **pluggable**: Anthropic, OpenAI, Ollama, or
llama.cpp / LM Studio — pick per-run with `--provider` or set a default in
`~/.config/ai-export/config.yaml`. No code changes required to switch.

## Install

```bash
cd cli
pip install -e ".[all,dev]"     # or just .[anthropic] / .[openai]
cp ../config.example.yaml ~/.config/ai-export/config.yaml
```

## Commands

```bash
ai-export request chatgpt              # kicks off / prints export instructions
ai-export poll                         # check mailbox for ready exports
ai-export download <request-id>        # pull the artifact
ai-export parse   <request-id>         # → canonical JSON
ai-export render  <request-id>         # → Markdown bundle (incl. PASTE.md)
ai-export cron install --interval 1h   # background polling
ai-export delete  chatgpt --i-understand-this-is-irreversible
```

## Swap the LLM

```bash
ai-export request chatgpt --provider ollama --model llama3.1:8b
AI_EXPORT_PROVIDER=openai AI_EXPORT_MODEL=gpt-5 ai-export request claude
```

## Tests

```bash
pytest
```
