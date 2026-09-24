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
    DEFAULT_BATCH_SIZE,
    DEFAULT_EPOCHS,
    DEFAULT_LR,
    DEVICE,
    INTENT_CLASSES,
    MODEL_PATH,
)
from model.model_manager import (
    build_prediction,
    delete_saved_weights,
    load_model_weights,
    save_model_weights,
)
from model.neural_network import AILearningBrain
from training.dataset import load_training_samples, load_validation_samples
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
        self.best_loss: float = 999.0
        self.last_accuracy: float = 0.0
        self.started_at: Optional[float] = None
        self.completed_at: Optional[float] = None

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
            )
            self._log(f"Saved optimized model weights to {MODEL_PATH.name}")
        except OSError as exc:
            self._log(f"Failed to save model: {exc}")

    def reset_model(self) -> None:
        with self.lock:
            self.model = AILearningBrain().to(DEVICE)
            self.loss_history = []
            self.accuracy_history = []
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

    def run_training(
        self,
        epochs: int = DEFAULT_EPOCHS,
        lr: float = DEFAULT_LR,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> bool:
        with self.lock:
            if self.is_training:
                return False
            self.is_training = True

        self.current_epoch = 0
        self.total_epochs = epochs
        self.started_at = time.time()
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

                for batch_index in range(batches):
                    batch_idx = indices[
                        batch_index * batch_size : (batch_index + 1) * batch_size
                    ]
                    batch_x, batch_y = x_data[batch_idx], y_data[batch_idx]

                    optimizer.zero_grad()
                    outputs = self.model(batch_x)
                    loss = criterion(outputs, batch_y)
                    loss.backward()
                    nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=2.0)
                    optimizer.step()

                    epoch_loss += loss.item() * len(batch_idx)
                    preds = outputs.argmax(dim=1)
                    correct += (preds == batch_y).sum().item()

                scheduler.step()

                avg_loss = epoch_loss / dataset_size
                avg_acc = (correct / dataset_size) * 100.0

                self.current_epoch = epoch
                self.loss_history.append(round(avg_loss, 4))
                self.accuracy_history.append(round(avg_acc, 2))
                self.last_accuracy = avg_acc

                if avg_loss < self.best_loss:
                    self.best_loss = avg_loss

                if epoch == 1 or epoch % max(epochs // 10, 1) == 0 or epoch == epochs:
                    self._log(
                        f"Epoch {epoch:>3}/{epochs} | Loss: {avg_loss:.4f} | Accuracy: {avg_acc:.1f}%"
                    )

                time.sleep(0.015)

            self.model.eval()
            self._save_weights()
            validation = evaluate_samples(
                self.model, self.tokenizer, load_validation_samples()
            )
            if validation["count"]:
                self._log(
                    f"Validation accuracy: {validation['accuracy']}% on {validation['count']} samples"
                )

            duration = round(time.time() - (self.started_at or time.time()), 2)
            self._log(
                f"Training completed successfully in {duration}s! Final Accuracy: {avg_acc:.1f}%"
            )
        except Exception as exc:
            self._log(f"Training error: {exc}")
        finally:
            self.is_training = False
            self.completed_at = time.time()

        return True

    def predict(self, text: str) -> Dict[str, Any]:
        encoded = self.tokenizer.encode(text)
        return build_prediction(self.model, text, encoded)

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
            "classes": INTENT_CLASSES,
            "logs": self.logger.tail(15),
        }
