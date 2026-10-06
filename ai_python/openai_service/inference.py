"""OpenAI chat completions (API inference, separate from PyTorch training)."""

from __future__ import annotations

import os
from typing import Any, Dict

from openai_service.client import get_openai_client, openai_configured


def chat_completion(prompt: str, model: str | None = None) -> Dict[str, Any]:
    if not openai_configured():
        return {"ok": False, "error": "OPENAI_API_KEY is not configured"}
    client = get_openai_client()
    chosen = (model or os.getenv("OPENAI_TRAINING_MODEL") or "gpt-4o-mini").strip()
    response = client.chat.completions.create(
        model=chosen,
        messages=[
            {"role": "system", "content": "You are a concise ML tutor inside AllModelAI. Do not claim to train foundation models locally."},
            {"role": "user", "content": prompt[:4000]},
        ],
        max_tokens=512,
    )
    text = (response.choices[0].message.content or "").strip()
    return {"ok": True, "model": chosen, "text": text, "provider": "openai-api"}
