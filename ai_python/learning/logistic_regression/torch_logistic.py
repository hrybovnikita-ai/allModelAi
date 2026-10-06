"""Binary logistic regression with PyTorch (educational)."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from learning.training.limits import MAX_DATA_POINTS, MAX_EPOCHS, MIN_EPOCHS


class LogisticModule(nn.Module):
    def __init__(self, in_features: int = 2) -> None:
        super().__init__()
        self.linear = nn.Linear(in_features, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.linear(x)


def _make_binary_data(n: int, seed: int) -> tuple[torch.Tensor, torch.Tensor]:
    rng = np.random.default_rng(seed)
    x0 = rng.normal(-1.2, 0.8, size=(n // 2, 2)).astype(np.float32)
    x1 = rng.normal(1.2, 0.8, size=(n - n // 2, 2)).astype(np.float32)
    x = np.vstack([x0, x1])
    y = np.concatenate([np.zeros(n // 2), np.ones(n - n // 2)]).astype(np.float32)
    perm = rng.permutation(n)
    return torch.from_numpy(x[perm]), torch.from_numpy(y).unsqueeze(1)


def train_logistic_regression(
    *,
    learning_rate: float = 0.05,
    epochs: int = 100,
    batch_size: int = 32,
    seed: int = 42,
    data_points: int = 200,
    on_epoch: Optional[Callable[..., None]] = None,
) -> Dict[str, Any]:
    epochs = max(MIN_EPOCHS, min(int(epochs), MAX_EPOCHS))
    batch_size = max(8, min(int(batch_size), 128))
    n = max(32, min(int(data_points), MAX_DATA_POINTS))
    lr = float(max(1e-5, min(learning_rate, 1.0)))

    x_t, y_t = _make_binary_data(n, seed)
    model = LogisticModule(2)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.SGD(model.parameters(), lr=lr)

    loss_history: List[float] = []
    accuracy_history: List[float] = []

    for epoch in range(1, epochs + 1):
        perm = torch.randperm(n)
        epoch_loss = 0.0
        steps = 0
        for start in range(0, n, batch_size):
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
            preds = (torch.sigmoid(model(x_t)) >= 0.5).float()
            acc = float((preds.eq(y_t).float().mean()).item())
        loss_history.append(avg_loss)
        accuracy_history.append(acc)
        if on_epoch:
            on_epoch(epoch, epochs, avg_loss, accuracy=acc, weight=float(model.linear.weight.mean()), bias=float(model.linear.bias.item()))

    return {
        "ok": True,
        "engine": "pytorch",
        "modelType": "logistic-regression",
        "finalLoss": loss_history[-1],
        "finalAccuracy": accuracy_history[-1],
        "lossHistory": loss_history,
        "accuracyHistory": accuracy_history,
        "epochs": epochs,
        "learningRate": lr,
        "batchSize": batch_size,
        "stateDict": model.state_dict(),
    }
