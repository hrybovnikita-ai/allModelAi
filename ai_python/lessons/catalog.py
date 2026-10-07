"""Lesson catalog metadata served to the Node gateway."""

from __future__ import annotations

from typing import Any, Dict, List

TRACKS: List[Dict[str, Any]] = [
    {
        "id": "machine-learning-basics",
        "title": "Machine Learning Basics",
        "order": 1,
        "lessonIds": [
            "linear-regression",
            "loss-functions",
            "gradient-descent",
            "logistic-regression",
            "neural-networks",
        ],
    },
    {
        "id": "deep-learning",
        "title": "Deep Learning",
        "order": 2,
        "lessonIds": [
            "activation-functions",
            "backpropagation",
            "optimizers",
            "pytorch-tensors",
            "pytorch-intro",
            "training-loops",
            "model-evaluation",
            "overfitting",
            "regularization",
        ],
    },
    {
        "id": "advanced",
        "title": "Advanced",
        "order": 3,
        "lessonIds": [
            "transformers-fundamentals",
            "rag-fundamentals",
            "ai-agents",
        ],
    },
]

LESSONS: Dict[str, Dict[str, Any]] = {
    "python-for-ai": {
        "id": "python-for-ai",
        "title": "Python for AI",
        "trackId": "ai-fundamentals",
        "order": 1,
        "status": "content",
        "interactive": False,
        "summary": "Why Python dominates ML: readable syntax, NumPy ecosystem, and notebooks.",
        "objectives": [
            "Run simple Python for data prep",
            "Understand variables, lists, and functions in ML scripts",
        ],
        "deepResearchQuery": (
            "Authoritative Python for machine learning learning resources, "
            "official docs, and beginner ML Python tutorials."
        ),
    },
    "numpy-basics": {
        "id": "numpy-basics",
        "title": "NumPy Basics",
        "trackId": "ai-fundamentals",
        "order": 2,
        "status": "content",
        "interactive": False,
        "summary": "Vectors, matrices, broadcasting, and vectorized operations.",
        "objectives": [
            "Create ndarrays",
            "Apply element-wise math used in loss and gradients",
        ],
        "deepResearchQuery": (
            "NumPy official documentation vectorization broadcasting for machine learning."
        ),
    },
    "linear-regression": {
        "id": "linear-regression",
        "title": "Linear Regression",
        "trackId": "machine-learning-basics",
        "order": 1,
        "status": "lab",
        "labType": "linear_regression",
        "interactive": True,
        "summary": "Learn y = wx + b, MSE loss, and predictions from real NumPy training.",
        "objectives": [
            "Define weight, bias, prediction, and error",
            "Compute mean squared error",
            "Fit a line with gradient descent",
        ],
        "equation": "ŷ = w·x + b,  L = mean((ŷ − y)²)",
        "deepResearchQuery": (
            "Linear regression machine learning MSE loss gradient descent authoritative sources."
        ),
    },
    "gradient-descent": {
        "id": "gradient-descent",
        "title": "Gradient Descent",
        "trackId": "machine-learning-basics",
        "order": 3,
        "status": "lab",
        "labType": "gradient_descent",
        "interactive": True,
        "summary": "Control learning rate and epochs; watch loss and the regression line improve.",
        "objectives": [
            "Explain learning rate and convergence",
            "Read a loss curve during training",
            "Compare before/after regression lines",
        ],
        "equation": "w ← w − η·∂L/∂w,  b ← b − η·∂L/∂b",
        "deepResearchQuery": (
            "Gradient descent optimization learning rate tutorial academic and official ML docs."
        ),
    },
    "loss-functions": {
        "id": "loss-functions",
        "title": "Loss Functions",
        "trackId": "machine-learning-basics",
        "order": 2,
        "status": "content",
        "interactive": True,
        "summary": "MSE for regression, cross-entropy for classification — what loss measures.",
        "objectives": ["Compare MSE vs cross-entropy", "Link loss to gradient updates"],
        "equation": "L_MSE = mean((ŷ − y)²)",
        "deepResearchQuery": "Machine learning loss functions MSE cross entropy authoritative overview.",
    },
    "logistic-regression": {
        "id": "logistic-regression",
        "title": "Logistic Regression",
        "trackId": "machine-learning-basics",
        "order": 4,
        "status": "content",
        "interactive": True,
        "summary": "Sigmoid outputs, binary classification, and cross-entropy loss.",
        "objectives": ["Apply sigmoid", "Interpret probabilities", "Use cross-entropy"],
        "equation": "ŷ = σ(wx + b)",
        "deepResearchQuery": "Logistic regression sigmoid cross entropy beginner tutorial.",
    },
    "neural-networks": {
        "id": "neural-networks",
        "title": "Neural Networks",
        "trackId": "machine-learning-basics",
        "order": 5,
        "status": "content",
        "interactive": True,
        "summary": "Layers, weights, biases, and non-linear decision boundaries.",
        "objectives": ["Stack layers", "Forward pass intuition", "When linear models fail"],
        "deepResearchQuery": "Neural network basics layers weights biases introduction.",
    },
    "activation-functions": {
        "id": "activation-functions",
        "title": "Activation Functions",
        "trackId": "deep-learning",
        "order": 6,
        "status": "content",
        "interactive": True,
        "summary": "ReLU, sigmoid, tanh — adding non-linearity between layers.",
        "objectives": ["Compare ReLU vs sigmoid", "Spot vanishing gradients"],
        "equation": "h = ReLU(Wx + b)",
        "deepResearchQuery": "Activation functions ReLU sigmoid tanh deep learning.",
    },
    "backpropagation": {
        "id": "backpropagation",
        "title": "Backpropagation",
        "trackId": "deep-learning",
        "order": 7,
        "status": "content",
        "interactive": True,
        "summary": "Chain rule through the graph to compute gradients efficiently.",
        "objectives": ["Explain backward pass", "Connect loss to weight updates"],
        "deepResearchQuery": "Backpropagation chain rule neural networks tutorial.",
    },
    "optimizers": {
        "id": "optimizers",
        "title": "Optimizers",
        "trackId": "deep-learning",
        "order": 8,
        "status": "content",
        "interactive": True,
        "summary": "SGD, momentum, Adam — adaptive learning rates in practice.",
        "objectives": ["Compare SGD and Adam", "Tune learning rate safely"],
        "deepResearchQuery": "Adam optimizer vs SGD PyTorch documentation.",
    },
    "pytorch-tensors": {
        "id": "pytorch-tensors",
        "title": "PyTorch Tensors",
        "trackId": "deep-learning",
        "order": 9,
        "status": "content",
        "interactive": True,
        "summary": "Tensor shapes, device placement, and vectorized ops on GPU/CPU.",
        "objectives": ["Create tensors", "Broadcasting", "Move data to device"],
        "deepResearchQuery": "PyTorch tensor tutorial official documentation.",
    },
    "training-loops": {
        "id": "training-loops",
        "title": "Training Loops",
        "trackId": "deep-learning",
        "order": 11,
        "status": "content",
        "interactive": True,
        "summary": "Epochs, batches, forward → loss → backward → optimizer.step().",
        "objectives": ["Implement a minimal loop", "Log loss per epoch"],
        "deepResearchQuery": "PyTorch training loop epoch batch official tutorial.",
    },
    "model-evaluation": {
        "id": "model-evaluation",
        "title": "Validation & Testing",
        "trackId": "deep-learning",
        "order": 12,
        "status": "content",
        "interactive": True,
        "summary": "Train/validation/test splits and measuring generalization.",
        "objectives": [
            "Explain train/val/test splits",
            "Track validation loss during training",
        ],
        "deepResearchQuery": (
            "Train validation test split metrics scikit-learn documentation."
        ),
    },
    "overfitting": {
        "id": "overfitting",
        "title": "Overfitting",
        "trackId": "deep-learning",
        "order": 13,
        "status": "content",
        "interactive": True,
        "summary": "When training loss drops but validation loss rises.",
        "objectives": ["Detect overfitting curves", "Apply early stopping conceptually"],
        "deepResearchQuery": "Overfitting underfitting machine learning curves.",
    },
    "regularization": {
        "id": "regularization",
        "title": "Regularization",
        "trackId": "deep-learning",
        "order": 14,
        "status": "content",
        "interactive": True,
        "summary": "Weight decay, dropout, and data augmentation as guardrails.",
        "objectives": ["Explain L2 penalty", "When to use dropout"],
        "deepResearchQuery": "Regularization dropout weight decay neural networks.",
    },
    "pytorch-intro": {
        "id": "pytorch-intro",
        "title": "PyTorch Neural Networks",
        "trackId": "deep-learning",
        "order": 10,
        "status": "lab",
        "labType": "pytorch_linear",
        "interactive": True,
        "summary": "Real torch.nn.Linear training loop: forward, loss, backward, optimizer.step().",
        "objectives": [
            "Use nn.Linear for 1D regression",
            "Run a short PyTorch training loop",
        ],
        "equation": "model = nn.Linear(1,1); loss.backward(); optimizer.step()",
        "deepResearchQuery": "PyTorch official tutorial nn.Linear training loop autograd.",
    },
    "transformers-fundamentals": {
        "id": "transformers-fundamentals",
        "title": "Introduction to Transformers",
        "trackId": "advanced",
        "order": 15,
        "status": "content",
        "interactive": True,
        "summary": "Attention, tokens, and encoder stacks — bridge to modern LLMs.",
        "deepResearchQuery": (
            "Transformer architecture attention mechanisms Vaswani paper and official tutorials."
        ),
    },
    "llm-fundamentals": {
        "id": "llm-fundamentals",
        "title": "LLM Fundamentals (Planned)",
        "trackId": "advanced",
        "order": 9,
        "status": "planned",
        "interactive": False,
        "summary": "Pre-training, tokens, context — Phase 4.",
        "deepResearchQuery": "Large language model fundamentals pretraining tokens official OpenAI docs.",
    },
    "rag-fundamentals": {
        "id": "rag-fundamentals",
        "title": "RAG (Planned)",
        "trackId": "advanced",
        "order": 10,
        "status": "planned",
        "interactive": False,
        "summary": "Retrieval-augmented generation — Phase 4.",
        "deepResearchQuery": "Retrieval augmented generation RAG architecture authoritative guides.",
    },
    "ai-agents": {
        "id": "ai-agents",
        "title": "AI Agents (Planned)",
        "trackId": "advanced",
        "order": 11,
        "status": "planned",
        "interactive": False,
        "summary": "Tool use, planning, multi-step agents — Phase 4.",
        "deepResearchQuery": "AI agents tool use planning LLM systems research papers 2024 2025.",
    },
}


def list_catalog() -> Dict[str, Any]:
    lessons = sorted(LESSONS.values(), key=lambda item: (item.get("trackId", ""), item.get("order", 0)))
    return {"tracks": TRACKS, "lessons": lessons, "phase": 2}


def get_lesson(lesson_id: str) -> Dict[str, Any] | None:
    return LESSONS.get(lesson_id)
