"""Claude calls with structured (Pydantic) outputs."""

from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.config import get_settings

T = TypeVar("T", bound=BaseModel)


class LlmUnavailable(RuntimeError):
    pass


_client: anthropic.Anthropic | None = None


def structured(*, system: str, user: str, schema: type[T], fast: bool = False, max_tokens: int = 8000) -> T:
    """`fast=True` uses the cheap model (word glosses); otherwise the main model at medium effort."""
    global _client
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LlmUnavailable("ANTHROPIC_API_KEY is not set")
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=120)

    model = settings.llm_fast_model if fast else settings.llm_model
    extra = {} if fast else {"output_config": {"effort": "medium"}}
    try:
        resp = _client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            **extra,
        )
    except anthropic.APIError as e:
        raise LlmUnavailable(f"Claude API error: {e}") from e
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise LlmUnavailable(f"No usable answer from Claude (stop_reason={resp.stop_reason})")
    return resp.parsed_output
