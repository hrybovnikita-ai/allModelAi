"""AIRouter — provider selection and normalized responses."""

from __future__ import annotations

from typing import Any, Optional

from providers import PROVIDER_FACTORIES
from providers.base import AIProvider, ChatMessage, GenerateResult
from services.chat_service import extract_system, parse_messages
from services.model_registry import model_exists, resolve_model_id
from utils.errors import ProviderError, invalid_model, invalid_provider, missing_api_key


class AIRouter:
    def __init__(self) -> None:
        self._instances: dict[str, AIProvider] = {}

    def get_provider(self, provider: str) -> AIProvider:
        key = (provider or "").strip().lower()
        factory = PROVIDER_FACTORIES.get(key)
        if not factory:
            raise invalid_provider(key)
        if key not in self._instances:
            self._instances[key] = factory()
        instance = self._instances[key]
        if not instance.is_configured():
            raise missing_api_key(key)
        return instance

    async def generate(
        self,
        *,
        provider: str,
        model: str,
        messages: list[dict[str, Any]] | None = None,
        prompt: str | None = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
    ) -> GenerateResult:
        parsed = parse_messages(messages or [])
        if prompt and not parsed:
            parsed = [ChatMessage(role="user", content=prompt)]
        sys_from_messages, parsed = extract_system(parsed)
        merged_system = system or sys_from_messages

        provider_key = (provider or "").strip().lower()
        client = self.get_provider(provider_key)
        resolved_model = resolve_model_id(provider_key, model)
        if model and not model_exists(provider_key, model) and "/" not in model:
            raise invalid_model(provider_key, model)
        return await client.generate(
            model=resolved_model,
            messages=parsed,
            system=merged_system,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )

    async def smart_generate(
        self,
        *,
        messages: list[dict[str, Any]],
        prefer: Optional[list[str]] = None,
        model: Optional[str] = None,
        enable_fallback: bool = True,
        **kwargs: Any,
    ) -> GenerateResult:
        """
        Opt-in multi-provider generation with bounded automatic fallback.

        Does not replace Node Smart Router. Skips auth/invalid errors, applies
        exponential backoff, and prevents infinite provider loops.
        """
        from time import perf_counter

        from services.fallback_policy import (
            FallbackEvent,
            FallbackResult,
            may_retry,
            max_attempts,
            sleep_backoff,
        )

        order = prefer or [
            "openrouter",
            "openai",
            "gemini",
            "anthropic",
            "grok",
            "mistral",
            "deepseek",
            "kimi",
        ]
        last_error: Optional[ProviderError] = None
        visited: set[str] = set()
        events: list[FallbackEvent] = []
        attempts = 0
        requested_provider = ""
        attempt_index = 0

        for name in order:
            name = (name or "").strip().lower()
            if attempts >= max_attempts():
                break
            factory = PROVIDER_FACTORIES.get(name)
            if not factory:
                continue
            if name in visited:
                continue
            instance = factory()
            if not instance.is_configured():
                continue
            if not requested_provider:
                requested_provider = name
            if attempts > 0:
                if not enable_fallback:
                    break
                await sleep_backoff(attempt_index)
            visited.add(name)
            started = perf_counter()
            try:
                # Explicit model IDs belong to the initial provider only.
                # An empty ID lets each fallback provider choose its own default.
                default_model = (model or "") if attempts == 0 else ""
                result = await self.generate(
                    provider=name,
                    model=default_model,
                    messages=messages,
                    **kwargs,
                )
                latency_ms = (perf_counter() - started) * 1000.0
                events.append(
                    FallbackEvent(
                        requested_provider=requested_provider or name,
                        actual_provider=name,
                        category="ok",
                        success=True,
                        latency_ms=latency_ms,
                    )
                )
                # Attach fallback metadata for callers without breaking GenerateResult shape.
                if hasattr(result, "__dict__"):
                    meta = FallbackResult(
                        result=result,
                        requested_provider=requested_provider or name,
                        actual_provider=name,
                        fallback_used=name != (requested_provider or name),
                        events=events,
                    )
                    setattr(result, "fallback_meta", meta)
                    setattr(result, "fallback_used", meta.fallback_used)
                    setattr(result, "requested_provider", meta.requested_provider)
                    setattr(result, "actual_provider", meta.actual_provider)
                    notice = meta.notice()
                    if notice:
                        setattr(result, "fallback_notice", notice)
                return result
            except ProviderError as exc:
                attempts += 1
                latency_ms = (perf_counter() - started) * 1000.0
                events.append(
                    FallbackEvent(
                        requested_provider=requested_provider or name,
                        actual_provider=name,
                        category=exc.code,
                        success=False,
                        latency_ms=latency_ms,
                    )
                )
                last_error = exc
                if not enable_fallback or not may_retry(exc):
                    break
                attempt_index += 1
                continue
        if last_error:
            raise last_error
        raise missing_api_key("any LLM provider")

    def list_models(self) -> dict[str, Any]:
        from services.model_registry import build_registry

        configured = {
            name: factory().is_configured()
            for name, factory in PROVIDER_FACTORIES.items()
        }
        return {"providers": build_registry(), "configured": configured}


_default_router: Optional[AIRouter] = None


def get_router() -> AIRouter:
    global _default_router
    if _default_router is None:
        _default_router = AIRouter()
    return _default_router
