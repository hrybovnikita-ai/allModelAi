"""scikit-learn linear regression example."""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import train_test_split


def run_sklearn_linear(seed: int = 42, n: int = 120) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)
    x = rng.uniform(-1.5, 1.5, size=(n, 1))
    y = 1.8 * x.ravel() + 0.5 + rng.normal(0, 0.1, size=n)

    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=seed)
    model = LinearRegression()
    model.fit(x_train, y_train)
    preds = model.predict(x_test)
    mse = float(mean_squared_error(y_test, preds))

    return {
        "ok": True,
        "engine": "sklearn",
        "coefficient": float(model.coef_.ravel()[0]),
        "intercept": float(model.intercept_),
        "validationMse": mse,
        "samplePredictions": [
            {"x": float(x_test[i, 0]), "yTrue": float(y_test[i]), "yPred": float(preds[i])}
            for i in range(min(5, len(x_test)))
        ],
    }
