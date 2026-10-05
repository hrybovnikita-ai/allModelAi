"""Deterministic unit tests for AI Learning Lab algorithms."""

from __future__ import annotations

import numpy as np
import pytest

from learning.gradient_descent.gd import train_gradient_descent
from learning.linear_regression.numpy_lr import predict_linear_numpy, train_linear_regression_numpy
from learning.pytorch.linear_torch import train_pytorch_linear
from learning.sklearn.linear_sklearn import run_sklearn_linear


def test_numpy_linear_regression_converges():
    out = train_linear_regression_numpy(
        learning_rate=0.08, epochs=400, seed=7, data_points=60
    )
    assert out["ok"] is True
    assert out["finalLoss"] < 0.5
    assert 1.5 < out["finalWeight"] < 3.5
    assert len(out["lossHistory"]) >= 2
    assert out["lossHistory"][-1] <= out["lossHistory"][0]


def test_gradient_descent_loss_decreases():
    out = train_gradient_descent(learning_rate=0.05, epochs=300, seed=11, data_points=40)
    assert out["finalLoss"] <= out["lossHistory"][0]
    assert min(out["lossHistory"]) <= out["lossHistory"][0]


def test_sklearn_linear_demo():
    out = run_sklearn_linear(seed=3)
    assert out["ok"] is True
    assert "coefficient" in out
    assert out["validationMse"] >= 0


def test_pytorch_linear_training():
    out = train_pytorch_linear(learning_rate=0.05, epochs=80, seed=2, data_points=50)
    assert out["engine"] == "pytorch"
    assert out["finalLoss"] < 1.0


def test_predict_linear_numpy():
    out = predict_linear_numpy([0.0, 1.0, 2.0], weight=2.0, bias=1.0)
    preds = [p["yPred"] for p in out["predictions"]]
    np.testing.assert_allclose(preds, [1.0, 3.0, 5.0], rtol=1e-5)
