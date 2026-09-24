"""PyTorch classifier architecture."""

from __future__ import annotations

import torch
import torch.nn as nn

from config import HIDDEN_DIM, INTENT_CLASSES, VOCAB_SIZE


class AILearningBrain(nn.Module):
    def __init__(
        self,
        input_dim: int = VOCAB_SIZE,
        hidden_dim: int = HIDDEN_DIM,
        output_dim: int = len(INTENT_CLASSES),
    ) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)
