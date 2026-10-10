"""In-memory training job registry for educational experiments."""

from __future__ import annotations

import threading
import uuid
from typing import Any, Dict, Optional

_lock = threading.Lock()
_jobs: Dict[str, Dict[str, Any]] = {}


def create_job(kind: str, params: Dict[str, Any], status: str = "running") -> str:
    job_id = f"run_{uuid.uuid4().hex[:12]}"
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "runId": job_id,
            "kind": kind,
            "status": status,
            "params": params,
            "currentEpoch": 0,
            "totalEpochs": int(params.get("epochs", 0)),
            "loss": None,
            "accuracy": None,
            "weight": None,
            "bias": None,
            "learningRate": params.get("learning_rate"),
            "metrics": {},
            "lossHistory": [],
            "validationLossHistory": [],
            "accuracyHistory": [],
            "result": None,
            "error": None,
            "startedAt": None,
            "completedAt": None,
        }
    return job_id


def list_jobs() -> list[Dict[str, Any]]:
    with _lock:
        return [dict(j) for j in _jobs.values()]


def append_loss(job_id: str, value: float) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.setdefault("lossHistory", []).append(value)


def append_validation_loss(job_id: str, value: float) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.setdefault("validationLossHistory", []).append(value)


def append_accuracy(job_id: str, value: float) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.setdefault("accuracyHistory", []).append(value)


def update_job(job_id: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.update(fields)


def complete_job(job_id: str, result: Dict[str, Any]) -> None:
    import datetime

    update_job(job_id, status="completed", result=result, completedAt=datetime.datetime.utcnow().isoformat() + "Z")


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
        "lossHistory": job.get("lossHistory") or (job.get("result") or {}).get("lossHistory", []),
        "validationLossHistory": job.get("validationLossHistory")
        or (job.get("result") or {}).get("validationLossHistory", []),
        "accuracyHistory": job.get("accuracyHistory") or (job.get("result") or {}).get("accuracyHistory", []),
        "checkpointPath": (job.get("result") or {}).get("storagePath"),
        "accuracy": job.get("accuracy"),
        "weight": job.get("weight"),
        "bias": job.get("bias"),
    }
