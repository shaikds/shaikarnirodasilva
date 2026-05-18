"""Verify that swapping the LLM provider is a no-code config change."""

from ai_export.config import Config
from ai_export.llm import get_provider


def _cfg(provider: str, model: str, **extra) -> Config:
    return Config(raw={"llm": {"provider": provider, "model": model, **extra}})


def test_all_providers_register():
    for name, model in [
        ("anthropic", "claude-opus-4-7"),
        ("openai", "gpt-4o"),
        ("ollama", "llama3.1:8b"),
        ("llamacpp", "any"),
    ]:
        p = get_provider(_cfg(name, model))
        assert p.name == name
        assert p.model == model


def test_cli_override_beats_config():
    cfg = _cfg("anthropic", "claude-opus-4-7")
    p = get_provider(cfg, provider="ollama", model="qwen2.5:7b")
    assert p.name == "ollama"
    assert p.model == "qwen2.5:7b"


def test_unknown_provider_raises():
    import pytest

    with pytest.raises(ValueError):
        get_provider(_cfg("nope", "x"))


def test_ollama_host_comes_from_options():
    cfg = _cfg("ollama", "llama3.1", ollama={"host": "http://example:11434"})
    p = get_provider(cfg)
    assert p.host == "http://example:11434"
