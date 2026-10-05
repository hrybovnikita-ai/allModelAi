"""Validated bounds for lab training requests (must mirror Node validation)."""

from __future__ import annotations

MAX_EPOCHS = 2000
MIN_EPOCHS = 1
MAX_LEARNING_RATE = 1.0
MIN_LEARNING_RATE = 1e-6
MAX_DATA_POINTS = 256
DEFAULT_SNAPSHOT_EVERY = 10
