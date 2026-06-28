from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DYNAMODB_TABLE = os.getenv("DYNAMODB_TABLE", "AnyChar")
S3_BUCKET = os.getenv("S3_BUCKET", "")
TOKEN = os.getenv("TOKEN", "")
_MAVERICK = "meta-llama/llama-4-maverick"
OPENROUTER_TEXT_MODEL = os.getenv("OPENROUTER_TEXT_MODEL", _MAVERICK)
OPENROUTER_VISION_MODEL = os.getenv("OPENROUTER_VISION_MODEL", _MAVERICK)
OPENROUTER_MEMORY_MODEL = (
    os.getenv("OPENROUTER_MEMORY_MODEL", "") or OPENROUTER_TEXT_MODEL
)
# Legacy fallback
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "") or OPENROUTER_VISION_MODEL
SITE_URL = os.getenv("SITE_URL", "http://localhost:3000")
BUDGET_EXCEEDED_MESSAGE = os.getenv(
    "BUDGET_EXCEEDED_MESSAGE",
    "You've reached your usage limit. Visit the dashboard for details.",
)
ENCRYPTION_SECRET = os.getenv("ENCRYPTION_SECRET", "")
DISCORD_MAX_LENGTH = 2000
THREAD_MESSAGE_LIMIT = 100
BUDGET_USD = 10.0
INPUT_COST_PER_M = 1.30
OUTPUT_COST_PER_M = 1.5
