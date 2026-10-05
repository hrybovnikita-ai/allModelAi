"""Small NumPy demos for the learning catalog."""

from __future__ import annotations

from typing import Any, Dict

import numpy as np


def vector_dot_demo() -> Dict[str, Any]:
    a = np.array([1.0, 2.0, 3.0])
    b = np.array([4.0, 5.0, 6.0])
    return {
        "ok": True,
        "a": a.tolist(),
        "b": b.tolist(),
        "dot": float(a @ b),
        "shape": list(a.shape),
    }
