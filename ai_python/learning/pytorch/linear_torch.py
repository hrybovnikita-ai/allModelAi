"""PyTorch linear regression training loop (educational)."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from learning.training.limits import MAX_DATA_POINTS, MAX_EPOCHS, MIN_EPOCHS


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

    loss_history: List[float] = []
    weight_history: List[float] = []
    bias_history: List[float] = []
    for epoch in range(1, epochs + 1):
        perm = torch.randperm(n)
        epoch_loss = 0.0
        steps = 0
        for start in range(0, n, batch_size):
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
        loss_history.append(avg_loss)
        w = float(model.linear.weight.item())
        b = float(model.linear.bias.item())
        weight_history.append(w)
        bias_history.append(b)
        if on_epoch:
            on_epoch(epoch, epochs, avg_loss, weight=w, bias=b)

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
        "weightHistory": weight_history,
        "biasHistory": bias_history,
        "epochs": epochs,
        "learningRate": lr,
        "batchSize": batch_size,
        "stateDict": model.state_dict(),
    }
