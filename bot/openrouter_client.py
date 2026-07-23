from __future__ import annotations

import asyncio
import copy
from typing import Any

import httpx

import model_catalog
from config import OPENROUTER_DEFAULT_TEXT_MODEL, OPENROUTER_VISION_MODEL
from dynamo import get_user, update_usage
from usage import is_over_budget

_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
_MAX_RETRIES = 3
_BILLING_MULTIPLIER = 2.0

# Model families that require an explicit `cache_control` marker to opt into
# prompt caching (Anthropic, Alibaba Qwen, and DeepSeek's v3.2 specifically).
# Most other families (OpenAI, Gemini, DeepSeek non-3.2, Grok, Moonshot, Groq,
# and today's starred models) cache implicitly with no markers needed.
# NOTE: this list may need periodic review as OpenRouter/providers evolve.
_EXPLICIT_CACHE_PREFIXES = ("anthropic/", "qwen/")
_EXPLICIT_CACHE_EXACT = {"deepseek/deepseek-v3.2"}


class RateLimitError(Exception):
    """Raised when OpenRouter returns HTTP 429."""

    def __init__(self, message: str, retry_after_seconds: float = 10.0) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class OpenRouterAPIError(Exception):
    """Raised for non-429 OpenRouter error responses."""


def isExplicitCacheFamily(model_id: str) -> bool:
    return model_id.startswith(_EXPLICIT_CACHE_PREFIXES) or model_id in _EXPLICIT_CACHE_EXACT


def _apply_cache_control(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach an ephemeral cache_control breakpoint to the system message and
    the last user-content block, for models that require explicit caching."""
    messages = copy.deepcopy(messages)
    marker = {"type": "ephemeral"}

    def _mark(msg: dict[str, Any]) -> None:
        content = msg.get("content")
        if isinstance(content, str):
            msg["content"] = [{"type": "text", "text": content, "cache_control": marker}]
        elif isinstance(content, list) and content:
            last = content[-1]
            if isinstance(last, dict):
                last["cache_control"] = marker

    for msg in messages:
        if msg.get("role") == "system":
            _mark(msg)

    for msg in reversed(messages):
        if msg.get("role") == "user":
            _mark(msg)
            break

    return messages


def _retry_after_seconds(resp: httpx.Response) -> float:
    header = resp.headers.get("retry-after")
    if header:
        try:
            return max(1.0, float(header))
        except (TypeError, ValueError):
            pass
    try:
        body = resp.json()
        meta = body.get("error", {}).get("metadata", {})
        if isinstance(meta, dict):
            raw = meta.get("retry_after_seconds")
            if raw is not None:
                return max(1.0, float(raw))
    except Exception:
        pass
    return 10.0


def _resolve_model(
    *, model: str | None, use_vision: bool, owner_discord_id: str
) -> str:
    if model:
        return model
    if use_vision:
        return OPENROUTER_VISION_MODEL
    user = get_user(owner_discord_id)
    preferred = (user or {}).get("preferredTextModel")
    return preferred or OPENROUTER_DEFAULT_TEXT_MODEL


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
    session_id: str | None = None,
) -> str:
    user = get_user(owner_discord_id)
    if charge_usage and is_over_budget(user):
        from usage import budget_exceeded_message

        return budget_exceeded_message()

    if not api_key:
        raise ValueError("No OpenRouter API key for user")

    chosen = _resolve_model(
        model=model, use_vision=use_vision, owner_discord_id=owner_discord_id
    )

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    messages.append({"role": "user", "content": user_content})

    if isExplicitCacheFamily(chosen):
        messages = _apply_cache_control(messages)

    body: dict[str, Any] = {
        "model": chosen,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if session_id:
        body["session_id"] = session_id

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_exc: RateLimitError | None = None
    async with httpx.AsyncClient(timeout=120.0) as client:
        for attempt in range(_MAX_RETRIES):
            resp = await client.post(_CHAT_URL, headers=headers, json=body)
            if resp.status_code == 429:
                last_exc = RateLimitError(
                    f"OpenRouter rate limited (attempt {attempt + 1})",
                    retry_after_seconds=_retry_after_seconds(resp),
                )
                if attempt + 1 >= _MAX_RETRIES:
                    raise last_exc
                await asyncio.sleep(last_exc.retry_after_seconds)
                continue
            if resp.status_code >= 400:
                raise OpenRouterAPIError(
                    f"OpenRouter API error {resp.status_code}: {resp.text}"
                )

            data = resp.json()
            usage = data.get("usage") or {}
            if charge_usage:
                await _bill_usage(
                    owner_discord_id=owner_discord_id,
                    model=chosen,
                    usage=usage,
                )
            choices = data.get("choices") or [{}]
            content = (choices[0].get("message") or {}).get("content") or ""
            return content.strip()

    if last_exc:
        raise last_exc
    raise RuntimeError("chat_completion failed without response")


async def _bill_usage(*, owner_discord_id: str, model: str, usage: dict[str, Any]) -> None:
    input_tokens = int(usage.get("prompt_tokens") or 0)
    output_tokens = int(usage.get("completion_tokens") or 0)
    details = usage.get("prompt_tokens_details") or {}
    cached_tokens = int(details.get("cached_tokens") or 0)
    cache_write_tokens = int(details.get("cache_write_tokens") or 0)

    raw_cost = usage.get("cost")
    if raw_cost is not None:
        try:
            cost_usd = float(raw_cost)
        except (TypeError, ValueError):
            cost_usd = None
    else:
        cost_usd = None

    if cost_usd is None:
        price = await model_catalog.lookup(model)
        if price:
            cost_usd = (
                input_tokens * price["promptPrice"]
                + output_tokens * price["completionPrice"]
            )
        else:
            cost_usd = 0.0

    charged_usd = _BILLING_MULTIPLIER * cost_usd

    update_usage(
        owner_discord_id,
        input_tokens,
        output_tokens,
        charged_usd,
        cached_tokens,
        cache_write_tokens,
    )
