from __future__ import annotations

import asyncio
import os
from typing import Optional

from providers.base import AIProvider, ChatMessage, GenerateResult
from utils.errors import map_http_exception, missing_api_key, provider_unavailable
from utils.logging_config import timed_llm_call


class GeminiProvider(AIProvider):
    name = "gemini"

    def _api_key(self) -> str:
        return (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()

    def is_configured(self) -> bool:
        return bool(self._api_key())

    @staticmethod
    def _build_prompt(messages: list[ChatMessage], system: Optional[str]) -> str:
        parts: list[str] = []
        if system:
            parts.append(f"System:\n{system}\n")
        for msg in messages:
            parts.append(f"{msg.role.capitalize()}:\n{msg.content}\n")
        return "\n".join(parts).strip()

    async def generate(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
    ) -> GenerateResult:
        if not self.is_configured():
            raise missing_api_key(self.name)

        resolved = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        prompt = self._build_prompt(messages, system)

        with timed_llm_call(self.name, resolved):
            try:
                try:
                    from google import genai
                except ImportError as exc:
                    raise provider_unavailable(
                        self.name,
                        "Install google-genai: pip install google-genai",
                    ) from exc

                client = genai.Client(api_key=self._api_key())
                config = {}
                if temperature is not None:
                    config["temperature"] = temperature
                if max_tokens is not None:
                    config["max_output_tokens"] = max_tokens

                if stream:
                    text_parts: list[str] = []

                    def _stream_collect() -> str:
                        chunks = client.models.generate_content_stream(
                            model=resolved,
                            contents=prompt,
                            config=config or None,
                        )
                        for chunk in chunks:
                            if chunk.text:
                                text_parts.append(chunk.text)
                        return "".join(text_parts)

                    text = await asyncio.to_thread(_stream_collect)
                else:
                    response = await asyncio.to_thread(
                        client.models.generate_content,
                        model=resolved,
                        contents=prompt,
                        config=config or None,
                    )
                    text = (response.text or "").strip()

                return GenerateResult(provider=self.name, model=resolved, text=text)
            except Exception as exc:
                raise map_http_exception(self.name, exc) from exc
