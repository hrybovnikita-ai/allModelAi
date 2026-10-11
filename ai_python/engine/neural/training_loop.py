"""Early stopping and checkpoint helpers for PyTorch trainers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class EarlyStoppingState:
    patience: int = 8
    min_delta: float = 1e-4
    best_loss: float = field(default=float("inf"))
    best_epoch: int = 0
    wait: int = 0
    stopped_epoch: Optional[int] = None

    def step(self, epoch: int, validation_loss: float) -> bool:
        """Returns True if training should stop."""
        if validation_loss < self.best_loss - self.min_delta:
            self.best_loss = validation_loss
            self.best_epoch = epoch
            self.wait = 0
            return False
        self.wait += 1
        if self.wait >= self.patience:
            self.stopped_epoch = epoch
            return True
        return False


def maybe_save_checkpoint(
    *,
    run_id: Optional[str],
    state_dict: Dict[str, Any],
    metadata: Dict[str, Any],
) -> Optional[str]:
    if not run_id:
        return None
    from models.model_storage import save_run_model

    return save_run_model(run_id, state_dict, metadata)
