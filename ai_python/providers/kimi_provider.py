from __future__ import annotations

import os

from providers.openai_compatible import OpenAICompatibleProvider


class KimiProvider(OpenAICompatibleProvider):
    def __init__(self) -> None:
        base = (os.getenv("KIMI_BASE_URL") or "https://api.moonshot.cn/v1").strip().rstrip("/")
        super().__init__(
            provider_name="kimi",
            api_key_env="KIMI_API_KEY",
            base_url=base,
            default_model=os.getenv("KIMI_MODEL", "kimi-k2-0711-preview").strip(),
        )
