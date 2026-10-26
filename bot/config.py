from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DYNAMODB_TABLE = os.getenv("DYNAMODB_TABLE", "AnyChar")
S3_BUCKET = os.getenv("S3_BUCKET", "")
TOKEN = os.getenv("TOKEN", "")

# Vision is always Llama 4 Maverick — not user-selectable.
OPENROUTER_VISION_MODEL = os.getenv(
    "OPENROUTER_VISION_MODEL", "meta-llama/llama-4-maverick"
)
# Default text model when a user hasn't picked one on the dashboard yet.
OPENROUTER_DEFAULT_TEXT_MODEL = os.getenv(
    "OPENROUTER_DEFAULT_TEXT_MODEL", "mistralai/mistral-small-2603"
)

# Starred/pinned models shown at the top of the dashboard's model dropdown, in order.
# Which list applies depends on the user's adult-content setting (the `age18plus`
# attribute). Mirrored in web/src/lib/models.ts — keep both lists in sync.

# Adult content OFF (default): best frontier models, regardless of adult support.
DEFAULT_STARRED_MODEL_IDS = [
    "anthropic/claude-opus-5.5",
    "anthropic/claude-sonnet-5.5",
    "openai/gpt-6.1-sol",
    "google/gemini-4-argon",
    "x-ai/grok-4.7",
    "moonshotai/kimi-k3.1-pro",
    "deepseek/deepseek-v4-pro-0813",
]

# Adult content ON: strongest models that are unmoderated on OpenRouter and
# permissive at the model level, so they will actually produce adult content.
ADULT_STARRED_MODEL_IDS = [
    "aion-labs/aion-3.5",
    "deepseek/deepseek-v4-pro-0813",
    "x-ai/grok-4.7",
    "mistralai/mistral-large-4-0",
    "z-ai/glm-5.3",
]

SITE_URL = os.getenv("SITE_URL", "http://localhost:3000")
BUDGET_EXCEEDED_MESSAGE = os.getenv(
    "BUDGET_EXCEEDED_MESSAGE",
    "You've reached your usage limit. Visit the dashboard for details.",
)
ENCRYPTION_SECRET = os.getenv("ENCRYPTION_SECRET", "")
DISCORD_MAX_LENGTH = 2000
THREAD_MESSAGE_LIMIT = 100
BUDGET_USD = 10.0

# Conversation tree cache (S3-backed, see conversation_cache.py). A tree's
# message IDs are kept in the in-memory index for this long after the last
# read/write before they're allowed to fall out; the S3 file itself is never
# deleted, only forgotten from memory.
CONVERSATION_TTL_SECONDS = int(
    os.getenv("CONVERSATION_TTL_SECONDS", str(7 * 24 * 60 * 60))
)
CONVERSATION_CLEANUP_INTERVAL_SECONDS = int(
    os.getenv("CONVERSATION_CLEANUP_INTERVAL_SECONDS", str(60 * 60))
)
CONVERSATION_S3_PREFIX = "conversations"
