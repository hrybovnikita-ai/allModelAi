import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from providers.base import GenerateResult
from router import AIRouter
from utils.errors import ProviderError, request_timeout


class Provider:
    def __init__(self, name, error=None):
        self.name = name
        self.generate = AsyncMock(side_effect=error, return_value=GenerateResult(
            text="recovered", model=f"{name}-default", provider=name,
        ))

    def is_configured(self):
        return True


@pytest.mark.parametrize("prefer", [["openai", "gemini"], [" OPENAI ", "openai", "Gemini"]])
def test_fallback_uses_destination_default_and_normalizes_provider_names(prefer):
    first = Provider("openai", request_timeout("openai"))
    second = Provider("gemini")
    factories = {"openai": lambda: first, "gemini": lambda: second}
    async def run():
        with patch("router.PROVIDER_FACTORIES", factories), \
             patch("router.model_exists", side_effect=lambda provider, model: provider == "openai"), \
             patch("router.resolve_model_id", side_effect=lambda provider, model: model), \
             patch("services.fallback_policy.sleep_backoff", new_callable=AsyncMock):
            return await AIRouter().smart_generate(
                messages=[{"role": "user", "content": "hi"}],
                prefer=prefer, model="gpt-explicit",
            )
    result = asyncio.run(run())
    assert result.fallback_used is True
    assert first.generate.await_count == 1
    assert first.generate.call_args.kwargs["model"] == "gpt-explicit"
    assert second.generate.call_args.kwargs["model"] == ""
    assert result.actual_provider == "gemini"


def test_fallback_disabled_preserves_explicit_model_and_error():
    first = Provider("openai", request_timeout("openai"))
    second = Provider("gemini")
    async def run():
        with patch("router.PROVIDER_FACTORIES", {"openai": lambda: first, "gemini": lambda: second}), \
             patch("router.model_exists", return_value=True), \
             patch("router.resolve_model_id", side_effect=lambda provider, model: model):
            await AIRouter().smart_generate(messages=[], prefer=["openai", "gemini"],
                                            model="gpt-explicit", enable_fallback=False)
    with pytest.raises(ProviderError) as caught:
        asyncio.run(run())
    assert caught.value.code == "REQUEST_TIMEOUT"
    assert first.generate.call_args.kwargs["model"] == "gpt-explicit"
    second.generate.assert_not_awaited()
