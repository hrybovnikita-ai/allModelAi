"""In-memory training log buffer for the PyTorch UI."""

from __future__ import annotations

import time
from typing import List


class TrainingLogger:
    def __init__(self, max_logs: int = 200) -> None:
        self.max_logs = max_logs
        self.logs: List[str] = []

    def log(self, message: str) -> str:
        entry = f"[{time.strftime('%H:%M:%S')}] {message}"
        self.logs.append(entry)
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)
        print(entry)
        return entry

    def tail(self, count: int = 15) -> List[str]:
        return self.logs[-count:]
