from __future__ import annotations

import os

from providers.openai_compatible import OpenAICompatibleProvider


class OpenAIProvider(OpenAICompatibleProvider):
    def __init__(self) -> None:
        super().__init__(
            provider_name="openai",
            api_key_env="OPENAI_API_KEY",
            base_url="https://api.openai.com/v1",
            default_model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1-mini").strip(),
        )
