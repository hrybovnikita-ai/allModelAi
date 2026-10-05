"""Manual linear regression with NumPy (educational)."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np


def _synthetic_dataset(n: int, seed: int) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    x = rng.uniform(-2.0, 2.0, size=(n, 1)).astype(np.float64)
    noise = rng.normal(0, 0.15, size=(n, 1))
    y = 2.5 * x + 1.0 + noise
    return x, y


def train_linear_regression_numpy(
    *,
    learning_rate: float = 0.05,
    epochs: int = 200,
    seed: int = 42,
    data_points: int = 80,
) -> Dict[str, Any]:
    n = max(8, min(int(data_points), 500))
    epochs = max(5, min(int(epochs), 2000))
    lr = float(max(1e-5, min(learning_rate, 1.0)))

    x, y = _synthetic_dataset(n, seed)
    w = np.zeros((1, 1), dtype=np.float64)
    b = np.zeros((1,), dtype=np.float64)
    loss_history: List[float] = []

    for epoch in range(epochs):
        preds = x @ w + b
        error = preds - y
        loss = float(np.mean(error**2))
        loss_history.append(loss)

        grad_w = (2.0 / n) * (x.T @ error)
        grad_b = (2.0 / n) * np.sum(error, axis=0)
        w -= lr * grad_w
        b -= lr * grad_b

    preds = x @ w + b
    mse = float(np.mean((preds - y) ** 2))

    return {
        "ok": True,
        "engine": "numpy",
        "finalWeight": float(w.ravel()[0]),
        "finalBias": float(b.ravel()[0]),
        "finalLoss": mse,
        "lossHistory": loss_history[-100:],
        "epochs": epochs,
        "learningRate": lr,
        "samplePredictions": [
            {"x": float(x[i, 0]), "yTrue": float(y[i, 0]), "yPred": float(preds[i, 0])}
            for i in range(min(5, n))
        ],
    }


def predict_linear_numpy(x_values: List[float], weight: float, bias: float) -> Dict[str, Any]:
    xs = np.array(x_values, dtype=np.float64).reshape(-1, 1)
    preds = xs * weight + bias
    return {
        "ok": True,
        "predictions": [{"x": float(x), "yPred": float(p)} for x, p in zip(xs.ravel(), preds.ravel())],
    }
