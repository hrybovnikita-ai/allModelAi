"""FastAPI routes for the PyTorch AI service."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from config import DEFAULT_BATCH_SIZE, DEFAULT_EPOCHS, DEFAULT_LR, DEVICE

if TYPE_CHECKING:
    from training.trainer import TrainingManager

try:
    from fastapi import BackgroundTasks, FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from api.schemas import OpenAiAugmentRequest, PredictRequest, TrainRequest
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
        return trainer.predict(req.text)

    @app.post("/reset")
    def reset():
        trainer.reset_model()
        return {"message": "Model reset successfully", "status": "reset"}

    return app
