"""Lesson catalog metadata served to the Node gateway."""

from __future__ import annotations

from typing import Any, Dict, List

TRACKS: List[Dict[str, Any]] = [
    {
        "id": "ai-fundamentals",
        "title": "AI Fundamentals",
        "order": 1,
        "lessonIds": ["python-for-ai", "numpy-basics"],
    },
    {
        "id": "machine-learning",
        "title": "Machine Learning",
        "order": 2,
        "lessonIds": [
            "linear-regression",
            "gradient-descent",
            "loss-functions",
            "model-evaluation",
        ],
    },
    {
        "id": "deep-learning",
        "title": "Deep Learning (Phase 2+)",
        "order": 3,
        "lessonIds": ["pytorch-intro"],
    },
    {
        "id": "advanced",
        "title": "Advanced (Planned)",
        "order": 4,
        "lessonIds": [
            "transformers-fundamentals",
            "llm-fundamentals",
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
        "trackId": "machine-learning",
        "order": 3,
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
        "trackId": "machine-learning",
        "order": 4,
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
        "trackId": "machine-learning",
        "order": 5,
        "status": "content",
        "interactive": False,
        "summary": "MSE for regression, cross-entropy for classification — what loss measures.",
        "objectives": ["Compare MSE vs cross-entropy", "Link loss to gradient updates"],
        "deepResearchQuery": "Machine learning loss functions MSE cross entropy authoritative overview.",
    },
    "model-evaluation": {
        "id": "model-evaluation",
        "title": "Train / Validation / Test",
        "trackId": "machine-learning",
        "order": 6,
        "status": "content",
        "interactive": False,
        "summary": "Splits, overfitting, and measuring generalization.",
        "objectives": [
            "Explain train/val/test splits",
            "Recognize overfitting vs underfitting",
        ],
        "deepResearchQuery": (
            "Train validation test split overfitting underfitting scikit-learn documentation."
        ),
    },
    "pytorch-intro": {
        "id": "pytorch-intro",
        "title": "PyTorch Linear Layer",
        "trackId": "deep-learning",
        "order": 7,
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
        "title": "Transformers (Planned)",
        "trackId": "advanced",
        "order": 8,
        "status": "planned",
        "interactive": False,
        "summary": "Attention, encoder-decoder stacks — Phase 4.",
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
    return {"tracks": TRACKS, "lessons": lessons, "phase": 1}


def get_lesson(lesson_id: str) -> Dict[str, Any] | None:
    return LESSONS.get(lesson_id)
