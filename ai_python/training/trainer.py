"""Training loop, status, and inference orchestration."""

from __future__ import annotations

import math
import threading
import time
from typing import Any, Dict, Optional

import torch
import torch.nn as nn
import torch.optim as optim

from config import (
    BEST_CHECKPOINT_PATH,
    DEFAULT_BATCH_SIZE,
    DEFAULT_EPOCHS,
    DEFAULT_LR,
    DEVICE,
    EARLY_STOP_PATIENCE,
    INTENT_CLASSES,
    MODEL_PATH,
    MODEL_SLOT_A,
    MODEL_SLOT_B,
)
from model.model_manager import (
    build_prediction,
    delete_saved_weights,
    export_model_bundle,
    import_model_bundle,
    load_model_from_slot,
    load_model_weights,
    save_best_checkpoint,
    save_model_to_slot,
    save_model_weights,
)
from model.gradients import linear_layer_gradient_snapshot
from model.neural_network import AILearningBrain
from services.openai_llm import generate_labeled_samples, get_openai_status
from training.dataset import (
    add_training_sample,
    append_training_samples,
    delete_training_sample,
    list_training_dataset,
    load_training_samples,
    load_validation_samples,
)
from training.evaluate import evaluate_samples
from training.metrics import load_metrics, save_metrics
from training.preprocess import TextTokenizer
from utils.logger import TrainingLogger


class TrainingManager:
    def __init__(self) -> None:
        self.training_samples = load_training_samples()
        self.tokenizer = TextTokenizer()
        self.tokenizer.build_vocab([text for text, _ in self.training_samples])

        self.model = AILearningBrain().to(DEVICE)
        self.logger = TrainingLogger()
        self.lock = threading.Lock()
        self.is_training = False
        self.current_epoch = 0
        self.total_epochs = 0
        self.loss_history: list[float] = []
        self.accuracy_history: list[float] = []
        self.gradient_history: list[dict] = []
        self.best_loss: float = 999.0
        self.last_accuracy: float = 0.0
        self.started_at: Optional[float] = None
        self.completed_at: Optional[float] = None
        self.last_training_step: Optional[Dict[str, Any]] = None
        self.val_loss_history: list[float] = []
        self.best_val_loss: float = 999.0
        self.early_stop_patience_left: int = EARLY_STOP_PATIENCE
        self.stopped_early: bool = False
        self.last_training_error: Optional[str] = None
        self.training_outcome: Optional[str] = None

        self._restore_metrics()
        self._load_weights()

    def _log(self, message: str) -> None:
        self.logger.log(message)

    def _restore_metrics(self) -> None:
        saved = load_metrics()
        if not saved:
            return
        self.loss_history = saved.get("loss_history", [])
        self.accuracy_history = saved.get("accuracy_history", [])
        self.best_loss = saved.get("best_loss", 999.0)
        self.last_accuracy = saved.get("last_accuracy", 0.0)
        self.gradient_history = saved.get("gradient_history", [])

    def _reload_training_data(self) -> None:
        self.training_samples = load_training_samples()
        self.tokenizer.build_vocab([text for text, _ in self.training_samples])

    def _load_weights(self) -> bool:
        loaded = load_model_weights(self.model)
        if loaded:
            self._log(f"Loaded existing weights from {MODEL_PATH.name}")
        return loaded

    def _save_weights(self) -> None:
        try:
            save_model_weights(self.model)
            save_metrics(
                self.loss_history,
                self.accuracy_history,
                self.best_loss,
                self.last_accuracy,
                self.gradient_history,
            )
            self._log(f"Saved optimized model weights to {MODEL_PATH.name}")
        except OSError as exc:
            self._log(f"Failed to save model: {exc}")

    def reset_model(self) -> None:
        with self.lock:
            self.model = AILearningBrain().to(DEVICE)
            self.loss_history = []
            self.accuracy_history = []
            self.gradient_history = []
            self.best_loss = 999.0
            self.last_accuracy = 0.0
            self.logger = TrainingLogger()
            delete_saved_weights()
            from config import METRICS_PATH

            if METRICS_PATH.exists():
                try:
                    METRICS_PATH.unlink()
                except OSError:
                    pass
            self._log("Model weights and history reset to initial state.")

    def _augment_dataset_openai(self, samples_per_class: int = 2) -> dict:
        generated, meta = generate_labeled_samples(samples_per_class=samples_per_class)
        added = append_training_samples(generated)
        if added:
            self._reload_training_data()
            self._log(f"OpenAI augmented dataset: +{added} samples (total {len(self.training_samples)})")
        meta["added"] = added
        meta["total_samples"] = len(self.training_samples)
        return meta

    def augment_with_openai(self, samples_per_class: int = 2) -> dict:
        with self.lock:
            if self.is_training:
                return {"ok": False, "error": "Training in progress", "added": 0}
        return self._augment_dataset_openai(samples_per_class=samples_per_class)

    def run_training(
        self,
        epochs: int = DEFAULT_EPOCHS,
        lr: float = DEFAULT_LR,
        batch_size: int = DEFAULT_BATCH_SIZE,
        openai_augment: bool = False,
        openai_samples_per_class: int = 2,
    ) -> bool:
        with self.lock:
            if self.is_training:
                return False

        if openai_augment:
            augment_meta = self._augment_dataset_openai(
                samples_per_class=openai_samples_per_class
            )
            if not augment_meta.get("ok"):
                self._log(f"OpenAI augment skipped: {augment_meta.get('error', 'unknown')}")
            elif augment_meta.get("added", 0) == 0:
                self._log("OpenAI augment returned no new unique samples.")

        with self.lock:
            if self.is_training:
                return False
            self.is_training = True

        self.current_epoch = 0
        self.total_epochs = epochs
        self.started_at = time.time()
        self.stopped_early = False
        self.last_training_error = None
        self.training_outcome = None
        self.early_stop_patience_left = EARLY_STOP_PATIENCE
        self.best_val_loss = 999.0
        self.val_loss_history = []
        self._log(
            f"Initiating PyTorch AI learning session: {epochs} epochs | lr={lr} | batch_size={batch_size}"
        )

        avg_acc = 0.0
        try:
            samples = self.training_samples
            class_to_idx = {name: index for index, name in enumerate(INTENT_CLASSES)}
            x_data = torch.stack([self.tokenizer.encode(text) for text, _ in samples]).to(DEVICE)
            y_data = torch.tensor(
                [class_to_idx[label] for _, label in samples], dtype=torch.long
            ).to(DEVICE)

            dataset_size = len(x_data)
            self.model.train()
            optimizer = optim.AdamW(self.model.parameters(), lr=lr, weight_decay=1e-4)
            criterion = nn.CrossEntropyLoss()
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

            for epoch in range(1, epochs + 1):
                indices = torch.randperm(dataset_size)
                epoch_loss = 0.0
                correct = 0
                batches = math.ceil(dataset_size / batch_size)

                last_grad_snapshot = None
                for batch_index in range(batches):
                    batch_idx = indices[
                        batch_index * batch_size : (batch_index + 1) * batch_size
                    ]
                    batch_x, batch_y = x_data[batch_idx], y_data[batch_idx]

                    optimizer.zero_grad()
                    outputs = self.model(batch_x)
                    loss = criterion(outputs, batch_y)
                    loss.backward()
                    last_grad_snapshot = linear_layer_gradient_snapshot(self.model)
                    self.last_training_step = {
                        "epoch": epoch,
                        "batch": batch_index + 1,
                        "batches_total": batches,
                        "loss": round(float(loss.item()), 6),
                        "backward": True,
                        "linear_gradients": last_grad_snapshot,
                    }
                    nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=2.0)
                    optimizer.step()

                    epoch_loss += loss.item() * len(batch_idx)
                    preds = outputs.argmax(dim=1)
                    correct += (preds == batch_y).sum().item()

                if last_grad_snapshot:
                    self.gradient_history.append(
                        {
                            "epoch": epoch,
                            **last_grad_snapshot,
                        }
                    )

                scheduler.step()

                avg_loss = epoch_loss / dataset_size
                avg_acc = (correct / dataset_size) * 100.0

                self.current_epoch = epoch
                self.loss_history.append(round(avg_loss, 4))
                self.accuracy_history.append(round(avg_acc, 2))
                self.last_accuracy = avg_acc

                if avg_loss < self.best_loss:
                    self.best_loss = avg_loss

                validation = evaluate_samples(
                    self.model, self.tokenizer, load_validation_samples()
                )
                val_loss = float(validation.get("loss") or 0.0)
                self.val_loss_history.append(round(val_loss, 4))
                if validation["count"] and val_loss < self.best_val_loss:
                    self.best_val_loss = val_loss
                    self.early_stop_patience_left = EARLY_STOP_PATIENCE
                    save_best_checkpoint(self.model)
                    self._log(
                        f"Early-stop checkpoint saved (val loss {val_loss:.4f}, acc {validation['accuracy']:.1f}%)"
                    )
                elif validation["count"]:
                    self.early_stop_patience_left -= 1
                    if self.early_stop_patience_left <= 0:
                        self.stopped_early = True
                        self._log(
                            f"Early stopping triggered after epoch {epoch} (best val loss {self.best_val_loss:.4f})"
                        )
                        break

                if last_grad_snapshot and (
                    epoch == 1 or epoch % max(epochs // 10, 1) == 0 or epoch == epochs
                ):
                    self._log(
                        f"Epoch {epoch:>3}/{epochs} | Loss: {avg_loss:.4f} | Accuracy: {avg_acc:.1f}% | "
                        f"Linear grad L2: {last_grad_snapshot['total_linear_grad_l2']:.4f}"
                    )
                elif epoch == 1 or epoch % max(epochs // 10, 1) == 0 or epoch == epochs:
                    self._log(
                        f"Epoch {epoch:>3}/{epochs} | Loss: {avg_loss:.4f} | Accuracy: {avg_acc:.1f}%"
                    )

                time.sleep(0.015)

            self.model.eval()
            if BEST_CHECKPOINT_PATH.exists() and self.stopped_early:
                load_model_from_slot(self.model, "best")
                self._log("Restored best checkpoint weights after early stopping.")
            self._save_weights()
            validation = evaluate_samples(
                self.model, self.tokenizer, load_validation_samples()
            )
            if validation["count"]:
                self._log(
                    f"Validation accuracy: {validation['accuracy']}% on {validation['count']} samples"
                )

            duration = round(time.time() - (self.started_at or time.time()), 2)
            self.training_outcome = "completed"
            self._log(
                f"Training completed successfully in {duration}s! Final Accuracy: {avg_acc:.1f}%"
            )
        except Exception as exc:
            self.last_training_error = str(exc)
            self.training_outcome = "failed"
            self._log(f"Training error: {exc}")
        finally:
            self.is_training = False
            self.completed_at = time.time()

        return True

    def predict(self, text: str, slot: Optional[str] = None) -> Dict[str, Any]:
        encoded = self.tokenizer.encode(text)
        normalized_slot = str(slot or "default").lower()
        if normalized_slot in ("default", ""):
            return build_prediction(self.model, text, encoded, slot="default")

        backup = {key: value.detach().clone() for key, value in self.model.state_dict().items()}
        loaded = load_model_from_slot(self.model, normalized_slot)
        if not loaded:
            return {
                "error": f"Model slot '{normalized_slot}' has no saved weights",
                "slot": normalized_slot,
            }
        try:
            result = build_prediction(self.model, text, encoded, slot=normalized_slot)
        finally:
            self.model.load_state_dict(backup)
            self.model.eval()
        return result

    def list_dataset(self) -> list[dict]:
        return list_training_dataset()

    def create_dataset_sample(self, text: str, label: str) -> dict:
        with self.lock:
            if self.is_training:
                return {"ok": False, "error": "Training in progress"}
            result = add_training_sample(text, label)
            if result.get("ok"):
                self._reload_training_data()
            return result

    def remove_dataset_sample(self, index: int) -> dict:
        with self.lock:
            if self.is_training:
                return {"ok": False, "error": "Training in progress"}
            result = delete_training_sample(index)
            if result.get("ok"):
                self._reload_training_data()
            return result

    def export_bundle(self) -> Dict[str, Any]:
        return export_model_bundle()

    def import_bundle(self, bundle: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            if self.is_training:
                return {"ok": False, "error": "Training in progress"}
            result = import_model_bundle(bundle)
            self._load_weights()
            self._restore_metrics()
            return result

    def save_ab_slot(self, slot: str) -> dict:
        with self.lock:
            if self.is_training:
                return {"ok": False, "error": "Training in progress"}
            if slot not in ("a", "b"):
                return {"ok": False, "error": "Slot must be a or b"}
            path = save_model_to_slot(self.model, slot)
            return {"ok": True, "slot": slot, "path": str(path)}

    def get_status(self) -> Dict[str, Any]:
        total_params = sum(p.numel() for p in self.model.parameters())
        return {
            "status": "training" if self.is_training else "ready",
            "is_training": self.is_training,
            "device": DEVICE.type,
            "pytorch_version": torch.__version__,
            "model_path": str(MODEL_PATH),
            "model_file_exists": MODEL_PATH.exists(),
            "total_parameters": total_params,
            "current_epoch": self.current_epoch,
            "total_epochs": self.total_epochs,
            "progress_percent": round(
                (self.current_epoch / self.total_epochs * 100) if self.total_epochs > 0 else 0,
                1,
            ),
            "last_loss": self.loss_history[-1] if self.loss_history else None,
            "best_loss": round(float(self.best_loss), 4) if self.best_loss < 900 else None,
            "last_accuracy": self.last_accuracy,
            "loss_history": self.loss_history[-40:],
            "accuracy_history": self.accuracy_history[-40:],
            "gradient_history": self.gradient_history[-40:],
            "training_samples": len(self.training_samples),
            "openai": get_openai_status(),
            "backprop": {
                "optimizer": "AdamW",
                "loss_function": "CrossEntropyLoss",
                "linear_layers": 3,
                "gradient_clipping": 2.0,
                "pipeline": [
                    "forward_pass",
                    "cross_entropy_loss",
                    "loss.backward()",
                    "linear_layer_gradients",
                    "clip_grad_norm_",
                    "optimizer.step()",
                ],
            },
            "last_training_step": self.last_training_step,
            "val_loss_history": self.val_loss_history[-40:],
            "early_stopping": {
                "enabled": True,
                "patience": EARLY_STOP_PATIENCE,
                "patience_left": self.early_stop_patience_left,
                "best_val_loss": round(self.best_val_loss, 4) if self.best_val_loss < 900 else None,
                "stopped_early": self.stopped_early,
                "best_checkpoint_exists": BEST_CHECKPOINT_PATH.exists(),
            },
            "training_outcome": self.training_outcome,
            "last_training_error": self.last_training_error,
            "model_slots": {
                "a": MODEL_SLOT_A.exists(),
                "b": MODEL_SLOT_B.exists(),
            },
            "classes": INTENT_CLASSES,
            "logs": self.logger.tail(15),
        }
