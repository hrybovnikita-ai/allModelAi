"""FastAPI routes for AI Learning Lab (/ai/*)."""

from __future__ import annotations

from typing import Any, List, Optional

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel, Field
except ImportError:
    APIRouter = None  # type: ignore[misc, assignment]
    BaseModel = object  # type: ignore[misc, assignment]

from learning.catalog import get_lesson, list_lessons
from learning.gradient_descent.gd import train_gradient_descent
from learning.linear_regression.numpy_lr import predict_linear_numpy, train_linear_regression_numpy
from learning.openai.client_status import openai_status
from learning.keras.intro import keras_dense_demo
from learning.pandas.basics import pandas_split_demo
from learning.pytorch.linear_torch import train_pytorch_linear
from learning.sklearn.linear_sklearn import run_sklearn_linear
from learning.training import jobs


class TrainRequest(BaseModel):
    learning_rate: float = Field(0.05, ge=1e-5, le=1.0)
    epochs: int = Field(150, ge=5, le=2000)
    seed: int = Field(42, ge=0, le=10_000)
    data_points: int = Field(80, ge=8, le=500)


class PredictRequest(BaseModel):
    x: List[float] = Field(..., min_length=1, max_length=20)
    weight: float
    bias: float


def register_ai_learning_routes(app: Any) -> None:
    if APIRouter is None:
        return

    router = APIRouter(prefix="/ai", tags=["ai-learning"])

    @router.get("/lessons")
    def ai_lessons():
        return list_lessons()

    @router.get("/lessons/{lesson_id}")
    def ai_lesson_detail(lesson_id: str):
        out = get_lesson(lesson_id)
        if not out.get("ok"):
            raise HTTPException(status_code=404, detail="Lesson not found")
        return out

    @router.post("/train/linear-regression")
    def train_linear(req: TrainRequest):
        job_id = jobs.create_job("linear-regression", req.model_dump())
        try:
            result = train_linear_regression_numpy(
                learning_rate=req.learning_rate,
                epochs=req.epochs,
                seed=req.seed,
                data_points=req.data_points,
            )
            jobs.update_job(
                job_id,
                currentEpoch=req.epochs,
                totalEpochs=req.epochs,
                loss=result.get("finalLoss"),
                metrics={"validationMse": result.get("finalLoss")},
            )
            jobs.complete_job(job_id, result)
            return {"ok": True, "trainingId": job_id, **result}
        except Exception as exc:
            jobs.fail_job(job_id, str(exc))
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/train/gradient-descent")
    def train_gd(req: TrainRequest):
        job_id = jobs.create_job("gradient-descent", req.model_dump())
        try:
            result = train_gradient_descent(
                learning_rate=req.learning_rate,
                epochs=req.epochs,
                seed=req.seed,
                data_points=req.data_points,
            )
            jobs.update_job(
                job_id,
                currentEpoch=req.epochs,
                totalEpochs=req.epochs,
                loss=result.get("finalLoss"),
            )
            jobs.complete_job(job_id, result)
            return {"ok": True, "trainingId": job_id, **result}
        except Exception as exc:
            jobs.fail_job(job_id, str(exc))
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/train/pytorch-linear")
    def train_torch(req: TrainRequest):
        job_id = jobs.create_job("pytorch-linear", req.model_dump())
        try:
            result = train_pytorch_linear(
                learning_rate=req.learning_rate,
                epochs=req.epochs,
                seed=req.seed,
                data_points=req.data_points,
            )
            jobs.update_job(
                job_id,
                currentEpoch=req.epochs,
                totalEpochs=req.epochs,
                loss=result.get("finalLoss"),
            )
            jobs.complete_job(job_id, result)
            return {"ok": True, "trainingId": job_id, **result}
        except Exception as exc:
            jobs.fail_job(job_id, str(exc))
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.post("/predict")
    def predict(req: PredictRequest):
        return predict_linear_numpy(req.x, req.weight, req.bias)

    @router.get("/training/{training_id}")
    def training_status(training_id: str):
        job = jobs.get_job(training_id)
        if not job:
            raise HTTPException(status_code=404, detail="Training job not found")
        return {"ok": True, **job}

    @router.get("/training/{training_id}/metrics")
    def training_metrics(training_id: str):
        metrics = jobs.get_metrics(training_id)
        if not metrics:
            raise HTTPException(status_code=404, detail="Training job not found")
        return {"ok": True, **metrics}

    @router.get("/demo/pandas")
    def demo_pandas(seed: int = 42):
        return pandas_split_demo(seed=seed)

    @router.get("/demo/sklearn")
    def demo_sklearn(seed: int = 42):
        return run_sklearn_linear(seed=seed)

    @router.get("/demo/keras")
    def demo_keras(seed: int = 42):
        return keras_dense_demo(seed=seed)

    @router.get("/openai/status")
    def ai_openai_status():
        return openai_status()

    app.include_router(router)
