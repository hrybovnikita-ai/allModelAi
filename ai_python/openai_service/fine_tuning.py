"""OpenAI fine-tuning helpers — disabled by default (paid operations)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List


def fine_tuning_enabled() -> bool:
    return os.getenv("ENABLE_OPENAI_FINE_TUNING", "false").strip().lower() == "true"


def validate_jsonl_lines(lines: List[str]) -> Dict[str, Any]:
    errors: List[str] = []
    count = 0
    for i, line in enumerate(lines, start=1):
        text = line.strip()
        if not text:
            continue
        try:
            row = json.loads(text)
        except json.JSONDecodeError:
            errors.append(f"Line {i}: invalid JSON")
            continue
        if not isinstance(row, dict) or "messages" not in row:
            errors.append(f"Line {i}: expected {{messages: [...]}}")
            continue
        count += 1
    return {"ok": not errors, "validRows": count, "errors": errors}


def prepare_fine_tune_status(job_id: str) -> Dict[str, Any]:
    if not fine_tuning_enabled():
        return {
            "ok": False,
            "error": "OpenAI fine-tuning is disabled. Set ENABLE_OPENAI_FINE_TUNING=true only when you intend to run paid jobs.",
        }
    return {"ok": False, "error": "Fine-tuning job creation is not enabled in this build.", "jobId": job_id}
