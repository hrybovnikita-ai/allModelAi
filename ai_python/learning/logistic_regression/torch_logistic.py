"""Binary logistic regression with PyTorch (educational)."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from learning.training.limits import MAX_DATA_POINTS, MAX_EPOCHS, MIN_EPOCHS
from learning.training.validation import train_val_indices


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
    torch.manual_seed(seed)
    model = LogisticModule(2)
    criterion = nn.BCEWithLogitsLoss()
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
            preds = (torch.sigmoid(model(x_t[val_idx_t])) >= 0.5).float()
            acc = float((preds.eq(y_t[val_idx_t]).float().mean()).item())
        loss_history.append(avg_loss)
        validation_loss_history.append(val_loss)
        accuracy_history.append(acc)
        if on_epoch:
            on_epoch(
                epoch,
                epochs,
                avg_loss,
                accuracy=acc,
                weight=float(model.linear.weight.mean()),
                bias=float(model.linear.bias.item()),
                validation_loss=val_loss,
            )

    with torch.no_grad():
        full_preds = (torch.sigmoid(model(x_t)) >= 0.5).float()
        final_accuracy = float((full_preds.eq(y_t).float().mean()).item())

    return {
        "ok": True,
        "engine": "pytorch",
        "modelType": "logistic-regression",
        "finalLoss": loss_history[-1],
        "finalAccuracy": final_accuracy,
        "validationAccuracy": accuracy_history[-1] if accuracy_history else final_accuracy,
        "lossHistory": loss_history,
        "validationLossHistory": validation_loss_history,
        "validationLoss": validation_loss_history[-1] if validation_loss_history else loss_history[-1],
        "accuracyHistory": accuracy_history,
        "epochs": epochs,
        "learningRate": lr,
        "batchSize": batch_size,
        "stateDict": model.state_dict(),
    }
