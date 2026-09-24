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


class PredictRequest(BaseModel):
    text: str
