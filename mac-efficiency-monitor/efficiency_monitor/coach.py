"""
Optional: sharpen a flag's generic tip into a one-line, context-specific
suggestion using the Claude API. Fully optional - if ANTHROPIC_API_KEY isn't
set, or the 'anthropic' package isn't installed, this silently no-ops and
the static tip from config.json is used instead.
"""
import os

from .models import Flag

MODEL = "claude-sonnet-5"


def sharpen(flag: Flag) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return flag.tip
    try:
        import anthropic
    except ImportError:
        return flag.tip

    prompt = (
        f"I was flagged as '{flag.kind}' while using '{flag.app}' on '{flag.title}'. "
        f"Detail: {flag.detail}. Give me one concrete, specific next action "
        f"(max 25 words, no preamble) to get unstuck or refocus."
    )
    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=MODEL,
            max_tokens=60,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
        return text or flag.tip
    except Exception:
        return flag.tip
