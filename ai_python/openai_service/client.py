"""OpenAI SDK client (inference only — not local ML training)."""

from __future__ import annotations

import os
from typing import Optional

from openai import OpenAI

_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    global _client
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    if _client is None:
        _client = OpenAI(api_key=key)
    return _client


def openai_configured() -> bool:
    return bool((os.getenv("OPENAI_API_KEY") or "").strip())
