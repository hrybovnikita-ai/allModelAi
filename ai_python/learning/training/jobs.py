"""In-memory training job registry for educational experiments."""

from __future__ import annotations

import threading
import uuid
from typing import Any, Dict, Optional

_lock = threading.Lock()
_jobs: Dict[str, Dict[str, Any]] = {}


def create_job(kind: str, params: Dict[str, Any]) -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "kind": kind,
            "status": "running",
            "params": params,
            "currentEpoch": 0,
            "totalEpochs": int(params.get("epochs", 0)),
            "loss": None,
            "learningRate": params.get("learning_rate"),
            "metrics": {},
            "result": None,
            "error": None,
        }
    return job_id


def update_job(job_id: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(fields)


def complete_job(job_id: str, result: Dict[str, Any]) -> None:
    update_job(job_id, status="completed", result=result)


def fail_job(job_id: str, message: str) -> None:
    update_job(job_id, status="failed", error=message)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def get_metrics(job_id: str) -> Optional[Dict[str, Any]]:
    job = get_job(job_id)
    if not job:
        return None
    return {
        "id": job_id,
        "status": job.get("status"),
        "currentEpoch": job.get("currentEpoch"),
        "totalEpochs": job.get("totalEpochs"),
        "loss": job.get("loss"),
        "learningRate": job.get("learningRate"),
        "metrics": job.get("metrics") or {},
        "lossHistory": (job.get("result") or {}).get("lossHistory", []),
    }
