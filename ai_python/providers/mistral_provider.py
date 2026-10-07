from __future__ import annotations

import os

from providers.openai_compatible import OpenAICompatibleProvider


class MistralProvider(OpenAICompatibleProvider):
    def __init__(self) -> None:
        super().__init__(
            provider_name="mistral",
            api_key_env="MISTRAL_API_KEY",
            base_url="https://api.mistral.ai/v1",
            default_model=os.getenv("MISTRAL_MODEL", "mistral-small-latest").strip(),
        )
