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
        **kwargs: Any,
    ) -> GenerateResult:
        """
        Compatibility hook for future Smart Router integration.
        Picks the first configured provider from `prefer` (default: openrouter, openai, gemini, anthropic).
        Does not replace Node Smart Router — opt-in from backend only.
        """
        order = prefer or ["openrouter", "openai", "gemini", "anthropic", "grok", "mistral", "deepseek", "kimi"]
        last_error: Optional[ProviderError] = None
        for name in order:
            factory = PROVIDER_FACTORIES.get(name)
            if not factory:
                continue
            instance = factory()
            if not instance.is_configured():
                continue
            try:
                default_model = model or getattr(instance, "_default_model", "")
                return await self.generate(
                    provider=name,
                    model=default_model,
                    messages=messages,
                    **kwargs,
                )
            except ProviderError as exc:
                last_error = exc
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
