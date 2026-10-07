from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from providers.openai_compatible import OpenAICompatibleProvider
from providers.openrouter_provider import OpenRouterProvider, _openrouter_key
from services.chat_service import extract_system, parse_messages
from services.model_registry import resolve_model_id


class ProviderHelperTests(unittest.TestCase):
    def test_parse_messages_and_system(self):
        messages = parse_messages(
            [
                {"role": "system", "content": "Be concise"},
                {"role": "user", "content": "Hi"},
            ]
        )
        system, rest = extract_system(messages)
        self.assertEqual(system, "Be concise")
        self.assertEqual(len(rest), 1)

    def test_resolve_model_from_variants(self):
        resolved = resolve_model_id("openai", "mini")
        self.assertTrue(resolved)

    def test_openrouter_key_priority(self):
        with patch.dict(
            "os.environ",
            {"ALLMODELAI_OPENROUTER_API_KEY": "sk-or-test", "OPENROUTER_API_KEY": "other"},
            clear=True,
        ):
            self.assertEqual(_openrouter_key(), "sk-or-test")

    def test_openai_compatible_missing_key(self):
        provider = OpenAICompatibleProvider(
            provider_name="test",
            api_key_env="MISSING_TEST_KEY",
            base_url="https://example.com/v1",
            default_model="demo",
        )
        self.assertFalse(provider.is_configured())


if __name__ == "__main__":
    unittest.main()
