"""Load intent datasets from JSON files with built-in fallback samples."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

from config import DATA_DIR, INTENT_CLASSES

TRAINING_SAMPLES: List[Tuple[str, str]] = [
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
    ("help me write python code", "coding_help"),
    ("debug this javascript function", "coding_help"),
    ("how to create a react component", "coding_help"),
    ("how do i write a pytorch module", "coding_help"),
    ("fix syntax error in my script", "coding_help"),
    ("write an express route in node js", "coding_help"),
    ("how to implement forward pass in nn.Module", "coding_help"),
    ("build an api in fastapi", "coding_help"),
    ("coding algorithm and data structure", "coding_help"),
    ("explain math behind neural networks", "math_logic"),
    ("calculate derivative and matrix multiplication", "math_logic"),
    ("what is linear algebra in ai", "math_logic"),
    ("explain relu and softmax functions", "math_logic"),
    ("what is cross entropy loss formula", "math_logic"),
    ("calculate probability distribution", "math_logic"),
    ("solve logic puzzle and equations", "math_logic"),
    ("write a poem about artificial intelligence", "creative_writing"),
    ("tell me a story about a futuristic world", "creative_writing"),
    ("creative brainstorming for a sci fi novel", "creative_writing"),
    ("write an inspiring narrative about technology", "creative_writing"),
    ("what device are you running on", "system_info"),
    ("what is your pytorch version", "system_info"),
    ("system specifications and hardware", "system_info"),
    ("status of current ai model", "system_info"),
    ("show active backend and device", "system_info"),
    ("what is allmodelai", "knowledge"),
    ("how does this platform work", "knowledge"),
    ("tell me about local model inference", "knowledge"),
    ("why run models locally instead of cloud", "knowledge"),
    ("explain the allmodelai architecture", "knowledge"),
]

CLASS_RESPONSES: Dict[str, List[str]] = {
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
        "PyTorch local engine is active on your machine with saved weights when training completes.",
        "Running on local platform. Model weights are stored under the ai_python project folder.",
    ],
    "knowledge": [
        "AllModelAI unifies frontier cloud models with your custom local PyTorch neural network.",
        "Local inference guarantees privacy, zero API cost, and instant offline responses.",
    ],
}


def _load_json_split(path: Path) -> List[Tuple[str, str]]:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    samples: List[Tuple[str, str]] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            label = str(item.get("label", "")).strip()
            if text and label in INTENT_CLASSES:
                samples.append((text, label))
    return samples


def load_training_samples() -> List[Tuple[str, str]]:
    train = _load_json_split(DATA_DIR / "train.json")
    if train:
        return train
    return list(TRAINING_SAMPLES)


def load_validation_samples() -> List[Tuple[str, str]]:
    validate = _load_json_split(DATA_DIR / "validate.json")
    if validate:
        return validate
    training = load_training_samples()
    return training[-max(1, len(training) // 10) :]


def load_test_samples() -> List[Tuple[str, str]]:
    test = _load_json_split(DATA_DIR / "test.json")
    if test:
        return test
    training = load_training_samples()
    mid = max(1, len(training) // 10)
    return training[-2 * mid : -mid] if len(training) > 2 * mid else training[:mid]
