from __future__ import annotations

import asyncio
from typing import Any

from openai import AsyncOpenAI, RateLimitError

from config import (
    OPENROUTER_MEMORY_MODEL,
    OPENROUTER_TEXT_MODEL,
    OPENROUTER_VISION_MODEL,
)
from dynamo import get_user, update_usage
from usage import is_over_budget

_MAX_RETRIES = 3


def _retry_after_seconds(exc: RateLimitError) -> float:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        meta = body.get("error", {}).get("metadata", {})
        if isinstance(meta, dict):
            raw = meta.get("retry_after_seconds")
            if raw is not None:
                try:
                    return max(1.0, float(raw))
                except (TypeError, ValueError):
                    pass
    return 10.0


async def chat_completion(
    *,
    api_key: str,
    owner_discord_id: str,
    system: str,
    user_content: str | list[dict[str, Any]],
    use_vision: bool = False,
    model: str | None = None,
    max_tokens: int = 4000,
    charge_usage: bool = True,
) -> str:
    user = get_user(owner_discord_id)
    if charge_usage and is_over_budget(user):
        from usage import budget_exceeded_message

        return budget_exceeded_message()

    if not api_key:
        raise ValueError("No OpenRouter API key for user")

    client = AsyncOpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    if model:
        chosen = model
    elif use_vision:
        chosen = OPENROUTER_VISION_MODEL
    else:
        chosen = OPENROUTER_MEMORY_MODEL or OPENROUTER_TEXT_MODEL

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    messages.append({"role": "user", "content": user_content})

    last_exc: RateLimitError | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            response = await client.chat.completions.create(
                model=chosen,
                max_tokens=max_tokens,
                messages=messages,
            )
            usage = response.usage
            if usage and charge_usage:
                update_usage(
                    owner_discord_id,
                    int(usage.prompt_tokens or 0),
                    int(usage.completion_tokens or 0),
                )
            content = response.choices[0].message.content
            return (content or "").strip()
        except RateLimitError as exc:
            last_exc = exc
            if attempt + 1 >= _MAX_RETRIES:
                raise
            await asyncio.sleep(_retry_after_seconds(exc))

    if last_exc:
        raise last_exc
    raise RuntimeError("chat_completion failed without response")
