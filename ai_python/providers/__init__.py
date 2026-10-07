from providers.anthropic_provider import AnthropicProvider
from providers.deepseek_provider import DeepSeekProvider
from providers.gemini_provider import GeminiProvider
from providers.grok_provider import GrokProvider
from providers.kimi_provider import KimiProvider
from providers.mistral_provider import MistralProvider
from providers.openai_provider import OpenAIProvider
from providers.openrouter_provider import OpenRouterProvider

PROVIDER_FACTORIES = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "grok": GrokProvider,
    "deepseek": DeepSeekProvider,
    "mistral": MistralProvider,
    "kimi": KimiProvider,
    "openrouter": OpenRouterProvider,
}

__all__ = list(PROVIDER_FACTORIES.keys()) + ["PROVIDER_FACTORIES"]
