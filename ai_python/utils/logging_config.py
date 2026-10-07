"""Safe logging for the Python LLM layer — never log secrets."""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Iterator, Optional

LOG = logging.getLogger("allmodelai.llm")

if not LOG.handlers:
    level = logging.DEBUG if os.getenv("AI_PYTHON_LOG_LEVEL", "").lower() == "debug" else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def log_request_start(provider: str, model: str) -> float:
    LOG.info("LLM request start provider=%s model=%s", provider, model)
    return time.perf_counter()


def log_request_end(provider: str, model: str, started: float, *, ok: bool, status: Optional[int] = None) -> None:
    ms = int((time.perf_counter() - started) * 1000)
    if ok:
        LOG.info(
            "LLM request ok provider=%s model=%s duration_ms=%s status=%s",
            provider,
            model,
            ms,
            status or 200,
        )
    else:
        LOG.warning(
            "LLM request failed provider=%s model=%s duration_ms=%s status=%s",
            provider,
            model,
            ms,
            status or 500,
        )


@contextmanager
def timed_llm_call(provider: str, model: str) -> Iterator[float]:
    started = log_request_start(provider, model)
    try:
        yield started
        log_request_end(provider, model, started, ok=True)
    except Exception:
        log_request_end(provider, model, started, ok=False)
        raise
