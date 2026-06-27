from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI, APIError

from config import OPENROUTER_MEMORY_MODEL, OPENROUTER_MODEL, OPENROUTER_VISION_MODEL
from dynamo import get_user, update_usage
from usage import is_over_budget


def _has_images(content: str | list[dict[str, Any]]) -> bool:
    return isinstance(content, list) and any(
        b.get("type") == "image_url" for b in content
    )


def _strip_images(content: list[dict[str, Any]]) -> str | list[dict[str, Any]]:
    text_blocks = [b for b in content if b.get("type") != "image_url"]
    if len(text_blocks) == 1 and text_blocks[0].get("type") == "text":
        return text_blocks[0]["text"]
    return text_blocks


async def chat_completion(
    *,
    api_key: str,
    owner_discord_id: str,
    system: str,
    user_content: str | list[dict[str, Any]],
    use_vision: bool = True,
    model: str | None = None,
) -> str:
    user = get_user(owner_discord_id)
    if is_over_budget(user):
        from usage import budget_exceeded_message

        return budget_exceeded_message()

    if not api_key:
        raise ValueError("No OpenRouter API key for user")

    client = AsyncOpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    chosen = model or (OPENROUTER_MODEL if use_vision else OPENROUTER_MEMORY_MODEL)

    if _has_images(user_content):
        if OPENROUTER_VISION_MODEL:
            chosen = OPENROUTER_VISION_MODEL
        else:
            user_content = _strip_images(user_content)  # type: ignore[arg-type]

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    messages.append({"role": "user", "content": user_content})

    response = await client.chat.completions.create(
        model=chosen,
        max_tokens=4000,
        messages=messages,
    )

    usage = response.usage
    if usage:
        update_usage(
            owner_discord_id,
            int(usage.prompt_tokens or 0),
            int(usage.completion_tokens or 0),
        )

    content = response.choices[0].message.content
    return (content or "").strip()
