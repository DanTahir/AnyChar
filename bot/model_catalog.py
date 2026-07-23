"""Small in-memory cache of OpenRouter's model catalog.

Used only as a cost-estimation fallback in ``openrouter_client.chat_completion``
when a response doesn't include OpenRouter's built-in ``usage.cost`` field (which
should be rare/never in practice, but we don't want billing to silently break if
it ever is absent).
"""

from __future__ import annotations

import time
from typing import Any, TypedDict

import httpx

_MODELS_URL = "https://openrouter.ai/api/v1/models"
_TTL_SECONDS = 10 * 60


class ModelPrice(TypedDict):
    promptPrice: float
    completionPrice: float
    cacheReadPrice: float | None
    cacheWritePrice: float | None


_cache: dict[str, ModelPrice] = {}
_cache_at: float = 0.0


async def _refresh() -> None:
    global _cache, _cache_at
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(_MODELS_URL)
        resp.raise_for_status()
        data = resp.json()

    models: dict[str, ModelPrice] = {}
    for item in data.get("data", []):
        model_id = item.get("id")
        if not model_id:
            continue
        pricing = item.get("pricing") or {}
        models[model_id] = _to_model_price(pricing)

    _cache = models
    _cache_at = time.monotonic()


def _to_model_price(pricing: dict[str, Any]) -> ModelPrice:
    def _num(v: Any) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    def _opt_num(v: Any) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return {
        "promptPrice": _num(pricing.get("prompt")),
        "completionPrice": _num(pricing.get("completion")),
        "cacheReadPrice": _opt_num(pricing.get("input_cache_read")),
        "cacheWritePrice": _opt_num(pricing.get("input_cache_write")),
    }


async def lookup(model_id: str) -> ModelPrice | None:
    """Return cached pricing for ``model_id``, refreshing the catalog if stale."""
    now = time.monotonic()
    if not _cache or (now - _cache_at) > _TTL_SECONDS:
        try:
            await _refresh()
        except Exception:
            # Keep serving a stale cache (if any) rather than failing the caller.
            if not _cache:
                return None
    return _cache.get(model_id)
