"""Automatic AI fallback policy for the Python AIRouter.

Mirrors backend/src/services/automaticFallback.js rules:
- retry timeouts, rate limits, temporary outages, quota exhaustion
- do NOT retry authentication or invalid-request errors
- bounded attempts + exponential backoff + visited-provider set
"""

from __future__ import annotations

import asyncio
import os
import random
from dataclasses import dataclass, field
from typing import Any, Optional

from utils.errors import ProviderError

RETRYABLE_CODES = frozenset({
    "RATE_LIMITED",
    "REQUEST_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
    "BAD_PROVIDER_RESPONSE",
})

NON_RETRYABLE_CODES = frozenset({
    "AUTHENTICATION_ERROR",
    "MISSING_API_KEY",
    "INVALID_PROVIDER",
    "INVALID_MODEL",
})


def max_attempts() -> int:
    raw = os.getenv("AI_FALLBACK_MAX_ATTEMPTS", "3")
    try:
        value = int(raw)
        return value if value > 0 else 3
    except ValueError:
        return 3


def backoff_base_ms() -> int:
    raw = os.getenv("AI_FALLBACK_BACKOFF_MS", "250")
    try:
        value = int(raw)
        return value if value > 0 else 250
    except ValueError:
        return 250


def compute_backoff_ms(attempt_index: int) -> int:
    base = backoff_base_ms()
    capped = min(base * (2 ** max(0, attempt_index)), 8000)
    jitter = random.randint(0, min(100, base))
    return capped + jitter


def may_retry(error: Optional[ProviderError]) -> bool:
    if error is None:
        return False
    if error.code in NON_RETRYABLE_CODES:
        return False
    if error.code in RETRYABLE_CODES:
        return True
    # Unknown provider errors: allow one recovery path for transient failures only.
    return error.status_code >= 500 or error.status_code == 429


@dataclass
class FallbackEvent:
    requested_provider: str
    actual_provider: str
    category: str
    success: bool
    latency_ms: float | None = None


@dataclass
class FallbackResult:
    result: Any
    requested_provider: str
    actual_provider: str
    fallback_used: bool
    events: list[FallbackEvent] = field(default_factory=list)

    def notice(self) -> Optional[str]:
        if not self.fallback_used:
            return None
        return (
            f"Answered with {self.actual_provider} after "
            f"{self.requested_provider} was unavailable."
        )


async def sleep_backoff(attempt_index: int) -> None:
    await asyncio.sleep(compute_backoff_ms(attempt_index) / 1000.0)
