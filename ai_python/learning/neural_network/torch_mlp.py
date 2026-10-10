"""Small feed-forward neural network (educational)."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from learning.training.limits import MAX_DATA_POINTS, MAX_EPOCHS, MIN_EPOCHS
from learning.training.validation import train_val_indices


class SmallMLP(nn.Module):
    def __init__(self, in_features: int = 2, hidden: int = 16, out_features: int = 2) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.ReLU(),
            nn.Linear(hidden, out_features),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def _make_multiclass_data(n: int, seed: int) -> tuple[torch.Tensor, torch.Tensor]:
    rng = np.random.default_rng(seed)
    centers = np.array([[-1.5, -1.0], [1.5, 1.0], [0.0, 1.8]], dtype=np.float32)
    x_list, y_list = [], []
    per = n // 3
    for cls, center in enumerate(centers):
        chunk = rng.normal(center, 0.45, size=(per, 2)).astype(np.float32)
        x_list.append(chunk)
        y_list.append(np.full(per, cls, dtype=np.int64))
    x = np.vstack(x_list)
    y = np.concatenate(y_list)
    perm = rng.permutation(len(y))
    return torch.from_numpy(x[perm]), torch.from_numpy(y[perm])


def train_neural_network(
    *,
    learning_rate: float = 0.01,
    epochs: int = 80,
    batch_size: int = 32,
    seed: int = 42,
    data_points: int = 180,
    on_epoch: Optional[Callable[..., None]] = None,
) -> Dict[str, Any]:
    epochs = max(MIN_EPOCHS, min(int(epochs), MAX_EPOCHS))
    batch_size = max(8, min(int(batch_size), 128))
    n = max(48, min(int(data_points), MAX_DATA_POINTS))
    lr = float(max(1e-5, min(learning_rate, 1.0)))

    x_t, y_t = _make_multiclass_data(n, seed)
    model = SmallMLP(2, 16, 3)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    train_idx, val_idx = train_val_indices(n, seed)
    train_idx_t = torch.from_numpy(train_idx.astype(np.int64))
    val_idx_t = torch.from_numpy(val_idx.astype(np.int64))

    loss_history: List[float] = []
    validation_loss_history: List[float] = []
    accuracy_history: List[float] = []

    for epoch in range(1, epochs + 1):
        perm = train_idx_t[torch.randperm(len(train_idx_t))]
        epoch_loss = 0.0
        steps = 0
        for start in range(0, len(perm), batch_size):
            idx = perm[start : start + batch_size]
            xb, yb = x_t[idx], y_t[idx]
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.item())
            steps += 1
        avg_loss = epoch_loss / max(steps, 1)
        with torch.no_grad():
            val_logits = model(x_t[val_idx_t])
            val_loss = float(criterion(val_logits, y_t[val_idx_t]).item())
            acc = float((val_logits.argmax(dim=1).eq(y_t[val_idx_t]).float().mean()).item())
        loss_history.append(avg_loss)
        validation_loss_history.append(val_loss)
        accuracy_history.append(acc)
        if on_epoch:
            on_epoch(epoch, epochs, avg_loss, accuracy=acc, validation_loss=val_loss)

    return {
        "ok": True,
        "engine": "pytorch",
        "modelType": "neural-network",
        "finalLoss": loss_history[-1],
        "finalAccuracy": accuracy_history[-1],
        "lossHistory": loss_history,
        "validationLossHistory": validation_loss_history,
        "validationLoss": validation_loss_history[-1] if validation_loss_history else loss_history[-1],
        "accuracyHistory": accuracy_history,
        "epochs": epochs,
        "learningRate": lr,
        "batchSize": batch_size,
        "stateDict": model.state_dict(),
    }
