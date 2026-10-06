"""FastAPI routes for the PyTorch AI service."""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING, Any, Optional

from config import DEFAULT_BATCH_SIZE, DEFAULT_EPOCHS, DEFAULT_LR, DEVICE

if TYPE_CHECKING:
    from training.trainer import TrainingManager

try:
    from fastapi import BackgroundTasks, FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse

    from api.schemas import (
        DatasetSampleRequest,
        ImportBundleRequest,
        LabTrainRequest,
        OpenAiAugmentRequest,
        PredictRequest,
        TrainRequest,
    )
    from lessons.catalog import get_lesson, list_catalog
    from lessons.limits import (
        MAX_EPOCHS,
        MAX_LEARNING_RATE,
        MAX_DATA_POINTS,
        MIN_EPOCHS,
        MIN_LEARNING_RATE,
    )
    from lessons.linear_regression_lab import train_linear_regression
    from lessons.pytorch_linear_lab import train_pytorch_linear
    from services.openai_llm import get_openai_status

    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    FastAPI = None  # type: ignore[misc, assignment]


def create_app(trainer: "TrainingManager") -> Optional[Any]:
    if not FASTAPI_AVAILABLE:
        return None

    app = FastAPI(title="AllModelAI PyTorch Service", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "pytorch_ai_service", "device": DEVICE.type}

    @app.get("/status")
    def status():
        return trainer.get_status()

    @app.get("/train/stream")
    async def train_stream():
        async def event_generator():
            while True:
                status = trainer.get_status()
                payload = json.dumps(status)
                yield f"data: {payload}\n\n"
                if not trainer.is_training:
                    yield f"data: {json.dumps({**status, 'stream_done': True})}\n\n"
                    break
                await asyncio.sleep(0.5)

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    @app.post("/train")
    def train(req: TrainRequest, bg_tasks: BackgroundTasks):
        if trainer.is_training:
            return {"error": "Training is already in progress", "status": "busy"}

        epochs = req.epochs or DEFAULT_EPOCHS
        lr = req.lr or DEFAULT_LR
        batch_size = req.batch_size or DEFAULT_BATCH_SIZE
        bg_tasks.add_task(
            trainer.run_training,
            epochs=epochs,
            lr=lr,
            batch_size=batch_size,
            openai_augment=bool(req.openai_augment),
            openai_samples_per_class=max(1, min(int(req.openai_samples_per_class or 2), 5)),
        )
        return {
            "message": "AI Training session initiated in background.",
            "epochs": epochs,
            "status": "started",
            "openai_augment": bool(req.openai_augment),
        }

    @app.get("/openai/status")
    def openai_status():
        return get_openai_status()

    @app.post("/openai/augment")
    def openai_augment(req: OpenAiAugmentRequest):
        if trainer.is_training:
            return {"ok": False, "error": "Training is already in progress"}
        per_class = max(1, min(int(req.samples_per_class or 2), 5))
        return trainer.augment_with_openai(samples_per_class=per_class)

    @app.post("/predict")
    def predict(req: PredictRequest):
        if not req.text.strip():
            return {"error": "Input text cannot be empty"}
        return trainer.predict(req.text, slot=req.slot)

    @app.post("/reset")
    def reset():
        trainer.reset_model()
        return {"message": "Model reset successfully", "status": "reset"}

    @app.get("/dataset")
    def dataset_list():
        return {"samples": trainer.list_dataset(), "total": len(trainer.list_dataset())}

    @app.post("/dataset")
    def dataset_add(req: DatasetSampleRequest):
        return trainer.create_dataset_sample(req.text, req.label)

    @app.delete("/dataset/{index}")
    def dataset_delete(index: int):
        return trainer.remove_dataset_sample(index)

    @app.get("/export")
    def export_weights():
        return trainer.export_bundle()

    @app.post("/import")
    def import_weights(req: ImportBundleRequest):
        return trainer.import_bundle(req.bundle)

    @app.post("/models/slot/{slot_id}")
    def save_slot(slot_id: str):
        return trainer.save_ab_slot(slot_id.lower())

    def _validate_lab(req: LabTrainRequest) -> dict[str, Any]:
        lr = float(req.learning_rate if req.learning_rate is not None else 0.01)
        epochs = int(req.epochs if req.epochs is not None else 500)
        if not (MIN_LEARNING_RATE <= lr <= MAX_LEARNING_RATE):
            return {"ok": False, "error": "learning_rate out of allowed range"}
        if not (MIN_EPOCHS <= epochs <= MAX_EPOCHS):
            return {"ok": False, "error": "epochs out of allowed range"}
        data_points = int(req.data_points or 40)
        if data_points < 8 or data_points > MAX_DATA_POINTS:
            return {"ok": False, "error": "data_points out of allowed range"}
        return {
            "ok": True,
            "learning_rate": lr,
            "epochs": epochs,
            "initial_weight": float(req.initial_weight or 0.0),
            "initial_bias": float(req.initial_bias or 0.0),
            "seed": int(req.seed or 42),
            "data_points": data_points,
            "snapshot_every": max(1, min(int(req.snapshot_every or 10), 100)),
        }

    @app.get("/labs/lessons")
    def labs_lessons():
        return list_catalog()

    @app.get("/labs/lessons/{lesson_id}")
    def labs_lesson_detail(lesson_id: str):
        lesson = get_lesson(lesson_id)
        if not lesson:
            return {"error": "Lesson not found", "ok": False}
        return {"ok": True, "lesson": lesson}

    @app.post("/labs/linear-regression/train")
    def labs_linear_regression_train(req: LabTrainRequest):
        validated = _validate_lab(req)
        if not validated.get("ok"):
            return validated
        return train_linear_regression(
            learning_rate=validated["learning_rate"],
            epochs=validated["epochs"],
            initial_weight=validated["initial_weight"],
            initial_bias=validated["initial_bias"],
            seed=validated["seed"],
            data_points=validated["data_points"],
            snapshot_every=validated["snapshot_every"],
        )

    @app.post("/labs/gradient-descent/train")
    def labs_gradient_descent_train(req: LabTrainRequest):
        validated = _validate_lab(req)
        if not validated.get("ok"):
            return validated
        result = train_linear_regression(
            learning_rate=validated["learning_rate"],
            epochs=validated["epochs"],
            initial_weight=validated["initial_weight"],
            initial_bias=validated["initial_bias"],
            seed=validated["seed"],
            data_points=validated["data_points"],
            snapshot_every=validated["snapshot_every"],
        )
        if result.get("ok"):
            result["lab"] = "gradient_descent"
        return result

    @app.post("/labs/pytorch/train")
    def labs_pytorch_train(req: LabTrainRequest):
        validated = _validate_lab(req)
        if not validated.get("ok"):
            return validated
        return train_pytorch_linear(
            learning_rate=validated["learning_rate"],
            epochs=validated["epochs"],
            seed=validated["seed"],
            data_points=validated["data_points"],
            snapshot_every=validated["snapshot_every"],
        )

    from api.ai_learning_routes import register_ai_learning_routes
    from api.training_lab_routes import register_training_lab_routes

    register_ai_learning_routes(app)
    register_training_lab_routes(app)

    return app
