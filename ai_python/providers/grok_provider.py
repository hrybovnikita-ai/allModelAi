from __future__ import annotations

import os

from providers.openai_compatible import OpenAICompatibleProvider


class GrokProvider(OpenAICompatibleProvider):
    def __init__(self) -> None:
        super().__init__(
            provider_name="grok",
            api_key_env="XAI_API_KEY",
            base_url="https://api.x.ai/v1",
            default_model=os.getenv("XAI_MODEL", os.getenv("GROK_MODEL", "grok-4-latest")).strip(),
        )

    def _api_key(self) -> str:
        return (os.getenv("XAI_API_KEY") or os.getenv("GROK_API_KEY") or "").strip()
