"""Linear-layer gradient norms after backpropagation (PyTorch autograd)."""

from __future__ import annotations

from typing import Any, Dict, List

import torch.nn as nn


def linear_layer_gradient_snapshot(model: nn.Module) -> Dict[str, Any]:
    """Collect L2 norms of gradients on each nn.Linear weight and bias."""
    layers: List[Dict[str, float | str]] = []
    total_sq = 0.0

    for name, module in model.named_modules():
        if not isinstance(module, nn.Linear):
            continue
        weight_norm = 0.0
        bias_norm = 0.0
        if module.weight.grad is not None:
            weight_norm = float(module.weight.grad.detach().norm(2).item())
            total_sq += weight_norm ** 2
        if module.bias is not None and module.bias.grad is not None:
            bias_norm = float(module.bias.grad.detach().norm(2).item())
            total_sq += bias_norm ** 2
        layers.append(
            {
                "name": name or "linear",
                "weight_grad_l2": round(weight_norm, 6),
                "bias_grad_l2": round(bias_norm, 6),
            }
        )

    return {
        "layers": layers,
        "total_linear_grad_l2": round(total_sq ** 0.5, 6),
    }
