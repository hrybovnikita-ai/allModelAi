"""Persist PyTorch state_dict + metadata under ai_python/storage/runs/."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import torch

_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = _ROOT / "storage" / "runs"
_RUN_ID_RE = re.compile(r"^run_[a-zA-Z0-9_-]+$")


def _safe_run_id(run_id: str) -> str:
    rid = str(run_id or "").strip()
    if not _RUN_ID_RE.match(rid):
        raise ValueError("Invalid run id")
    return rid


def save_run_model(run_id: str, state_dict: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    rid = _safe_run_id(run_id)
    folder = RUNS_DIR / rid
    folder.mkdir(parents=True, exist_ok=True)
    torch.save(state_dict, folder / "model.pt")
    meta = {
        **metadata,
        "runId": rid,
        "savedAt": datetime.now(timezone.utc).isoformat(),
    }
    (folder / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return str(folder.relative_to(_ROOT))


def load_run_metadata(run_id: str) -> Optional[Dict[str, Any]]:
    rid = _safe_run_id(run_id)
    path = RUNS_DIR / rid / "metadata.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_run_state_dict(run_id: str) -> Dict[str, Any]:
    rid = _safe_run_id(run_id)
    path = RUNS_DIR / rid / "model.pt"
    if not path.is_file():
        raise FileNotFoundError("Model weights not found for this run")
    return torch.load(path, map_location="cpu", weights_only=True)
