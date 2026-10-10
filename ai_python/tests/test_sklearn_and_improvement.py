"""scikit-learn logistic + improvement analytics + checkpoint I/O."""

from __future__ import annotations

import torch

from learning.improvement.analytics import analyze_improvement_payload
from learning.sklearn.linear_sklearn import run_sklearn_linear
from learning.sklearn.logistic_sklearn import run_sklearn_logistic
from learning.pytorch.linear_torch import LinearModule, train_pytorch_linear
from models.model_storage import load_run_state_dict, save_run_model


def test_sklearn_logistic_trains_with_accuracy():
    out = run_sklearn_logistic(seed=11, n=200)
    assert out["ok"]
    assert out["finalAccuracy"] >= 0.7
    assert out["validationLoss"] >= 0


def test_sklearn_linear_train_validation_split():
    out = run_sklearn_linear(seed=5, n=100)
    assert out["trainLoss"] >= 0
    assert out["validationLoss"] >= 0


def test_pytorch_checkpoint_roundtrip():
    out = train_pytorch_linear(epochs=10, learning_rate=0.05, seed=3, data_points=60)
    rel = save_run_model("run_test_ckpt", out["stateDict"], {"modelType": "linear-regression"})
    loaded = load_run_state_dict("run_test_ckpt")
    model = LinearModule()
    model.load_state_dict(loaded)
    assert rel


def test_improvement_analytics_recommendations():
    payload = {
        "feedback": {
            "totals": [{"rating": "down", "count": 12}, {"rating": "up", "count": 3}],
            "categories": [{"category": "incorrect", "count": 8}],
        },
        "routerPerformance": {
            "gemini": {"successRate": 0.6, "avgLatencyMs": 900, "sampleSize": 20},
        },
        "retrieval": {"scores": [{"score": 0.2}, {"score": 0.25}]},
    }
    out = analyze_improvement_payload(payload)
    assert out["ok"]
    assert out["summary"]["feedbackDown"] == 12
    assert len(out["recommendations"]) >= 1
