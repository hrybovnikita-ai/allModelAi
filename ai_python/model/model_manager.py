"""Model persistence and inference helpers."""

from __future__ import annotations

import random
import shutil
from pathlib import Path
from typing import Any, Dict

import torch

from config import (
    BEST_CHECKPOINT_PATH,
    DEVICE,
    INTENT_CLASSES,
    METRICS_PATH,
    MODEL_PATH,
    MODEL_PATH_ALT,
    MODEL_SLOT_A,
    MODEL_SLOT_B,
    MODELS_DIR,
)
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
    for path in (MODEL_PATH, MODEL_PATH_ALT, MODEL_SLOT_A, MODEL_SLOT_B, BEST_CHECKPOINT_PATH):
        if path.exists():
            path.unlink()


def slot_path(slot: str) -> Path:
    normalized = str(slot or "default").lower()
    if normalized in ("a", "slot_a"):
        return MODEL_SLOT_A
    if normalized in ("b", "slot_b"):
        return MODEL_SLOT_B
    if normalized in ("best", "checkpoint"):
        return BEST_CHECKPOINT_PATH
    return MODEL_PATH


def save_model_to_slot(model: AILearningBrain, slot: str = "default") -> Path:
    ensure_model_dirs()
    target = slot_path(slot)
    torch.save(model.state_dict(), target)
    if target == MODEL_PATH:
        shutil.copy2(MODEL_PATH, MODEL_PATH_ALT)
    return target


def load_model_from_slot(model: AILearningBrain, slot: str = "default") -> bool:
    source = slot_path(slot)
    if slot in ("default", "") and not source.exists():
        source = MODEL_PATH_ALT
    if not source.exists():
        return False
    state_dict = torch.load(source, map_location=DEVICE, weights_only=True)
    model.load_state_dict(state_dict)
    model.eval()
    return True


def save_best_checkpoint(model: AILearningBrain) -> None:
    ensure_model_dirs()
    torch.save(model.state_dict(), BEST_CHECKPOINT_PATH)


def export_model_bundle() -> Dict[str, Any]:
    import base64
    import json

    bundle: Dict[str, Any] = {"format": "allmodelai-pytorch-v1", "slots": {}}
    for name, path in (
        ("default", MODEL_PATH if MODEL_PATH.exists() else MODEL_PATH_ALT),
        ("a", MODEL_SLOT_A),
        ("b", MODEL_SLOT_B),
        ("best", BEST_CHECKPOINT_PATH),
    ):
        if path.exists():
            bundle["slots"][name] = base64.b64encode(path.read_bytes()).decode("ascii")
    if METRICS_PATH.exists():
        try:
            bundle["metrics"] = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            bundle["metrics"] = None
    return bundle


def import_model_bundle(bundle: Dict[str, Any]) -> Dict[str, Any]:
    import base64

    ensure_model_dirs()
    imported = []
    slots = bundle.get("slots") or {}
    slot_map = {
        "default": MODEL_PATH,
        "a": MODEL_SLOT_A,
        "b": MODEL_SLOT_B,
        "best": BEST_CHECKPOINT_PATH,
    }
    for name, dest in slot_map.items():
        encoded = slots.get(name)
        if not encoded:
            continue
        dest.write_bytes(base64.b64decode(encoded.encode("ascii")))
        imported.append(name)
        if name == "default":
            shutil.copy2(MODEL_PATH, MODEL_PATH_ALT)
    if bundle.get("metrics") and METRICS_PATH:
        METRICS_PATH.write_text(json.dumps(bundle["metrics"], indent=2), encoding="utf-8")
    return {"ok": True, "imported_slots": imported}


def build_prediction(
    model: AILearningBrain,
    text: str,
    encoded_tensor: torch.Tensor,
    slot: str = "default",
) -> Dict[str, Any]:
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
    active_path = slot_path(slot)
    return {
        "input": text,
        "predicted_class": predicted_class,
        "confidence": round(confidence * 100, 2),
        "probabilities": prob_breakdown,
        "response": random.choice(responses),
        "device": DEVICE.type,
        "model_status": "trained" if active_path.exists() else "untrained",
        "slot": str(slot or "default").lower(),
    }
