"""PyTorch AI Learning Engine for AllModelAI — entry point and CLI."""

from __future__ import annotations

import argparse
import base64
import json
import sys

from api.routes import create_app
from config import DEFAULT_BATCH_SIZE, DEFAULT_EPOCHS, DEFAULT_LR, DEFAULT_PORT
from training.trainer import TrainingManager

trainer = TrainingManager()
app = create_app(trainer)


def _handle_json_command(raw_json: str) -> None:
    try:
        cmd_data = json.loads(raw_json)
        action = cmd_data.get("action")
        if action == "status":
            print(json.dumps(trainer.get_status()))
        elif action == "predict":
            result = trainer.predict(cmd_data.get("text", ""))
            print(json.dumps(result))
        elif action == "train":
            epochs = cmd_data.get("epochs", DEFAULT_EPOCHS)
            lr = cmd_data.get("lr", DEFAULT_LR)
            batch_size = cmd_data.get("batch_size", cmd_data.get("batchSize", DEFAULT_BATCH_SIZE))
            openai_augment = bool(cmd_data.get("openaiAugment") or cmd_data.get("openai_augment"))
            openai_samples = cmd_data.get("openaiSamplesPerClass", cmd_data.get("openai_samples_per_class", 2))
            trainer.run_training(
                epochs=epochs,
                lr=lr,
                batch_size=batch_size,
                openai_augment=openai_augment,
                openai_samples_per_class=int(openai_samples or 2),
            )
            print(json.dumps(trainer.get_status()))
        elif action == "openai_status":
            from services.openai_llm import get_openai_status

            print(json.dumps(get_openai_status()))
        elif action == "openai_augment":
            per_class = int(cmd_data.get("samplesPerClass", cmd_data.get("samples_per_class", 2)))
            print(json.dumps(trainer.augment_with_openai(samples_per_class=per_class)))
        elif action == "reset":
            trainer.reset_model()
            print(json.dumps({"status": "reset"}))
        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))


def main() -> None:
    parser = argparse.ArgumentParser(description="PyTorch AI Learning & Inference for AllModelAI")
    parser.add_argument("--train", action="store_true", help="Run model training loop")
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS, help="Number of training epochs")
    parser.add_argument("--lr", type=float, default=DEFAULT_LR, help="Learning rate")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Training batch size")
    parser.add_argument("--predict", type=str, help="Predict class for input text")
    parser.add_argument("--status", action="store_true", help="Print model and training status")
    parser.add_argument("--reset", action="store_true", help="Reset model weights")
    parser.add_argument("--serve", action="store_true", help="Start FastAPI uvicorn server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port for API server")
    parser.add_argument("--json-cmd", type=str, help="Execute single-shot JSON command from backend")
    parser.add_argument("--base64-cmd", type=str, help="Execute base64 encoded JSON command")

    args = parser.parse_args()

    if args.base64_cmd or args.json_cmd:
        if args.base64_cmd:
            raw_json = base64.b64decode(args.base64_cmd.encode("utf-8")).decode("utf-8")
        else:
            raw_json = args.json_cmd or ""
        _handle_json_command(raw_json)
        return

    if args.reset:
        trainer.reset_model()
        return

    if args.train:
        trainer.run_training(epochs=args.epochs, lr=args.lr, batch_size=args.batch_size)
        return

    if args.predict:
        res = trainer.predict(args.predict)
        print(f'\nInput: "{args.predict}"')
        print(f"Predicted Class: {res['predicted_class']} ({res['confidence']}% confidence)")
        print(f"Response: {res['response']}")
        return

    if args.status:
        print(json.dumps(trainer.get_status(), indent=2))
        return

    if args.serve:
        if app is None:
            print("FastAPI or uvicorn is not installed. Run: py -m pip install fastapi uvicorn")
            sys.exit(1)
        import uvicorn

        print(f"Starting PyTorch AI Service on http://127.0.0.1:{args.port}")
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
        return

    parser.print_help()


if __name__ == "__main__":
    main()
