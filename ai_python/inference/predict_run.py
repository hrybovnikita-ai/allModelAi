"""Load a saved run and run inference."""

from __future__ import annotations

from typing import Any, Dict, List

import torch
import torch.nn as nn

from learning.logistic_regression.torch_logistic import LogisticModule
from learning.neural_network.torch_mlp import SmallMLP
from learning.pytorch.linear_torch import LinearModule
from models.model_storage import load_run_metadata, load_run_state_dict


def predict_run(run_id: str, inputs: List[float]) -> Dict[str, Any]:
    meta = load_run_metadata(run_id)
    if not meta:
        raise FileNotFoundError("Run not found")
    model_type = meta.get("modelType") or "linear-regression"
    state = load_run_state_dict(run_id)

    if model_type == "linear-regression":
        model = LinearModule()
        model.load_state_dict(state)
        model.eval()
        x = torch.tensor([[float(inputs[0])]], dtype=torch.float32)
        with torch.no_grad():
            y = float(model(x).item())
        return {"ok": True, "prediction": y, "modelType": model_type}

    if model_type == "logistic-regression":
        if len(inputs) < 2:
            raise ValueError("Provide at least 2 features for logistic regression")
        model = LogisticModule(2)
        model.load_state_dict(state)
        model.eval()
        x = torch.tensor([inputs[:2]], dtype=torch.float32)
        with torch.no_grad():
            prob = float(torch.sigmoid(model(x)).item())
        return {"ok": True, "prediction": 1 if prob >= 0.5 else 0, "confidence": prob, "modelType": model_type}

    if model_type == "neural-network":
        if len(inputs) < 2:
            raise ValueError("Provide at least 2 features for neural network")
        model = SmallMLP(2, 16, 3)
        model.load_state_dict(state)
        model.eval()
        x = torch.tensor([inputs[:2]], dtype=torch.float32)
        with torch.no_grad():
            logits = model(x)
            probs = torch.softmax(logits, dim=1)
            cls = int(logits.argmax(dim=1).item())
            conf = float(probs[0, cls].item())
        return {"ok": True, "prediction": cls, "confidence": conf, "modelType": model_type}

    raise ValueError(f"Unsupported model type: {model_type}")
