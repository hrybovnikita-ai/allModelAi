"""Shared env key resolution (mirrors backend openRouterConfig.js)."""

from __future__ import annotations

import os

# Load ai_python/.env, then ../backend/.env (see config.py).
try:
    import config  # noqa: F401
except ImportError:
    pass


def sanitize_env_secret(value: str | None) -> str:
    text = str(value or "").strip()
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()
    return text


OPENROUTER_KEY_ENV_NAMES = (
    "ALLMODELAI_OPENROUTER_API_KEY",
    "OPENROUTER_API_KEY",
    "API_KEY",
)


def get_openrouter_api_key() -> str:
    for name in OPENROUTER_KEY_ENV_NAMES:
        value = sanitize_env_secret(os.getenv(name))
        if value:
            return value
    return ""


def openrouter_key_source_env() -> str | None:
    for name in OPENROUTER_KEY_ENV_NAMES:
        if sanitize_env_secret(os.getenv(name)):
            return name
    return None
