"""Central registry for neural engine algorithms."""

from __future__ import annotations

import inspect
from typing import Any, Callable, Dict, List

from learning.gradient_descent.gd import train_gradient_descent
from learning.linear_regression.numpy_lr import train_linear_regression_numpy
from learning.logistic_regression.torch_logistic import train_logistic_regression
from learning.neural_network.torch_mlp import train_neural_network
from learning.pytorch.linear_torch import train_pytorch_linear
from learning.sklearn.linear_sklearn import run_sklearn_linear
from learning.sklearn.logistic_sklearn import run_sklearn_logistic

TrainFn = Callable[..., Dict[str, Any]]

ALGORITHM_REGISTRY: Dict[str, Dict[str, Any]] = {
    "numpy-linear-regression": {
        "name": "Linear Regression (NumPy + gradient descent)",
        "engine": "numpy",
        "train": train_linear_regression_numpy,
        "default_params": {"learning_rate": 0.08, "epochs": 200, "seed": 42, "data_points": 80},
    },
    "gradient-descent": {
        "name": "Gradient Descent (1D regression lab)",
        "engine": "numpy",
        "train": train_gradient_descent,
        "default_params": {"learning_rate": 0.05, "epochs": 300, "seed": 11, "data_points": 40},
    },
    "pytorch-linear-regression": {
        "name": "Linear Regression (PyTorch)",
        "engine": "pytorch",
        "train": train_pytorch_linear,
        "default_params": {"learning_rate": 0.05, "epochs": 80, "seed": 7, "data_points": 120, "batch_size": 32},
    },
    "pytorch-logistic-regression": {
        "name": "Logistic Regression (PyTorch, binary)",
        "engine": "pytorch",
        "train": train_logistic_regression,
        "default_params": {"learning_rate": 0.05, "epochs": 100, "seed": 3, "data_points": 200, "batch_size": 32},
    },
    "pytorch-neural-network": {
        "name": "Neural Network (PyTorch MLP)",
        "engine": "pytorch",
        "train": train_neural_network,
        "default_params": {"learning_rate": 0.02, "epochs": 80, "seed": 1, "data_points": 180, "batch_size": 32},
    },
    "sklearn-linear-regression": {
        "name": "Linear Regression (scikit-learn)",
        "engine": "sklearn",
        "train": run_sklearn_linear,
        "default_params": {"seed": 3},
    },
    "sklearn-logistic-regression": {
        "name": "Logistic Regression (scikit-learn)",
        "engine": "sklearn",
        "train": run_sklearn_logistic,
        "default_params": {"seed": 42, "n": 240},
    },
}


def list_algorithms() -> List[Dict[str, Any]]:
    return [
        {
            "id": key,
            "name": meta["name"],
            "engine": meta["engine"],
            "defaultParams": meta.get("default_params", {}),
        }
        for key, meta in ALGORITHM_REGISTRY.items()
    ]


def run_algorithm(algorithm_id: str, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
    key = (algorithm_id or "").strip()
    meta = ALGORITHM_REGISTRY.get(key)
    if not meta:
        return {"ok": False, "error": f"Unknown algorithm: {algorithm_id}"}
    train_fn: TrainFn = meta["train"]
    merged = {**meta.get("default_params", {}), **(params or {})}
    sig = inspect.signature(train_fn)
    filtered = {k: v for k, v in merged.items() if k in sig.parameters}
    result = train_fn(**filtered)
    result["algorithmId"] = key
    return result
