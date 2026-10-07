"""Normalized LLM provider errors for AllModelAI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ProviderError(Exception):
    code: str
    message: str
    status_code: int = 502
    details: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            payload["details"] = self.details
        return payload


def missing_api_key(provider: str) -> ProviderError:
    return ProviderError(
        code="MISSING_API_KEY",
        message=f"{provider} is not configured on the server. Set the provider API key in backend/.env.",
        status_code=503,
    )


def invalid_provider(name: str) -> ProviderError:
    return ProviderError(
        code="INVALID_PROVIDER",
        message=f"Unknown provider: {name}",
        status_code=400,
    )


def invalid_model(provider: str, model: str) -> ProviderError:
    return ProviderError(
        code="INVALID_MODEL",
        message=f"Model '{model}' is not available for provider '{provider}'.",
        status_code=400,
    )


def authentication_error(provider: str, detail: str = "") -> ProviderError:
    return ProviderError(
        code="AUTHENTICATION_ERROR",
        message=f"{provider} authentication failed. Check server API keys.",
        status_code=401,
        details={"hint": detail[:200]} if detail else None,
    )


def rate_limited(provider: str) -> ProviderError:
    return ProviderError(
        code="RATE_LIMITED",
        message=f"{provider} rate limit reached. Try again shortly.",
        status_code=429,
    )


def request_timeout(provider: str) -> ProviderError:
    return ProviderError(
        code="REQUEST_TIMEOUT",
        message=f"{provider} request timed out.",
        status_code=504,
    )


def provider_unavailable(provider: str, detail: str = "") -> ProviderError:
    return ProviderError(
        code="PROVIDER_UNAVAILABLE",
        message=f"{provider} is temporarily unavailable.",
        status_code=503,
        details={"hint": detail[:200]} if detail else None,
    )


def bad_provider_response(provider: str, detail: str = "") -> ProviderError:
    return ProviderError(
        code="BAD_PROVIDER_RESPONSE",
        message=f"{provider} returned an unexpected response.",
        status_code=502,
        details={"hint": detail[:200]} if detail else None,
    )


def map_http_exception(provider: str, exc: Exception) -> ProviderError:
    text = str(exc).lower()
    if "timeout" in text or "timed out" in text:
        return request_timeout(provider)
    if "401" in text or "unauthorized" in text or "invalid api key" in text:
        return authentication_error(provider)
    if "429" in text or "rate limit" in text:
        return rate_limited(provider)
    return provider_unavailable(provider, str(exc)[:200])
