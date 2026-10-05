"""FastAPI route tests for /ai/* (no arbitrary code execution)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.ai_learning_routes import register_ai_learning_routes


@pytest.fixture
def client():
    app = FastAPI()
    register_ai_learning_routes(app)
    return TestClient(app)


def test_list_lessons(client):
    res = client.get("/ai/lessons")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert any(l["id"] == "linear-regression-numpy" for l in body["lessons"])


def test_train_linear_regression(client):
    res = client.post(
        "/ai/train/linear-regression",
        json={"epochs": 30, "learning_rate": 0.05, "seed": 1, "data_points": 24},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "trainingId" in data
    assert data["engine"] == "numpy"


def test_train_rejects_invalid_epochs(client):
    res = client.post("/ai/train/linear-regression", json={"epochs": 2})
    assert res.status_code == 422


def test_predict(client):
    res = client.post("/ai/predict", json={"x": [0.0, 1.0], "weight": 2.0, "bias": 0.5})
    assert res.status_code == 200
    preds = res.json()["predictions"]
    assert len(preds) == 2
