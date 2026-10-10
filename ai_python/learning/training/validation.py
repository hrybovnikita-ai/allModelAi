"""Train/validation index splits for educational PyTorch loops."""

from __future__ import annotations

import numpy as np


def train_val_indices(n: int, seed: int, val_ratio: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    if n < 4:
        idx = np.arange(n)
        return idx, idx[:1]
    rng = np.random.default_rng(seed)
    perm = rng.permutation(n)
    val_count = max(1, min(n - 2, int(round(n * val_ratio))))
    val_idx = perm[:val_count]
    train_idx = perm[val_count:]
    return train_idx, val_idx
