from __future__ import annotations

from config import (
    BUDGET_EXCEEDED_MESSAGE,
    BUDGET_USD,
    INPUT_COST_PER_M,
    OUTPUT_COST_PER_M,
)


def estimate_cost_usd(input_tokens: int, output_tokens: int) -> float:
    return (input_tokens / 1_000_000) * INPUT_COST_PER_M + (
        output_tokens / 1_000_000
    ) * OUTPUT_COST_PER_M


def user_estimated_cost(user: dict) -> float:
    inp = int(user.get("usageInputTokens") or 0)
    out = int(user.get("usageOutputTokens") or 0)
    return estimate_cost_usd(inp, out)


def is_over_budget(user: dict | None) -> bool:
    if not user:
        return True
    return user_estimated_cost(user) >= BUDGET_USD


def budget_exceeded_message() -> str:
    return BUDGET_EXCEEDED_MESSAGE
