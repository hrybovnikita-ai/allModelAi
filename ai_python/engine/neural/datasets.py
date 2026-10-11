"""Reusable synthetic datasets for educational training."""

from __future__ import annotations

from typing import Tuple

import numpy as np


def linear_regression_dataset(
    n: int = 80,
    seed: int = 42,
    weight: float = 2.5,
    bias: float = 1.2,
    noise: float = 0.35,
) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    x = rng.uniform(-2, 2, size=(n, 1)).astype(np.float64)
    y = (weight * x.ravel() + bias + rng.normal(0, noise, size=n)).astype(np.float64)
    return x, y


def binary_classification_dataset(
    n: int = 200,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    n0 = n // 2
    x0 = rng.normal(loc=[-1.0, -0.5], scale=0.7, size=(n0, 2))
    x1 = rng.normal(loc=[1.0, 0.8], scale=0.7, size=(n - n0, 2))
    x = np.vstack([x0, x1]).astype(np.float64)
    y = np.concatenate([np.zeros(n0), np.ones(n - n0)]).astype(np.int64)
    perm = rng.permutation(n)
    return x[perm], y[perm]
