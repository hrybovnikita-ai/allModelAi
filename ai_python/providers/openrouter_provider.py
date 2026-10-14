from __future__ import annotations

import os

from providers.openai_compatible import OpenAICompatibleProvider
from utils.env_keys import get_openrouter_api_key


class OpenRouterProvider(OpenAICompatibleProvider):
    def __init__(self) -> None:
        super().__init__(
            provider_name="openrouter",
            api_key_env="OPENROUTER_API_KEY",
            base_url="https://openrouter.ai/api/v1",
            default_model=os.getenv("OPENROUTER_DEFAULT_MODEL", "openai/gpt-4o-mini").strip(),
            extra_headers={
                "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "https://allmodelai.local"),
                "X-Title": os.getenv("OPENROUTER_APP_TITLE", "AllModelAI"),
            },
        )

    def _api_key(self) -> str:
        return get_openrouter_api_key()

    def is_configured(self) -> bool:
        return bool(get_openrouter_api_key())
