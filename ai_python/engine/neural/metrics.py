"""Classification and regression metrics (measured from arrays)."""

from __future__ import annotations

from typing import Any, Dict, Optional, Sequence

import numpy as np


def mean_squared_error(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    yt = np.asarray(y_true, dtype=np.float64)
    yp = np.asarray(y_pred, dtype=np.float64)
    return float(np.mean((yt - yp) ** 2))


def binary_classification_metrics(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    y_prob: Optional[Sequence[float]] = None,
) -> Dict[str, Any]:
    yt = np.asarray(y_true, dtype=np.int64)
    yp = np.asarray(y_pred, dtype=np.int64)
    tp = int(np.sum((yt == 1) & (yp == 1)))
    tn = int(np.sum((yt == 0) & (yp == 0)))
    fp = int(np.sum((yt == 0) & (yp == 1)))
    fn = int(np.sum((yt == 1) & (yp == 0)))
    accuracy = float((tp + tn) / max(len(yt), 1))
    precision = float(tp / max(tp + fp, 1))
    recall = float(tp / max(tp + fn, 1))
    f1 = float(2 * precision * recall / max(precision + recall, 1e-12))
    out: Dict[str, Any] = {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "confusion": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
    }
    if y_prob is not None:
        from sklearn.metrics import log_loss

        probs = np.asarray(y_prob, dtype=np.float64)
        out["crossEntropyLoss"] = float(log_loss(yt, np.column_stack([1 - probs, probs]), labels=[0, 1]))
    return out
