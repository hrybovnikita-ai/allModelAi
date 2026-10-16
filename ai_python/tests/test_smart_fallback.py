"""Tests for Python AIRouter automatic fallback policy."""

from __future__ import annotations

import asyncio
from typing import Any, Optional
from unittest.mock import patch

from providers.base import GenerateResult, TokenUsage
from router import AIRouter
from services.fallback_policy import may_retry, max_attempts
from utils.errors import ProviderError, authentication_error, rate_limited, request_timeout


class _FakeProvider:
    def __init__(
        self,
        name: str,
        *,
        configured: bool = True,
        error: Optional[ProviderError] = None,
        text: str = "ok",
    ):
        self.name = name
        self._configured = configured
        self._error = error
        self._text = text
        self._default_model = f"{name}-model"
        self.calls = 0

    def is_configured(self) -> bool:
        return self._configured

    async def generate(self, **kwargs: Any) -> GenerateResult:
        self.calls += 1
        if self._error:
            raise self._error
        return GenerateResult(
            text=self._text,
            model=self._default_model,
            provider=self.name,
            usage=TokenUsage(input_tokens=1, output_tokens=1, total_tokens=2),
            raw={},
        )


def test_may_retry_skips_auth_and_allows_transient():
    assert may_retry(authentication_error("openai")) is False
    assert may_retry(rate_limited("openai")) is True
    assert may_retry(request_timeout("openai")) is True
    assert max_attempts() >= 1


def test_smart_generate_recovers_after_timeout():
    failing = _FakeProvider("openai", error=request_timeout("openai"))
    healthy = _FakeProvider("gemini", text="recovered")

    factories = {
        "openai": lambda: failing,
        "gemini": lambda: healthy,
    }

    async def run():
        with patch("router.PROVIDER_FACTORIES", factories):
            with patch("router.model_exists", return_value=True):
                with patch("router.resolve_model_id", side_effect=lambda _p, m: m):
                    with patch("services.fallback_policy.backoff_base_ms", return_value=1):
                        router = AIRouter()
                        return await router.smart_generate(
                            messages=[{"role": "user", "content": "hi"}],
                            prefer=["openai", "gemini"],
                        )

    result = asyncio.run(run())
    assert result.text == "recovered"
    assert getattr(result, "fallback_used") is True
    assert getattr(result, "requested_provider") == "openai"
    assert getattr(result, "actual_provider") == "gemini"
    assert failing.calls == 1
    assert healthy.calls == 1


def test_smart_generate_does_not_retry_auth_failure():
    failing = _FakeProvider("openai", error=authentication_error("openai"))
    healthy = _FakeProvider("gemini", text="should-not-run")

    factories = {
        "openai": lambda: failing,
        "gemini": lambda: healthy,
    }

    async def run():
        with patch("router.PROVIDER_FACTORIES", factories):
            with patch("router.model_exists", return_value=True):
                with patch("router.resolve_model_id", side_effect=lambda _p, m: m):
                    router = AIRouter()
                    return await router.smart_generate(
                        messages=[{"role": "user", "content": "hi"}],
                        prefer=["openai", "gemini"],
                    )

    try:
        asyncio.run(run())
        raised = None
    except ProviderError as exc:
        raised = exc

    assert raised is not None
    assert raised.code == "AUTHENTICATION_ERROR"
    assert failing.calls == 1
    assert healthy.calls == 0


def test_smart_generate_prevents_infinite_loop():
    always_fail = _FakeProvider("openai", error=rate_limited("openai"))
    also_fail = _FakeProvider("gemini", error=rate_limited("gemini"))
    third_fail = _FakeProvider("anthropic", error=rate_limited("anthropic"))
    fourth = _FakeProvider("grok", error=rate_limited("grok"))

    factories = {
        "openai": lambda: always_fail,
        "gemini": lambda: also_fail,
        "anthropic": lambda: third_fail,
        "grok": lambda: fourth,
    }

    async def run():
        with patch("router.PROVIDER_FACTORIES", factories):
            with patch("router.model_exists", return_value=True):
                with patch("router.resolve_model_id", side_effect=lambda _p, m: m):
                    with patch("services.fallback_policy.max_attempts", return_value=3):
                        with patch("services.fallback_policy.backoff_base_ms", return_value=1):
                            router = AIRouter()
                            return await router.smart_generate(
                                messages=[{"role": "user", "content": "hi"}],
                                prefer=["openai", "gemini", "anthropic", "grok"],
                            )

    try:
        asyncio.run(run())
        raised = None
    except ProviderError as exc:
        raised = exc

    assert raised is not None
    total_calls = always_fail.calls + also_fail.calls + third_fail.calls + fourth.calls
    assert total_calls == 3
    assert fourth.calls == 0
