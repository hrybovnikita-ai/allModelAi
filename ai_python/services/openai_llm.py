"""OpenAI-assisted dataset generation for local PyTorch intent training."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Tuple

from config import INTENT_CLASSES

OPENAI_TRAINING_MODEL = os.getenv("OPENAI_TRAINING_MODEL", "gpt-4o-mini").strip()


def get_openai_api_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or os.getenv("IMAGE_API_KEY") or "").strip()


def openai_configured() -> bool:
    key = get_openai_api_key()
    return bool(key) and not key.startswith("sk-or-")


def get_openai_status() -> Dict[str, Any]:
    configured = openai_configured()
    return {
        "configured": configured,
        "model": OPENAI_TRAINING_MODEL if configured else None,
        "library": "openai",
        "purpose": "Generate labeled training utterances for local backprop training",
    }


def _parse_json_array(content: str) -> List[Dict[str, str]]:
    text = content.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    raw = json.loads(text)
    if not isinstance(raw, list):
        return []
    rows: List[Dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()
        utterance = str(item.get("text", item.get("utterance", ""))).strip()
        if utterance and label in INTENT_CLASSES:
            rows.append({"text": utterance, "label": label})
    return rows


def generate_labeled_samples(
    samples_per_class: int = 2,
) -> Tuple[List[Tuple[str, str]], Dict[str, Any]]:
    """
    Ask OpenAI for short user-style phrases per intent class.
    Returns (samples, meta) — never raises; meta carries error details.
    """
    if not openai_configured():
        return [], {"ok": False, "error": "OPENAI_API_KEY is not configured on the server", "added": 0}

    try:
        from openai import OpenAI
    except ImportError:
        return [], {"ok": False, "error": "Install openai: pip install openai", "added": 0}

    client = OpenAI(api_key=get_openai_api_key())
    class_list = ", ".join(INTENT_CLASSES)
    user_prompt = (
        f"Generate exactly {samples_per_class} diverse short user messages for EACH intent class.\n"
        f"Classes: {class_list}.\n"
        "Return ONLY a JSON array of objects with keys text and label.\n"
        "Each text must be 4-24 words, natural, unique, English or Russian.\n"
        "Do not include markdown outside the JSON array."
    )

    try:
        completion = client.chat.completions.create(
            model=OPENAI_TRAINING_MODEL,
            temperature=0.7,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You create labeled datasets for a small intent classifier. "
                        "Output valid JSON only."
                    ),
                },
                {"role": "user", "content": user_prompt},
            ],
        )
        content = completion.choices[0].message.content or "[]"
        parsed = _parse_json_array(content)
        samples = [(row["text"], row["label"]) for row in parsed]
        return samples, {
            "ok": True,
            "requested_per_class": samples_per_class,
            "generated": len(samples),
            "model": OPENAI_TRAINING_MODEL,
        }
    except Exception as exc:
        return [], {"ok": False, "error": str(exc), "added": 0}
