"""Wrap scikit-learn trainers for Model Lab job lifecycle."""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from learning.sklearn.linear_sklearn import run_sklearn_linear
from learning.sklearn.logistic_sklearn import run_sklearn_logistic


def train_sklearn_linear_lab(
    *,
    seed: int = 42,
    data_points: int = 120,
    on_epoch: Optional[Callable[..., None]] = None,
    **_: Any,
) -> Dict[str, Any]:
    result = run_sklearn_linear(seed=seed, n=int(data_points))
    if on_epoch:
        on_epoch(
            1,
            1,
            float(result.get("finalLoss") or 0),
            validation_loss=float(result.get("validationLoss") or 0),
        )
    return result


def train_sklearn_logistic_lab(
    *,
    seed: int = 42,
    data_points: int = 240,
    on_epoch: Optional[Callable[..., None]] = None,
    **_: Any,
) -> Dict[str, Any]:
    result = run_sklearn_logistic(seed=seed, n=int(data_points))
    if on_epoch:
        on_epoch(
            1,
            1,
            float(result.get("finalLoss") or 0),
            accuracy=float(result.get("finalAccuracy") or 0),
            validation_loss=float(result.get("validationLoss") or 0),
        )
    return result
