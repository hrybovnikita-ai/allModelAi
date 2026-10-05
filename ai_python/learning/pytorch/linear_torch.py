"""PyTorch linear regression training loop (educational)."""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import torch
import torch.nn as nn


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
) -> Dict[str, Any]:
    epochs = max(5, min(int(epochs), 2000))
    lr = float(max(1e-5, min(learning_rate, 1.0)))
    n = max(8, min(int(data_points), 500))

    rng = np.random.default_rng(seed)
    x = rng.uniform(-2.0, 2.0, size=(n, 1)).astype(np.float32)
    y = (2.2 * x + 0.8 + rng.normal(0, 0.12, size=(n, 1))).astype(np.float32)

    x_t = torch.from_numpy(x)
    y_t = torch.from_numpy(y)

    torch.manual_seed(seed)
    model = LinearModule()
    criterion = nn.MSELoss()
    optimizer = torch.optim.SGD(model.parameters(), lr=lr)

    loss_history: List[float] = []
    for _ in range(epochs):
        optimizer.zero_grad()
        preds = model(x_t)
        loss = criterion(preds, y_t)
        loss.backward()
        optimizer.step()
        loss_history.append(float(loss.item()))

    with torch.no_grad():
        final_preds = model(x_t)
        final_loss = float(criterion(final_preds, y_t).item())
        w = float(model.linear.weight.item())
        b = float(model.linear.bias.item())

    return {
        "ok": True,
        "engine": "pytorch",
        "finalWeight": w,
        "finalBias": b,
        "finalLoss": final_loss,
        "lossHistory": loss_history[-100:],
        "epochs": epochs,
        "learningRate": lr,
    }
