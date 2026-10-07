from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from providers.base import ChatMessage, GenerateResult, TokenUsage
from router import AIRouter
from utils.errors import ProviderError


class RouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_unknown_provider(self):
        router = AIRouter()
        with self.assertRaises(ProviderError) as ctx:
            await router.generate(provider="unknown", model="x", messages=[{"role": "user", "content": "hi"}])
        self.assertEqual(ctx.exception.code, "INVALID_PROVIDER")

    async def test_missing_api_key(self):
        router = AIRouter()
        with patch("providers.openai_provider.OpenAIProvider.is_configured", return_value=False):
            with self.assertRaises(ProviderError) as ctx:
                await router.generate(provider="openai", model="gpt-4.1-mini", messages=[{"role": "user", "content": "hi"}])
        self.assertEqual(ctx.exception.code, "MISSING_API_KEY")

    async def test_generate_normalizes_response(self):
        router = AIRouter()
        mock_provider = AsyncMock()
        mock_provider.is_configured.return_value = True
        mock_provider.generate.return_value = GenerateResult(
            provider="openai",
            model="gpt-4.1-mini",
            text="Hello",
            usage=TokenUsage(input_tokens=3, output_tokens=2, total_tokens=5),
        )

        with patch.object(router, "get_provider", return_value=mock_provider):
            result = await router.generate(
                provider="openai",
                model="mini",
                messages=[{"role": "user", "content": "Hello!"}],
            )
        self.assertEqual(result.text, "Hello")
        self.assertEqual(result.usage.total_tokens, 5)


if __name__ == "__main__":
    unittest.main()
