"""Educational lesson catalog for the AI Learning Lab."""

from __future__ import annotations

from typing import Any, Dict, List

LESSONS: List[Dict[str, Any]] = [
    {
        "id": "numpy-basics",
        "title": "NumPy for AI",
        "topic": "numpy",
        "summary": "Vectors, matrices, and vectorized operations for ML.",
    },
    {
        "id": "pandas-basics",
        "title": "Pandas DataFrames",
        "topic": "pandas",
        "summary": "Tabular data, features, labels, and train/validation splits.",
    },
    {
        "id": "sklearn-linear",
        "title": "scikit-learn Linear Regression",
        "topic": "sklearn",
        "summary": "Fit and predict with sklearn.linear_model.LinearRegression.",
    },
    {
        "id": "linear-regression-numpy",
        "title": "Linear Regression (NumPy)",
        "topic": "linear_regression",
        "summary": "Manual weight/bias updates with MSE loss.",
        "trainable": True,
        "trainKind": "linear-regression",
    },
    {
        "id": "gradient-descent",
        "title": "Gradient Descent",
        "topic": "gradient_descent",
        "summary": "Step-by-step gradient descent on a 1D regression task.",
        "trainable": True,
        "trainKind": "gradient-descent",
    },
    {
        "id": "pytorch-linear",
        "title": "PyTorch Training Loop",
        "topic": "pytorch",
        "summary": "Tensors, autograd, optimizer, and epoch loop.",
        "trainable": True,
        "trainKind": "pytorch-linear",
    },
    {
        "id": "keras-intro",
        "title": "Keras Sequential Model",
        "topic": "keras",
        "summary": "Small dense network with Keras (when installed).",
    },
    {
        "id": "openai-api",
        "title": "OpenAI API (server-side)",
        "topic": "openai",
        "summary": "Calling OpenAI models via backend — not local training.",
    },
]


def list_lessons() -> Dict[str, Any]:
    return {"ok": True, "lessons": LESSONS}


def get_lesson(lesson_id: str) -> Dict[str, Any]:
    for item in LESSONS:
        if item["id"] == lesson_id:
            return {"ok": True, "lesson": item}
    return {"ok": False, "error": "Lesson not found"}
