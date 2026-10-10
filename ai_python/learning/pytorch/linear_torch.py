"""PyTorch linear regression training loop (educational)."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from learning.training.limits import MAX_DATA_POINTS, MAX_EPOCHS, MIN_EPOCHS
from learning.training.validation import train_val_indices


class LinearModule(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.linear = nn.Linear(1, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.linear(x)


def train_pytorch_linear(
    *,
    learning_rate: float = 0.01,
    epochs: int = 150,
    seed: int = 42,
    data_points: int = 80,
    batch_size: int = 32,
    on_epoch: Optional[Callable[..., None]] = None,
) -> Dict[str, Any]:
    epochs = max(MIN_EPOCHS, min(int(epochs), MAX_EPOCHS))
    lr = float(max(1e-5, min(learning_rate, 1.0)))
    n = max(8, min(int(data_points), MAX_DATA_POINTS))
    batch_size = max(1, min(int(batch_size), n))

    rng = np.random.default_rng(seed)
    x = rng.uniform(-2.0, 2.0, size=(n, 1)).astype(np.float32)
    # Target relationship: y ≈ 3x + 2 (+ noise)
    y = (3.0 * x + 2.0 + rng.normal(0, 0.15, size=(n, 1))).astype(np.float32)

    x_t = torch.from_numpy(x)
    y_t = torch.from_numpy(y)

    torch.manual_seed(seed)
    model = LinearModule()
    criterion = nn.MSELoss()
    optimizer = torch.optim.SGD(model.parameters(), lr=lr)

    train_idx, val_idx = train_val_indices(n, seed)
    train_idx_t = torch.from_numpy(train_idx.astype(np.int64))
    val_idx_t = torch.from_numpy(val_idx.astype(np.int64))

    loss_history: List[float] = []
    validation_loss_history: List[float] = []
    weight_history: List[float] = []
    bias_history: List[float] = []
    for epoch in range(1, epochs + 1):
        perm = train_idx_t[torch.randperm(len(train_idx_t))]
        epoch_loss = 0.0
        steps = 0
        for start in range(0, len(perm), batch_size):
            idx = perm[start : start + batch_size]
            xb, yb = x_t[idx], y_t[idx]
            optimizer.zero_grad()
            preds = model(xb)
            loss = criterion(preds, yb)
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.item())
            steps += 1
        avg_loss = epoch_loss / max(steps, 1)
        with torch.no_grad():
            val_loss = float(criterion(model(x_t[val_idx_t]), y_t[val_idx_t]).item())
        loss_history.append(avg_loss)
        validation_loss_history.append(val_loss)
        w = float(model.linear.weight.item())
        b = float(model.linear.bias.item())
        weight_history.append(w)
        bias_history.append(b)
        if on_epoch:
            on_epoch(epoch, epochs, avg_loss, weight=w, bias=b, validation_loss=val_loss)

    with torch.no_grad():
        final_preds = model(x_t)
        final_loss = float(criterion(final_preds, y_t).item())
        w = float(model.linear.weight.item())
        b = float(model.linear.bias.item())

    return {
        "ok": True,
        "engine": "pytorch",
        "modelType": "linear-regression",
        "finalWeight": w,
        "finalBias": b,
        "finalLoss": final_loss,
        "lossHistory": loss_history,
        "validationLossHistory": validation_loss_history,
        "trainLoss": loss_history[-1] if loss_history else final_loss,
        "validationLoss": validation_loss_history[-1] if validation_loss_history else final_loss,
        "weightHistory": weight_history,
        "biasHistory": bias_history,
        "epochs": epochs,
        "learningRate": lr,
        "batchSize": batch_size,
        "stateDict": model.state_dict(),
    }
