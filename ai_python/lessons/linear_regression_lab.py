"""NumPy linear regression lab — real gradient descent, no mocked metrics."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np

from lessons.limits import DEFAULT_SNAPSHOT_EVERY, MAX_DATA_POINTS


def synthetic_dataset(
    n: int = 40,
    seed: int = 42,
    true_weight: float = 2.5,
    true_bias: float = 1.0,
    noise_std: float = 0.85,
) -> Tuple[List[float], List[float], float, float]:
    n = max(8, min(int(n), MAX_DATA_POINTS))
    rng = np.random.default_rng(int(seed) % (2**31))
    x = rng.uniform(0.0, 10.0, size=n)
    noise = rng.normal(0.0, noise_std, size=n)
    y = true_weight * x + true_bias + noise
    return x.astype(np.float64).tolist(), y.astype(np.float64).tolist(), true_weight, true_bias


def _line_points(x: np.ndarray, w: float, b: float) -> List[Dict[str, float]]:
    x_min = float(np.min(x))
    x_max = float(np.max(x))
    return [
        {"x": x_min, "y": w * x_min + b},
        {"x": x_max, "y": w * x_max + b},
    ]


def train_linear_regression(
    *,
    learning_rate: float,
    epochs: int,
    initial_weight: float = 0.0,
    initial_bias: float = 0.0,
    seed: int = 42,
    snapshot_every: int = DEFAULT_SNAPSHOT_EVERY,
    data_points: int = 40,
) -> Dict[str, Any]:
    x_list, y_list, true_w, true_b = synthetic_dataset(n=data_points, seed=seed)
    x = np.array(x_list, dtype=np.float64)
    y = np.array(y_list, dtype=np.float64)
    w = float(initial_weight)
    b = float(initial_bias)
    n = x.size
    history: List[Dict[str, Any]] = []
    snapshot_every = max(1, int(snapshot_every))

    before_line = _line_points(x, w, b)

    for epoch in range(1, epochs + 1):
        pred = w * x + b
        error = pred - y
        mse = float(np.mean(error**2))
        grad_w = (2.0 / n) * float(np.dot(error, x))
        grad_b = (2.0 / n) * float(np.sum(error))
        w -= learning_rate * grad_w
        b -= learning_rate * grad_b

        if epoch == 1 or epoch % snapshot_every == 0 or epoch == epochs:
            history.append(
                {
                    "epoch": epoch,
                    "loss": mse,
                    "weight": w,
                    "bias": b,
                    "gradWeight": grad_w,
                    "gradBias": grad_b,
                }
            )

    after_line = _line_points(x, w, b)
    scatter = [{"x": float(xi), "y": float(yi)} for xi, yi in zip(x, y)]

    return {
        "ok": True,
        "engine": "numpy",
        "formula": "y_hat = w * x + b",
        "loss": "mse",
        "trueWeight": true_w,
        "trueBias": true_b,
        "finalWeight": w,
        "finalBias": b,
        "finalLoss": history[-1]["loss"] if history else None,
        "learningRate": learning_rate,
        "epochs": epochs,
        "initialWeight": initial_weight,
        "initialBias": initial_bias,
        "scatter": scatter,
        "lineBefore": before_line,
        "lineAfter": after_line,
        "history": history,
        "pythonCode": (
            "import numpy as np\n"
            "w, b = 0.0, 0.0\n"
            "for epoch in range(epochs):\n"
            "    pred = w * x + b\n"
            "    error = pred - y\n"
            "    loss = np.mean(error ** 2)\n"
            "    w -= lr * (2/len(x)) * np.dot(error, x)\n"
            "    b -= lr * (2/len(x)) * np.sum(error)\n"
        ),
    }
