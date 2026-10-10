"""Model Lab API (/training/*) — async local ML + OpenAI inference."""

from __future__ import annotations

from typing import Any, List, Literal, Optional

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel, Field
except ImportError:
    APIRouter = None  # type: ignore[misc, assignment]
    BaseModel = object  # type: ignore[misc, assignment]

from inference.predict_run import predict_run
from learning.logistic_regression.torch_logistic import train_logistic_regression
from learning.neural_network.torch_mlp import train_neural_network
from learning.pytorch.linear_torch import train_pytorch_linear
from learning.training.async_runner import start_training_job
from learning.training import jobs
from learning.training.sklearn_lab import train_sklearn_linear_lab, train_sklearn_logistic_lab
from learning.training.limits import MAX_BATCH_SIZE, MAX_EPOCHS, MIN_EPOCHS, MIN_LEARNING_RATE, MAX_LEARNING_RATE
from openai_service.fine_tuning import fine_tuning_enabled, validate_jsonl_lines
from openai_service.inference import chat_completion
from openai_service.client import openai_configured


MODEL_CATALOG = [
    {"id": "linear-regression", "name": "Linear Regression", "engine": "pytorch-local"},
    {"id": "logistic-regression", "name": "Logistic Regression", "engine": "pytorch-local"},
    {"id": "neural-network", "name": "Neural Network", "engine": "pytorch-local"},
    {"id": "sklearn-linear-regression", "name": "Linear Regression (scikit-learn)", "engine": "sklearn"},
    {"id": "sklearn-logistic-regression", "name": "Logistic Regression (scikit-learn)", "engine": "sklearn"},
    {"id": "openai", "name": "OpenAI API", "engine": "openai-api"},
]


class StartTrainingRequest(BaseModel):
    modelType: Literal[
        "linear-regression",
        "logistic-regression",
        "neural-network",
        "sklearn-linear-regression",
        "sklearn-logistic-regression",
    ]
    epochs: int = Field(100, ge=MIN_EPOCHS, le=MAX_EPOCHS)
    learningRate: float = Field(0.01, ge=MIN_LEARNING_RATE, le=MAX_LEARNING_RATE)
    batchSize: int = Field(32, ge=1, le=MAX_BATCH_SIZE)
    seed: int = Field(42, ge=0, le=10_000)
    dataPoints: int = Field(120, ge=32, le=512)


class PredictRunRequest(BaseModel):
    inputs: List[float] = Field(..., min_length=1, max_length=20)


class OpenAiChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    model: Optional[str] = None


class JsonlValidateRequest(BaseModel):
    lines: List[str] = Field(default_factory=list, max_length=500)


def _train_dispatch(model_type: str):
    if model_type == "linear-regression":
        return train_pytorch_linear
    if model_type == "logistic-regression":
        return train_logistic_regression
    if model_type == "sklearn-linear-regression":
        return train_sklearn_linear_lab
    if model_type == "sklearn-logistic-regression":
        return train_sklearn_logistic_lab
    return train_neural_network


def register_training_lab_routes(app: Any) -> None:
    if APIRouter is None:
        return

    router = APIRouter(prefix="/training", tags=["training-lab"])

    @router.get("/health")
    def training_health():
        return {
            "ok": True,
            "service": "ai_python_training_lab",
            "openaiConfigured": openai_configured(),
            "fineTuningEnabled": fine_tuning_enabled(),
        }

    @router.get("/models")
    def list_models():
        return {"ok": True, "models": MODEL_CATALOG}

    @router.post("/start")
    def start_training(req: StartTrainingRequest):
        params = {
            "learning_rate": req.learningRate,
            "epochs": req.epochs,
            "batch_size": req.batchSize,
            "seed": req.seed,
            "data_points": req.dataPoints,
        }
        try:
            run_id = start_training_job(req.modelType, params, _train_dispatch(req.modelType))
        except RuntimeError as exc:
            raise HTTPException(status_code=429, detail=str(exc)) from exc
        return {"ok": True, "runId": run_id, "status": "queued"}

    @router.get("/{run_id}")
    def get_run(run_id: str):
        job = jobs.get_job(run_id)
        if not job:
            raise HTTPException(status_code=404, detail="Training run not found")
        return {"ok": True, **job}

    @router.post("/{run_id}/predict")
    def predict_for_run(run_id: str, req: PredictRunRequest):
        job = jobs.get_job(run_id)
        if not job or job.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Training run is not completed")
        try:
            return predict_run(run_id, req.inputs)
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/openai/chat")
    def openai_chat(req: OpenAiChatRequest):
        out = chat_completion(req.prompt, req.model)
        if not out.get("ok"):
            raise HTTPException(status_code=503, detail=out.get("error", "OpenAI unavailable"))
        return out

    @router.post("/openai/validate-jsonl")
    def openai_validate_jsonl(req: JsonlValidateRequest):
        return validate_jsonl_lines(req.lines)

    app.include_router(router)
