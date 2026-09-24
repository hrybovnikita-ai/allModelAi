"""Evaluate the classifier on validation or test splits."""

from __future__ import annotations

from typing import Dict, List, Tuple

import torch
import torch.nn as nn

from config import DEVICE, INTENT_CLASSES
from model.neural_network import AILearningBrain
from training.preprocess import TextTokenizer


def evaluate_samples(
    model: AILearningBrain,
    tokenizer: TextTokenizer,
    samples: List[Tuple[str, str]],
) -> Dict[str, float]:
    if not samples:
        return {"accuracy": 0.0, "loss": 0.0, "count": 0}

    class_to_idx = {name: index for index, name in enumerate(INTENT_CLASSES)}
    x_data = torch.stack([tokenizer.encode(text) for text, _ in samples]).to(DEVICE)
    y_data = torch.tensor([class_to_idx[label] for _, label in samples], dtype=torch.long).to(DEVICE)

    model.eval()
    criterion = nn.CrossEntropyLoss()
    with torch.inference_mode():
        outputs = model(x_data)
        loss = float(criterion(outputs, y_data).item())
        preds = outputs.argmax(dim=1)
        correct = int((preds == y_data).sum().item())

    count = len(samples)
    return {
        "accuracy": round((correct / count) * 100.0, 2),
        "loss": round(loss, 4),
        "count": count,
    }
