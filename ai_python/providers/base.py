"""Base provider abstraction for AllModelAI Python LLM layer."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional


@dataclass
class ChatMessage:
    role: str
    content: str


@dataclass
class TokenUsage:
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

    def to_dict(self) -> dict[str, int]:
        out: dict[str, int] = {}
        if self.input_tokens is not None:
            out["input_tokens"] = self.input_tokens
        if self.output_tokens is not None:
            out["output_tokens"] = self.output_tokens
        if self.total_tokens is not None:
            out["total_tokens"] = self.total_tokens
        return out


@dataclass
class GenerateResult:
    provider: str
    model: str
    text: str
    usage: Optional[TokenUsage] = None
    raw: Any = field(default=None, repr=False)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "provider": self.provider,
            "model": self.model,
            "text": self.text,
        }
        if self.usage:
            usage = self.usage.to_dict()
            if usage:
                payload["usage"] = usage
        return payload


class AIProvider(ABC):
    name: str

    @abstractmethod
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
        raise NotImplementedError

    async def generate_stream(
        self,
        *,
        model: str,
        messages: list[ChatMessage],
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        result = await self.generate(
            model=model,
            messages=messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )
        yield result.text

    def is_configured(self) -> bool:
        return True
