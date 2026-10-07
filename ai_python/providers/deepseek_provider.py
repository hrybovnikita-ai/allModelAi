from __future__ import annotations

import os

from providers.openai_compatible import OpenAICompatibleProvider


class DeepSeekProvider(OpenAICompatibleProvider):
    def __init__(self) -> None:
        super().__init__(
            provider_name="deepseek",
            api_key_env="DEEPSEEK_API_KEY",
            base_url="https://api.deepseek.com",
            default_model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip(),
        )
