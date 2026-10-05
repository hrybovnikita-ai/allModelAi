"""Optional Keras example (uses torch backend when TensorFlow is not installed)."""

from __future__ import annotations

from typing import Any, Dict


def keras_dense_demo(seed: int = 42) -> Dict[str, Any]:
    try:
        import keras
        import numpy as np
    except ImportError as exc:
        return {"ok": False, "available": False, "error": str(exc)}

    rng = np.random.default_rng(seed)
    x = rng.normal(size=(32, 4)).astype(np.float32)
    y = (x[:, 0] * 0.5 + x[:, 1] * -0.3).astype(np.float32)

    model = keras.Sequential(
        [
            keras.layers.Input(shape=(4,)),
            keras.layers.Dense(8, activation="relu"),
            keras.layers.Dense(1),
        ]
    )
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=0.01), loss="mse")
    history = model.fit(x, y, epochs=3, batch_size=8, verbose=0)
    loss = float(history.history["loss"][-1])
    return {
        "ok": True,
        "available": True,
        "backend": keras.backend.backend(),
        "finalLoss": loss,
        "epochs": 3,
    }
