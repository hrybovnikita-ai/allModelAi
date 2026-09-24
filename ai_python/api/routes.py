"""FastAPI routes for the PyTorch AI service."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from config import DEFAULT_BATCH_SIZE, DEFAULT_EPOCHS, DEFAULT_LR, DEVICE

if TYPE_CHECKING:
    from training.trainer import TrainingManager

try:
    from fastapi import BackgroundTasks, FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from api.schemas import PredictRequest, TrainRequest

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
        bg_tasks.add_task(trainer.run_training, epochs=epochs, lr=lr, batch_size=batch_size)
        return {
            "message": "AI Training session initiated in background.",
            "epochs": epochs,
            "status": "started",
        }

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
