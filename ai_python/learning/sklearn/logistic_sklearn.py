"""scikit-learn logistic regression (binary classification)."""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.model_selection import train_test_split


def run_sklearn_logistic(seed: int = 42, n: int = 240) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)
    n0 = n // 2
    x0 = rng.normal(loc=[-1.0, -0.5], scale=0.7, size=(n0, 2))
    x1 = rng.normal(loc=[1.0, 0.8], scale=0.7, size=(n - n0, 2))
    x = np.vstack([x0, x1]).astype(np.float64)
    y = np.concatenate([np.zeros(n0), np.ones(n - n0)])

    x_train, x_val, y_train, y_val = train_test_split(
        x, y, test_size=0.25, random_state=seed, stratify=y,
    )
    model = LogisticRegression(max_iter=500, random_state=seed)
    model.fit(x_train, y_train)

    train_probs = model.predict_proba(x_train)
    val_probs = model.predict_proba(x_val)
    train_loss = float(log_loss(y_train, train_probs, labels=[0, 1]))
    val_loss = float(log_loss(y_val, val_probs, labels=[0, 1]))
    val_acc = float(accuracy_score(y_val, model.predict(x_val)))

    return {
        "ok": True,
        "engine": "sklearn",
        "modelType": "sklearn-logistic-regression",
        "trainLoss": train_loss,
        "validationLoss": val_loss,
        "finalLoss": val_loss,
        "finalAccuracy": val_acc,
        "lossHistory": [train_loss, val_loss],
        "validationLossHistory": [val_loss],
        "accuracyHistory": [val_acc],
        "coefficients": model.coef_.ravel().tolist(),
        "intercept": float(model.intercept_.ravel()[0]),
        "samplePredictions": [
            {
                "features": x_val[i].tolist(),
                "yTrue": int(y_val[i]),
                "yPred": int(model.predict(x_val[i : i + 1])[0]),
            }
            for i in range(min(5, len(y_val)))
        ],
    }
