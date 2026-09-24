"""Model persistence and inference helpers."""

from __future__ import annotations

import random
import shutil
from pathlib import Path
from typing import Any, Dict

import torch

from config import DEVICE, INTENT_CLASSES, MODEL_PATH, MODEL_PATH_ALT, MODELS_DIR
from model.neural_network import AILearningBrain
from training.dataset import CLASS_RESPONSES


def ensure_model_dirs() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def save_model_weights(model: AILearningBrain) -> None:
    ensure_model_dirs()
    torch.save(model.state_dict(), MODEL_PATH)
    shutil.copy2(MODEL_PATH, MODEL_PATH_ALT)


def load_model_weights(model: AILearningBrain) -> bool:
    source = MODEL_PATH if MODEL_PATH.exists() else MODEL_PATH_ALT
    if not source.exists():
        return False
    state_dict = torch.load(source, map_location=DEVICE, weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    if source != MODEL_PATH:
        shutil.copy2(source, MODEL_PATH)
    return True


def delete_saved_weights() -> None:
    for path in (MODEL_PATH, MODEL_PATH_ALT):
        if path.exists():
            path.unlink()


def build_prediction(model: AILearningBrain, text: str, encoded_tensor: torch.Tensor) -> Dict[str, Any]:
    model.eval()
    with torch.inference_mode():
        logits = model(encoded_tensor.unsqueeze(0).to(DEVICE))
        probs = torch.softmax(logits, dim=1).squeeze(0)
        best_idx = int(probs.argmax().item())
        confidence = float(probs[best_idx].item())
        predicted_class = INTENT_CLASSES[best_idx]
        prob_breakdown = {
            INTENT_CLASSES[i]: round(float(probs[i].item()) * 100, 2)
            for i in range(len(INTENT_CLASSES))
        }

    responses = list(CLASS_RESPONSES.get(predicted_class, ["I have processed your request."]))
    if predicted_class == "system_info":
        responses.append(
            f"PyTorch Version: {torch.__version__} | Active Device: {DEVICE.type.upper()}"
        )
    return {
        "input": text,
        "predicted_class": predicted_class,
        "confidence": round(confidence * 100, 2),
        "probabilities": prob_breakdown,
        "response": random.choice(responses),
        "device": DEVICE.type,
        "model_status": "trained" if MODEL_PATH.exists() or MODEL_PATH_ALT.exists() else "untrained",
    }
