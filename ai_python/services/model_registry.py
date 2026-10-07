"""Model registry synced with AllModelAI backend modelVariants.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from config import ROOT_DIR

BACKEND_VARIANTS = ROOT_DIR.parent / "backend" / "src" / "data" / "modelVariants.json"

# Maps AllModelAI family slug -> Python provider id
FAMILY_TO_PROVIDER = {
    "gpt": "openai",
    "copilot": "openai",
    "claude": "anthropic",
    "gemini": "gemini",
    "grok": "grok",
    "deepseek": "deepseek",
    "mistral": "mistral",
    "kimi": "kimi",
    "llama": "openrouter",
    "perplexity": "openrouter",
    "qwen": "openrouter",
    "cohere": "openrouter",
    "cloudflare": "openrouter",
}


def load_variants() -> dict[str, list[dict[str, Any]]]:
    if not BACKEND_VARIANTS.is_file():
        return {}
    with BACKEND_VARIANTS.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_registry() -> dict[str, Any]:
    variants = load_variants()
    providers: dict[str, Any] = {}
    for family, entries in variants.items():
        provider_id = FAMILY_TO_PROVIDER.get(family, "openrouter")
        bucket = providers.setdefault(
            provider_id,
            {"display_name": provider_id.title(), "models": []},
        )
        for entry in entries:
            bucket["models"].append(
                {
                    "family": family,
                    "variant_id": entry.get("id"),
                    "display_name": entry.get("name") or entry.get("id"),
                    "gateway_model": entry.get("gateway"),
                    "direct_model": entry.get("direct"),
                    "supports_text": True,
                    "supports_streaming": True,
                    "supports_vision": False,
                }
            )
    return providers


def resolve_model_id(provider: str, model: str) -> str:
    """Return provider-native or gateway model id."""
    model = (model or "").strip()
    if not model:
        return model
    if "/" in model:
        return model
    variants = load_variants()
    for family, entries in variants.items():
        if FAMILY_TO_PROVIDER.get(family) != provider and provider != "openrouter":
            continue
        for entry in entries:
            if entry.get("id") == model or entry.get("direct") == model or entry.get("gateway") == model:
                if provider == "openrouter":
                    return entry.get("gateway") or model
                return entry.get("direct") or entry.get("gateway") or model
    return model


def model_exists(provider: str, model: str) -> bool:
    if not model:
        return False
    if "/" in model:
        return True
    variants = load_variants()
    for family, entries in variants.items():
        prov = FAMILY_TO_PROVIDER.get(family)
        if prov != provider and provider != "openrouter":
            continue
        for entry in entries:
            if model in (entry.get("id"), entry.get("direct"), entry.get("gateway")):
                return True
    return provider == "openrouter"
