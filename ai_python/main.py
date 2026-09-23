"""PyTorch AI Learning Engine for AllModelAI.

Provides:
1. PyTorch Neural Network architecture (AILearningBrain).
2. Deep learning training loop with backpropagation, loss optimization, and metrics.
3. Model serialization/saving to ai_model.pth.
4. Live inference engine with confidence scoring and response synthesis.
5. FastAPI HTTP API and CLI execution modes.
"""

import argparse
import base64
import json
import math
import os
import random
import re
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.optim as optim

# Target file paths
CURRENT_DIR = Path(__file__).resolve().parent
MODEL_PATH = CURRENT_DIR / "ai_model.pth"
METRICS_PATH = CURRENT_DIR / "training_metrics.json"

# Set deterministic seeds for initial consistency
SEED = 42
random.seed(SEED)
torch.manual_seed(SEED)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# -------------------------------------------------------------------------
# Training Dataset & Text Vocabulary Encoder
# -------------------------------------------------------------------------

INTENT_CLASSES = [
    "greeting",
    "ai_learning",
    "coding_help",
    "math_logic",
    "creative_writing",
    "system_info",
    "knowledge",
]

CLASS_RESPONSES = {
    "greeting": [
        "Hello! I am your PyTorch AI model, running locally on your machine.",
        "Hi there! My neural network is active and ready to assist you.",
        "Greetings! How can my PyTorch layers help your project today?",
    ],
    "ai_learning": [
        "AI learning is the process where a neural network updates its internal weights via backpropagation and gradient descent to minimize loss.",
        "In PyTorch, learning happens when tensors compute gradients with autograd, and the optimizer adjusts parameters to match training targets.",
        "Deep learning models iterate across multiple epochs, continually refining their predictions on complex patterns.",
    ],
    "coding_help": [
        "I can help you build and debug code in Python, JavaScript, PyTorch, React, and Node.js.",
        "Writing clean, modular functions and checking tensor dimensions ensures smooth execution in deep learning pipelines.",
        "Tip: Always verify tensor shapes with `tensor.shape` when debugging neural network layer mismatches.",
    ],
    "math_logic": [
        "Mathematics is the foundation of machine learning, especially linear algebra, multivariate calculus, and probability.",
        "Gradient descent computes partial derivatives with respect to weights: W = W - lr * dL/dW.",
        "Neural activations like ReLU introduce non-linearity: f(x) = max(0, x), allowing networks to approximate complex functions.",
    ],
    "creative_writing": [
        "Here is a spark of imagination: Intelligent algorithms like stars in a digital constellation, learning from every spark of data.",
        "Creativity and neural networks converge through generative pathways and temperature-controlled token samplings.",
    ],
    "system_info": [
        f"PyTorch Version: {torch.__version__} | Active Device: {DEVICE.type.upper()}",
        f"Running on local platform. Model weights saved at: {MODEL_PATH.name}",
    ],
    "knowledge": [
        "AllModelAI unifies frontier cloud models with your custom local PyTorch neural network.",
        "Local inference guarantees privacy, zero API cost, and instant offline responses.",
    ],
}

TRAINING_DATA: List[Tuple[str, str]] = [
    # greeting
    ("hello there", "greeting"),
    ("hi how are you", "greeting"),
    ("hey assistant", "greeting"),
    ("good morning", "greeting"),
    ("good evening", "greeting"),
    ("hi ai", "greeting"),
    ("hello allmodelai", "greeting"),
    ("welcome back", "greeting"),
    ("salutations", "greeting"),
    ("hey", "greeting"),

    # ai_learning
    ("how does ai learn", "ai_learning"),
    ("what is machine learning", "ai_learning"),
    ("explain neural network training", "ai_learning"),
    ("how does backpropagation work", "ai_learning"),
    ("what is gradient descent", "ai_learning"),
    ("tell me about epochs and loss function", "ai_learning"),
    ("how do weights update in pytorch", "ai_learning"),
    ("explain deep learning model training", "ai_learning"),
    ("what is learning rate and optimizer", "ai_learning"),
    ("how does reinforcement learning train an agent", "ai_learning"),

    # coding_help
    ("help me write python code", "coding_help"),
    ("debug this javascript function", "coding_help"),
    ("how to create a react component", "coding_help"),
    ("how do i write a pytorch module", "coding_help"),
    ("fix syntax error in my script", "coding_help"),
    ("write an express route in node js", "coding_help"),
    ("how to implement forward pass in nn.Module", "coding_help"),
    ("build an api in fastapi", "coding_help"),
    ("coding algorithm and data structure", "coding_help"),

    # math_logic
    ("explain math behind neural networks", "math_logic"),
    ("calculate derivative and matrix multiplication", "math_logic"),
    ("what is linear algebra in ai", "math_logic"),
    ("explain relu and softmax functions", "math_logic"),
    ("what is cross entropy loss formula", "math_logic"),
    ("calculate probability distribution", "math_logic"),
    ("solve logic puzzle and equations", "math_logic"),

    # creative_writing
    ("write a poem about artificial intelligence", "creative_writing"),
    ("tell me a story about a futuristic world", "creative_writing"),
    ("creative brainstorming for a sci fi novel", "creative_writing"),
    ("write an inspiring narrative about technology", "creative_writing"),

    # system_info
    ("what device are you running on", "system_info"),
    ("what is your pytorch version", "system_info"),
    ("system specifications and hardware", "system_info"),
    ("status of current ai model", "system_info"),
    ("show active backend and device", "system_info"),

    # knowledge
    ("what is allmodelai", "knowledge"),
    ("how does this platform work", "knowledge"),
    ("tell me about local model inference", "knowledge"),
    ("why run models locally instead of cloud", "knowledge"),
    ("explain the allmodelai architecture", "knowledge"),
]


class TextTokenizer:
    """Bag-of-words / N-gram tokenizer for converting text to PyTorch tensors."""

    def __init__(self, vocab_size: int = 128):
        self.vocab_size = vocab_size
        self.word_to_id: Dict[str, int] = {}
        self.build_vocab([text for text, _ in TRAINING_DATA])

    def clean_text(self, text: str) -> List[str]:
        tokens = re.findall(r"\b[a-zA-Z0-9_]+\b", text.lower())
        return tokens

    def build_vocab(self, corpus: List[str]):
        counts: Dict[str, int] = {}
        for sentence in corpus:
            for word in self.clean_text(sentence):
                counts[word] = counts.get(word, 0) + 1

        sorted_words = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        self.word_to_id = {"<PAD>": 0, "<UNK>": 1}
        for word, _ in sorted_words[: self.vocab_size - 2]:
            self.word_to_id[word] = len(self.word_to_id)

    def encode(self, text: str) -> torch.Tensor:
        vector = torch.zeros(self.vocab_size, dtype=torch.float32)
        words = self.clean_text(text)
        if not words:
            vector[1] = 1.0  # UNK
            return vector

        for word in words:
            idx = self.word_to_id.get(word, 1)
            vector[idx] += 1.0

        # L2 Normalization for stable gradients
        norm = torch.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        return vector


tokenizer = TextTokenizer(vocab_size=128)

# -------------------------------------------------------------------------
# PyTorch Neural Network Architecture
# -------------------------------------------------------------------------

class AILearningBrain(nn.Module):
    """Multi-Layer Perceptron (MLP) with LayerNorm and Dropout for learning."""

    def __init__(self, input_dim: int = 128, hidden_dim: int = 64, output_dim: int = len(INTENT_CLASSES)):
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


# -------------------------------------------------------------------------
# Training Manager & State Tracker
# -------------------------------------------------------------------------

class TrainingManager:
    def __init__(self):
        self.model = AILearningBrain().to(DEVICE)
        self.lock = threading.Lock()
        self.is_training = False
        self.current_epoch = 0
        self.total_epochs = 0
        self.loss_history: List[float] = []
        self.accuracy_history: List[float] = []
        self.best_loss: float = 999.0
        self.last_accuracy: float = 0.0
        self.logs: List[str] = []
        self.started_at: Optional[float] = None
        self.completed_at: Optional[float] = None

        self.load_weights()

    def log(self, message: str):
        timestamp = time.strftime("%H:%M:%S")
        entry = f"[{timestamp}] {message}"
        self.logs.append(entry)
        if len(self.logs) > 200:
            self.logs.pop(0)
        print(entry)

    def load_weights(self) -> bool:
        if MODEL_PATH.exists():
            try:
                state_dict = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)
                self.model.load_state_dict(state_dict)
                self.model.eval()
                self.log(f"Loaded existing weights from {MODEL_PATH.name}")
                if METRICS_PATH.exists():
                    try:
                        with open(METRICS_PATH, "r", encoding="utf-8") as f:
                            saved_metrics = json.load(f)
                            self.loss_history = saved_metrics.get("loss_history", [])
                            self.accuracy_history = saved_metrics.get("accuracy_history", [])
                            self.best_loss = saved_metrics.get("best_loss", 999.0)
                            self.last_accuracy = saved_metrics.get("last_accuracy", 0.0)
                    except Exception:
                        pass
                return True
            except Exception as e:
                self.log(f"Error loading {MODEL_PATH.name}: {e}")
        return False

    def save_weights(self):
        try:
            torch.save(self.model.state_dict(), MODEL_PATH)
            metrics = {
                "loss_history": self.loss_history[-100:],
                "accuracy_history": self.accuracy_history[-100:],
                "best_loss": round(float(self.best_loss), 4),
                "last_accuracy": round(float(self.last_accuracy), 4),
                "saved_at": time.time(),
            }
            with open(METRICS_PATH, "w", encoding="utf-8") as f:
                json.dump(metrics, f, indent=2)
            self.log(f"Saved optimized model weights to {MODEL_PATH.name}")
        except Exception as e:
            self.log(f"Failed to save model: {e}")

    def reset_model(self):
        with self.lock:
            self.model = AILearningBrain().to(DEVICE)
            self.loss_history = []
            self.accuracy_history = []
            self.best_loss = 999.0
            self.last_accuracy = 0.0
            self.logs = []
            if MODEL_PATH.exists():
                try:
                    MODEL_PATH.unlink()
                except Exception:
                    pass
            if METRICS_PATH.exists():
                try:
                    METRICS_PATH.unlink()
                except Exception:
                    pass
            self.log("Model weights and history reset to initial state.")

    def run_training(self, epochs: int = 60, lr: float = 0.005, batch_size: int = 16):
        with self.lock:
            if self.is_training:
                return False
            self.is_training = True

        self.current_epoch = 0
        self.total_epochs = epochs
        self.started_at = time.time()
        self.log(f"Initiating PyTorch AI learning session: {epochs} epochs | lr={lr} | batch_size={batch_size}")

        try:
            # Build training tensors
            class_to_idx = {name: i for i, name in enumerate(INTENT_CLASSES)}
            x_data = torch.stack([tokenizer.encode(text) for text, _ in TRAINING_DATA]).to(DEVICE)
            y_data = torch.tensor([class_to_idx[label] for _, label in TRAINING_DATA], dtype=torch.long).to(DEVICE)

            dataset_size = len(x_data)
            self.model.train()
            optimizer = optim.AdamW(self.model.parameters(), lr=lr, weight_decay=1e-4)
            criterion = nn.CrossEntropyLoss()
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

            for epoch in range(1, epochs + 1):
                # Shuffle dataset per epoch
                indices = torch.randperm(dataset_size)
                epoch_loss = 0.0
                correct = 0
                batches = math.ceil(dataset_size / batch_size)

                for b in range(batches):
                    batch_idx = indices[b * batch_size : (b + 1) * batch_size]
                    batch_x, batch_y = x_data[batch_idx], y_data[batch_idx]

                    optimizer.zero_grad()
                    outputs = self.model(batch_x)
                    loss = criterion(outputs, batch_y)
                    loss.backward()

                    # Gradient clipping to prevent exploding gradients
                    nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=2.0)
                    optimizer.step()

                    epoch_loss += loss.item() * len(batch_idx)
                    preds = outputs.argmax(dim=1)
                    correct += (preds == batch_y).sum().item()

                scheduler.step()

                avg_loss = epoch_loss / dataset_size
                avg_acc = (correct / dataset_size) * 100.0

                self.current_epoch = epoch
                self.loss_history.append(round(avg_loss, 4))
                self.accuracy_history.append(round(avg_acc, 2))
                self.last_accuracy = avg_acc

                if avg_loss < self.best_loss:
                    self.best_loss = avg_loss

                if epoch == 1 or epoch % max(epochs // 10, 1) == 0 or epoch == epochs:
                    self.log(f"Epoch {epoch:>3}/{epochs} | Loss: {avg_loss:.4f} | Accuracy: {avg_acc:.1f}%")

                # Small sleep to yield CPU and enable real-time UI tracking
                time.sleep(0.015)

            self.model.eval()
            self.save_weights()
            duration = round(time.time() - self.started_at, 2)
            self.log(f"Training completed successfully in {duration}s! Final Accuracy: {avg_acc:.1f}%")

        except Exception as e:
            self.log(f"Training error: {e}")
        finally:
            self.is_training = False
            self.completed_at = time.time()

        return True

    def predict(self, text: str) -> Dict[str, Any]:
        self.model.eval()
        with torch.inference_mode():
            tensor = tokenizer.encode(text).unsqueeze(0).to(DEVICE)
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1).squeeze(0)
            best_idx = int(probs.argmax().item())
            confidence = float(probs[best_idx].item())
            predicted_class = INTENT_CLASSES[best_idx]

            # Detailed probabilities for top categories
            prob_breakdown = {
                INTENT_CLASSES[i]: round(float(probs[i].item()) * 100, 2)
                for i in range(len(INTENT_CLASSES))
            }

            # Generate smart context-aware response
            responses = CLASS_RESPONSES.get(predicted_class, ["I have processed your request."])
            selected_response = random.choice(responses)

            return {
                "input": text,
                "predicted_class": predicted_class,
                "confidence": round(confidence * 100, 2),
                "probabilities": prob_breakdown,
                "response": selected_response,
                "device": DEVICE.type,
                "model_status": "trained" if MODEL_PATH.exists() else "untrained",
            }

    def get_status(self) -> Dict[str, Any]:
        total_params = sum(p.numel() for p in self.model.parameters())
        return {
            "status": "training" if self.is_training else "ready",
            "is_training": self.is_training,
            "device": DEVICE.type,
            "pytorch_version": torch.__version__,
            "model_path": str(MODEL_PATH),
            "model_file_exists": MODEL_PATH.exists(),
            "total_parameters": total_params,
            "current_epoch": self.current_epoch,
            "total_epochs": self.total_epochs,
            "progress_percent": round((self.current_epoch / self.total_epochs * 100) if self.total_epochs > 0 else 0, 1),
            "last_loss": self.loss_history[-1] if self.loss_history else None,
            "best_loss": round(float(self.best_loss), 4) if self.best_loss < 900 else None,
            "last_accuracy": self.last_accuracy,
            "loss_history": self.loss_history[-40:],
            "accuracy_history": self.accuracy_history[-40:],
            "classes": INTENT_CLASSES,
            "logs": self.logs[-15:],
        }


trainer = TrainingManager()

# -------------------------------------------------------------------------
# FastAPI Web Server Mode
# -------------------------------------------------------------------------

try:
    from fastapi import BackgroundTasks, FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    app = FastAPI(title="AllModelAI PyTorch Service", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class TrainRequest(BaseModel):
        epochs: Optional[int] = 60
        lr: Optional[float] = 0.005
        batch_size: Optional[int] = 16

    class PredictRequest(BaseModel):
        text: str

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

        bg_tasks.add_task(trainer.run_training, epochs=req.epochs or 60, lr=req.lr or 0.005, batch_size=req.batch_size or 16)
        return {
            "message": "AI Training session initiated in background.",
            "epochs": req.epochs or 60,
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

except ImportError:
    app = None


# -------------------------------------------------------------------------
# CLI & Standalone Commands
# -------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="PyTorch AI Learning & Inference for AllModelAI")
    parser.add_argument("--train", action="store_true", help="Run model training loop")
    parser.add_argument("--epochs", type=int, default=60, help="Number of training epochs")
    parser.add_argument("--lr", type=float, default=0.005, help="Learning rate")
    parser.add_argument("--predict", type=str, help="Predict class for input text")
    parser.add_argument("--status", action="store_true", help="Print model and training status")
    parser.add_argument("--reset", action="store_true", help="Reset model weights")
    parser.add_argument("--serve", action="store_true", help="Start FastAPI uvicorn server")
    parser.add_argument("--port", type=int, default=5055, help="Port for API server")
    parser.add_argument("--json-cmd", type=str, help="Execute single-shot JSON command from backend")
    parser.add_argument("--base64-cmd", type=str, help="Execute base64 encoded JSON command")

    args = parser.parse_args()

    if args.base64_cmd or args.json_cmd:
        try:
            if args.base64_cmd:
                raw_json = base64.b64decode(args.base64_cmd.encode('utf-8')).decode('utf-8')
            else:
                raw_json = args.json_cmd
            cmd_data = json.loads(raw_json)
            action = cmd_data.get("action")
            if action == "status":
                print(json.dumps(trainer.get_status()))
            elif action == "predict":
                result = trainer.predict(cmd_data.get("text", ""))
                print(json.dumps(result))
            elif action == "train":
                epochs = cmd_data.get("epochs", 60)
                lr = cmd_data.get("lr", 0.005)
                trainer.run_training(epochs=epochs, lr=lr)
                print(json.dumps(trainer.get_status()))
            elif action == "reset":
                trainer.reset_model()
                print(json.dumps({"status": "reset"}))
            else:
                print(json.dumps({"error": f"Unknown action: {action}"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        return

    if args.reset:
        trainer.reset_model()
        return

    if args.train:
        trainer.run_training(epochs=args.epochs, lr=args.lr)
        return

    if args.predict:
        res = trainer.predict(args.predict)
        print(f"\nInput: \"{args.predict}\"")
        print(f"Predicted Class: {res['predicted_class']} ({res['confidence']}% confidence)")
        print(f"Response: {res['response']}")
        return

    if args.status:
        st = trainer.get_status()
        print(json.dumps(st, indent=2))
        return

    if args.serve:
        if app is None:
            print("FastAPI or uvicorn is not installed. Run: py -m pip install fastapi uvicorn")
            sys.exit(1)
        import uvicorn
        print(f"Starting PyTorch AI Service on http://127.0.0.1:{args.port}")
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
        return

    # Default if no args
    parser.print_help()


if __name__ == "__main__":
    main()
