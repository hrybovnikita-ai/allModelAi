"""Pandas feature/label split demo (no external data files)."""

from __future__ import annotations

from typing import Any, Dict

import pandas as pd


def pandas_split_demo(seed: int = 42) -> Dict[str, Any]:
    df = pd.DataFrame(
        {
            "feature_hours": [1, 2, 3, 4, 5, 6, 7, 8],
            "feature_difficulty": [1, 1, 2, 2, 3, 3, 4, 4],
            "label_score": [55, 58, 62, 65, 70, 74, 78, 82],
        }
    )
    train = df.sample(frac=0.75, random_state=seed)
    test = df.drop(train.index)
    return {
        "ok": True,
        "engine": "pandas",
        "rows": len(df),
        "trainRows": len(train),
        "testRows": len(test),
        "columns": list(df.columns),
        "trainPreview": train.head(3).to_dict(orient="records"),
    }
