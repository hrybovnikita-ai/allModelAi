"""Reusable OpenAI-compatible chat client (OpenRouter, DeepSeek, Mistral, Kimi, xAI)."""

from __future__ import annotations

import os
from typing import Optional

from providers.base import AIProvider, ChatMessage, GenerateResult, TokenUsage
from utils.errors import map_http_exception, missing_api_key
from utils.logging_config import timed_llm_call


class OpenAICompatibleProvider(AIProvider):
    def __init__(
        self,
        *,
        provider_name: str,
        api_key_env: str,
        base_url: str,
        default_model: str,
        extra_headers: Optional[dict[str, str]] = None,
    ) -> None:
        self.name = provider_name
        self._api_key_env = api_key_env
        self._base_url = base_url.rstrip("/")
        self._default_model = default_model
        self._extra_headers = extra_headers or {}

    def _api_key(self) -> str:
        return (os.getenv(self._api_key_env) or "").strip()

    def is_configured(self) -> bool:
        key = self._api_key()
        return bool(key) and not key.startswith("your_")

    def _client(self):
        from openai import AsyncOpenAI

        return AsyncOpenAI(
            api_key=self._api_key(),
            base_url=self._base_url,
            default_headers=self._extra_headers or None,
            timeout=float(os.getenv("AI_PYTHON_LLM_TIMEOUT_SEC", "120")),
        )

    @staticmethod
    def _to_openai_messages(messages: list[ChatMessage], system: Optional[str]) -> list[dict]:
        out: list[dict] = []
        if system:
            out.append({"role": "system", "content": system})
        for msg in messages:
            role = msg.role if msg.role in ("system", "user", "assistant", "developer") else "user"
            out.append({"role": role, "content": msg.content})
        return out

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

        resolved_model = model or self._default_model
        payload_messages = self._to_openai_messages(messages, system)
        kwargs: dict = {"model": resolved_model, "messages": payload_messages}
        if temperature is not None:
            kwargs["temperature"] = temperature
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        with timed_llm_call(self.name, resolved_model):
            try:
                client = self._client()
                if stream:
                    text_parts: list[str] = []
                    stream_resp = await client.chat.completions.create(stream=True, **kwargs)
                    async for chunk in stream_resp:
                        delta = chunk.choices[0].delta.content if chunk.choices else None
                        if delta:
                            text_parts.append(delta)
                    text = "".join(text_parts)
                    usage = None
                else:
                    completion = await client.chat.completions.create(**kwargs)
                    text = (completion.choices[0].message.content or "").strip()
                    usage_obj = completion.usage
                    usage = (
                        TokenUsage(
                            input_tokens=getattr(usage_obj, "prompt_tokens", None),
                            output_tokens=getattr(usage_obj, "completion_tokens", None),
                            total_tokens=getattr(usage_obj, "total_tokens", None),
                        )
                        if usage_obj
                        else None
                    )
                return GenerateResult(
                    provider=self.name,
                    model=resolved_model,
                    text=text,
                    usage=usage,
                )
            except Exception as exc:
                raise map_http_exception(self.name, exc) from exc
