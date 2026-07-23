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
# Mirrored in web/src/lib/models.ts — keep both lists in sync if this ever changes.
STARRED_MODEL_IDS = [
    "mistralai/mistral-small-2603",
    "deepseek/deepseek-v4-pro",
    "aion-labs/aion-3.0",
    "meta-llama/llama-4-maverick",
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
