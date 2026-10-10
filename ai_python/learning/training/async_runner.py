"""Background training threads with epoch callbacks."""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, Dict

from learning.training import jobs
from learning.training.limits import MAX_CONCURRENT_JOBS, TRAINING_TIMEOUT_SEC
from models.model_storage import save_run_model


def _running_count() -> int:
    return sum(1 for j in jobs.list_jobs() if j.get("status") in ("queued", "training"))


def start_training_job(
    model_type: str,
    params: Dict[str, Any],
    train_fn: Callable[..., Dict[str, Any]],
) -> str:
    if _running_count() >= MAX_CONCURRENT_JOBS:
        raise RuntimeError("Too many concurrent training jobs. Wait for one to finish.")
    job_id = jobs.create_job(model_type, params, status="queued")
    thread = threading.Thread(target=_worker, args=(job_id, model_type, params, train_fn), daemon=True)
    thread.start()
    return job_id


def _worker(job_id: str, model_type: str, params: Dict[str, Any], train_fn: Callable[..., Dict[str, Any]]) -> None:
    jobs.update_job(job_id, status="training")
    started = time.time()

    def on_epoch(epoch: int, total: int, loss: float, **extra: Any) -> None:
        if time.time() - started > TRAINING_TIMEOUT_SEC:
            raise TimeoutError("Training timeout exceeded")
        patch: Dict[str, Any] = {
            "currentEpoch": epoch,
            "totalEpochs": total,
            "loss": loss,
        }
        if "accuracy" in extra:
            patch["accuracy"] = extra["accuracy"]
            jobs.append_accuracy(job_id, float(extra["accuracy"]))
        if "validation_loss" in extra:
            patch["validationLoss"] = extra["validation_loss"]
            jobs.append_validation_loss(job_id, float(extra["validation_loss"]))
        if "weight" in extra:
            patch["weight"] = extra["weight"]
        if "bias" in extra:
            patch["bias"] = extra["bias"]
        jobs.append_loss(job_id, float(loss))
        jobs.update_job(job_id, **patch)

    try:
        result = train_fn(on_epoch=on_epoch, **params)
        state = result.pop("stateDict", None)
        rel_path = None
        if state is not None:
            rel_path = save_run_model(
                job_id,
                state,
                {
                    "modelType": model_type,
                    "epochs": result.get("epochs"),
                    "finalLoss": result.get("finalLoss"),
                    "finalAccuracy": result.get("finalAccuracy"),
                    "finalWeight": result.get("finalWeight"),
                    "finalBias": result.get("finalBias"),
                },
            )
        result["storagePath"] = rel_path
        jobs.complete_job(job_id, result)
    except Exception as exc:
        jobs.fail_job(job_id, str(exc))
