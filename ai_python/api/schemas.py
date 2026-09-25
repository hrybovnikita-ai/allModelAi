"""Pydantic request models for the FastAPI service."""

from __future__ import annotations

from typing import Optional

try:
    from pydantic import BaseModel
except ImportError:

    class BaseModel:  # type: ignore[no-redef]
        pass


class TrainRequest(BaseModel):
    epochs: Optional[int] = 60
    lr: Optional[float] = 0.005
    batch_size: Optional[int] = 16
    openai_augment: Optional[bool] = False
    openai_samples_per_class: Optional[int] = 2


class PredictRequest(BaseModel):
    text: str


class OpenAiAugmentRequest(BaseModel):
    samples_per_class: Optional[int] = 2
