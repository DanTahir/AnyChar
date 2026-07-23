from __future__ import annotations

from config import BUDGET_EXCEEDED_MESSAGE, BUDGET_USD


def user_estimated_cost(user: dict) -> float:
    """Actual USD charged so far (2x OpenRouter's real cost), tracked directly
    on the user item by openrouter_client.chat_completion() as usageCostUsd."""
    try:
        return float(user.get("usageCostUsd") or 0)
    except (TypeError, ValueError):
        return 0.0


def user_budget_usd(user: dict) -> float:
    raw = user.get("budgetUsd")
    if raw is None:
        return BUDGET_USD
    try:
        return float(raw)
    except (TypeError, ValueError):
        return BUDGET_USD


def is_over_budget(user: dict | None) -> bool:
    if not user:
        return True
    return user_estimated_cost(user) >= user_budget_usd(user)


def budget_exceeded_message() -> str:
    return BUDGET_EXCEEDED_MESSAGE
