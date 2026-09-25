"""Persist training metrics for the frontend charts."""

from __future__ import annotations

import json
import time
from typing import Any, Dict, List

from config import METRICS_PATH


def load_metrics() -> Dict[str, Any]:
    if not METRICS_PATH.exists():
        return {}
    try:
        return json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_metrics(
    loss_history: List[float],
    accuracy_history: List[float],
    best_loss: float,
    last_accuracy: float,
    gradient_history: List[Dict[str, Any]] | None = None,
) -> None:
    payload = {
        "loss_history": loss_history[-100:],
        "accuracy_history": accuracy_history[-100:],
        "best_loss": round(float(best_loss), 4),
        "last_accuracy": round(float(last_accuracy), 4),
        "gradient_history": (gradient_history or [])[-100:],
        "saved_at": time.time(),
    }
    METRICS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
