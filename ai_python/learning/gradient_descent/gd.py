"""Explicit gradient descent steps on MSE (educational)."""

from __future__ import annotations

from typing import Any, Dict

from learning.linear_regression.numpy_lr import train_linear_regression_numpy


def train_gradient_descent(
    *,
    learning_rate: float = 0.05,
    epochs: int = 150,
    seed: int = 42,
    data_points: int = 60,
) -> Dict[str, Any]:
    result = train_linear_regression_numpy(
        learning_rate=learning_rate,
        epochs=epochs,
        seed=seed,
        data_points=data_points,
    )
    if result.get("ok"):
        result["engine"] = "numpy_gradient_descent"
        result["lab"] = "gradient_descent"
    return result
