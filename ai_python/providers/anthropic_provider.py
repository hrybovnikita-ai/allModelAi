from __future__ import annotations

import os
from typing import Optional

from providers.base import AIProvider, ChatMessage, GenerateResult, TokenUsage
from utils.errors import map_http_exception, missing_api_key, provider_unavailable
from utils.logging_config import timed_llm_call


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def _api_key(self) -> str:
        return (os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY") or "").strip()

    def is_configured(self) -> bool:
        return bool(self._api_key())

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

        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:
            raise provider_unavailable(self.name, "Install anthropic: pip install anthropic") from exc

        resolved = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6").strip()
        anthropic_messages = [
            {"role": "user" if m.role == "user" else "assistant", "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]
        if not anthropic_messages:
            anthropic_messages = [{"role": "user", "content": "Hello"}]

        kwargs = {
            "model": resolved,
            "max_tokens": max_tokens or int(os.getenv("ANTHROPIC_MAX_TOKENS", "4096")),
            "messages": anthropic_messages,
        }
        if system:
            kwargs["system"] = system
        if temperature is not None:
            kwargs["temperature"] = temperature

        with timed_llm_call(self.name, resolved):
            try:
                client = AsyncAnthropic(api_key=self._api_key())
                if stream:
                    text_parts: list[str] = []
                    async with client.messages.stream(**kwargs) as stream_resp:
                        async for event in stream_resp.text_stream:
                            text_parts.append(event)
                    text = "".join(text_parts)
                    usage = None
                else:
                    msg = await client.messages.create(**kwargs)
                    text = ""
                    for block in msg.content:
                        if getattr(block, "type", None) == "text":
                            text += block.text
                    usage = TokenUsage(
                        input_tokens=getattr(msg.usage, "input_tokens", None),
                        output_tokens=getattr(msg.usage, "output_tokens", None),
                    )
                return GenerateResult(provider=self.name, model=resolved, text=text.strip(), usage=usage)
            except Exception as exc:
                raise map_http_exception(self.name, exc) from exc
