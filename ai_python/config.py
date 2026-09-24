"""Shared configuration for the AllModelAI PyTorch service."""

from pathlib import Path
import random

import torch

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"

MODEL_PATH = ROOT_DIR / "ai_model.pth"
MODEL_PATH_ALT = MODELS_DIR / "ai_model.pth"
METRICS_PATH = ROOT_DIR / "training_metrics.json"

SEED = 42
VOCAB_SIZE = 128
HIDDEN_DIM = 64
DEFAULT_EPOCHS = 60
DEFAULT_LR = 0.005
DEFAULT_BATCH_SIZE = 16
DEFAULT_PORT = 5055

random.seed(SEED)
torch.manual_seed(SEED)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

INTENT_CLASSES = [
    "greeting",
    "ai_learning",
    "coding_help",
    "math_logic",
    "creative_writing",
    "system_info",
    "knowledge",
]
