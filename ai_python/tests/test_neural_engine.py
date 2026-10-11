"""Phase 2 — unified neural engine registry and metrics."""

from __future__ import annotations

import numpy as np

from engine.neural.datasets import binary_classification_dataset, linear_regression_dataset
from engine.neural.metrics import binary_classification_metrics, mean_squared_error
from engine.neural.registry import list_algorithms, run_algorithm
from learning.sklearn.logistic_sklearn import run_sklearn_logistic


def test_list_algorithms_includes_core_trainers():
    ids = {item["id"] for item in list_algorithms()}
    assert "pytorch-linear-regression" in ids
    assert "pytorch-logistic-regression" in ids
    assert "pytorch-neural-network" in ids
    assert "sklearn-logistic-regression" in ids


def test_run_algorithm_sklearn_logistic_reports_classification_metrics():
    out = run_algorithm("sklearn-logistic-regression", {"seed": 5, "n": 200})
    assert out["ok"] is True
    assert out["finalAccuracy"] >= 0.7
    assert 0 <= out["precision"] <= 1
    assert 0 <= out["recall"] <= 1
    assert 0 <= out["f1"] <= 1


def test_run_algorithm_pytorch_neural_network():
    out = run_algorithm(
        "pytorch-neural-network",
        {"epochs": 25, "learning_rate": 0.03, "data_points": 120, "early_stopping_patience": 5},
    )
    assert out["ok"] is True
    assert out["finalAccuracy"] > 0.4
    assert len(out["lossHistory"]) >= 5


def test_metrics_helpers():
    x, y = linear_regression_dataset(n=40, seed=1)
    preds = 2.5 * x.ravel() + 1.0
    mse = mean_squared_error(y, preds)
    assert mse < 0.5

    bx, by = binary_classification_dataset(n=100, seed=2)
    pred = (bx[:, 0] > 0).astype(int)
    stats = binary_classification_metrics(by, pred)
    assert "f1" in stats
    assert stats["accuracy"] >= 0


def test_neural_checkpoint_optional():
    out = run_algorithm(
        "pytorch-neural-network",
        {
            "epochs": 15,
            "run_id": "run_test_ckpt",
            "data_points": 90,
        },
    )
    assert out["ok"] is True
    assert out.get("checkpointPath") is not None or out.get("earlyStoppedEpoch") is not None
