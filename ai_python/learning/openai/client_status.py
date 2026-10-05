"""OpenAI SDK status — key from environment only."""

from __future__ import annotations

import os
from typing import Any, Dict


def openai_status() -> Dict[str, Any]:
    key = (os.getenv("OPENAI_API_KEY") or os.getenv("OPEN_AI_API_KEY") or "").strip()
    return {
        "ok": True,
        "configured": bool(key),
        "note": "OpenAI calls use server-side OPENAI_API_KEY only; this is not model training.",
    }
