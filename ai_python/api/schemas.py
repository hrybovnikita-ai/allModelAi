"""Pydantic request models for the FastAPI service.

JSON shapes are mirrored in allModelAi/typescript (Zod + TS types) for Node/frontend clients.
"""

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
    slot: Optional[str] = None


class DatasetSampleRequest(BaseModel):
    text: str
    label: str


class ImportBundleRequest(BaseModel):
    bundle: dict


class OpenAiAugmentRequest(BaseModel):
    samples_per_class: Optional[int] = 2


class LabTrainRequest(BaseModel):
    learning_rate: Optional[float] = 0.01
    epochs: Optional[int] = 500
    initial_weight: Optional[float] = 0.0
    initial_bias: Optional[float] = 0.0
    seed: Optional[int] = 42
    data_points: Optional[int] = 40
    snapshot_every: Optional[int] = 10
