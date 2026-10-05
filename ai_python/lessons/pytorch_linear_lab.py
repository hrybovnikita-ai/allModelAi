"""Minimal PyTorch linear regression lab (Phase 1 preview)."""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from lessons.linear_regression_lab import synthetic_dataset
from lessons.limits import DEFAULT_SNAPSHOT_EVERY


def train_pytorch_linear(
    *,
    learning_rate: float,
    epochs: int,
    seed: int = 42,
    snapshot_every: int = DEFAULT_SNAPSHOT_EVERY,
    data_points: int = 40,
) -> Dict[str, Any]:
    try:
        import torch
        import torch.nn as nn
    except ImportError as exc:
        return {"ok": False, "error": f"PyTorch not installed: {exc}"}

    x_list, y_list, true_w, true_b = synthetic_dataset(n=data_points, seed=seed)
    x = torch.tensor(x_list, dtype=torch.float32).reshape(-1, 1)
    y = torch.tensor(y_list, dtype=torch.float32).reshape(-1, 1)

    torch.manual_seed(int(seed) % (2**31))
    model = nn.Linear(1, 1)
    with torch.no_grad():
        model.weight.fill_(0.0)
        model.bias.fill_(0.0)

    loss_fn = nn.MSELoss()
    optimizer = torch.optim.SGD(model.parameters(), lr=learning_rate)

    history: List[Dict[str, Any]] = []
    snapshot_every = max(1, int(snapshot_every))

    for epoch in range(1, epochs + 1):
        optimizer.zero_grad()
        pred = model(x)
        loss = loss_fn(pred, y)
        loss.backward()
        optimizer.step()

        if epoch == 1 or epoch % snapshot_every == 0 or epoch == epochs:
            w = float(model.weight.detach().cpu().numpy().reshape(-1)[0])
            b = float(model.bias.detach().cpu().numpy().reshape(-1)[0])
            history.append(
                {
                    "epoch": epoch,
                    "loss": float(loss.detach().cpu().numpy()),
                    "weight": w,
                    "bias": b,
                }
            )

    w_final = float(model.weight.detach().cpu().numpy().reshape(-1)[0])
    b_final = float(model.bias.detach().cpu().numpy().reshape(-1)[0])
    x_np = np.array(x_list, dtype=np.float64)
    x_min, x_max = float(np.min(x_np)), float(np.max(x_np))

    return {
        "ok": True,
        "engine": "pytorch",
        "pytorchVersion": torch.__version__,
        "trueWeight": true_w,
        "trueBias": true_b,
        "finalWeight": w_final,
        "finalBias": b_final,
        "finalLoss": history[-1]["loss"] if history else None,
        "learningRate": learning_rate,
        "epochs": epochs,
        "history": history,
        "lineAfter": [
            {"x": x_min, "y": w_final * x_min + b_final},
            {"x": x_max, "y": w_final * x_max + b_final},
        ],
        "scatter": [{"x": float(a), "y": float(bv)} for a, bv in zip(x_list, y_list)],
        "pythonCode": (
            "import torch\n"
            "import torch.nn as nn\n"
            "model = nn.Linear(1, 1)\n"
            "loss_fn = nn.MSELoss()\n"
            "opt = torch.optim.SGD(model.parameters(), lr=lr)\n"
            "for epoch in range(epochs):\n"
            "    opt.zero_grad()\n"
            "    loss = loss_fn(model(x), y)\n"
            "    loss.backward()\n"
            "    opt.step()\n"
        ),
    }
