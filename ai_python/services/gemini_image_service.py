"""
Gemini image generation for Flash Lite image models via google-genai.

Uses `client.models.generate_content` with image output modalities (Gemini API `v1beta`).
Uses GEMINI_API_KEY from the environment (loaded via config / .env). Never hardcodes secrets.
"""

from __future__ import annotations

import base64
import os
from typing import Any, Optional

GEMINI_FLASH_LITE_IMAGE_MODEL = "gemini-3.1-flash-lite-image"

_DEFAULT_IMAGE_SIZE = "1K"


def _api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def is_gemini_configured() -> bool:
    return bool(_api_key())


def _get_client():
    from google import genai

    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key, http_options=genai.types.HttpOptions(api_version="v1beta"))


def verify_gemini_image_access() -> dict[str, Any]:
    """
    Lightweight check: key present and target model metadata is retrievable.
    Uses a single models.get when possible (no full catalog scan).
    """
    if not is_gemini_configured():
        return {
            "ok": False,
            "configured": False,
            "code": "GEMINI_NOT_CONFIGURED",
            "message": "GEMINI_API_KEY is not set.",
            "model": GEMINI_FLASH_LITE_IMAGE_MODEL,
        }
    try:
        client = _get_client()
        model_name = GEMINI_FLASH_LITE_IMAGE_MODEL
        found = False
        for candidate in (model_name, f"models/{model_name}"):
            try:
                info = client.models.get(model=candidate)
                found = info is not None
                if found:
                    break
            except Exception:
                continue
        if not found:
            return {
                "ok": False,
                "configured": True,
                "code": "GEMINI_MODEL_UNAVAILABLE",
                "message": "The image model is not available for this API key or project.",
                "model": GEMINI_FLASH_LITE_IMAGE_MODEL,
            }
        return {
            "ok": True,
            "configured": True,
            "code": None,
            "message": None,
            "model": GEMINI_FLASH_LITE_IMAGE_MODEL,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "configured": True,
            "code": "GEMINI_ACCESS_ERROR",
            "message": str(exc)[:500],
            "model": GEMINI_FLASH_LITE_IMAGE_MODEL,
        }


def _extract_image_and_caption_from_response(response: Any) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
    """Parse GenerateContentResponse for inline image bytes and optional text caption."""
    text_parts: list[str] = []
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) if content is not None else None
        if not parts:
            continue
        for part in parts:
            t = getattr(part, "text", None)
            if t:
                text_parts.append(str(t))
            inline = getattr(part, "inline_data", None)
            if inline is not None:
                data = getattr(inline, "data", None)
                if isinstance(data, (bytes, bytearray)) and data:
                    mime = getattr(inline, "mime_type", None) or "image/png"
                    return bytes(data), str(mime), "\n".join(text_parts) if text_parts else None
                if isinstance(data, str) and data:
                    try:
                        raw = base64.b64decode(data)
                        mime = getattr(inline, "mime_type", None) or "image/png"
                        return raw, str(mime), "\n".join(text_parts) if text_parts else None
                    except Exception:
                        pass
    return None, None, "\n".join(text_parts) if text_parts else None


def generate_flash_lite_image(
    prompt: str,
    *,
    image_size: str = _DEFAULT_IMAGE_SIZE,
) -> dict[str, Any]:
    """
    Generate one image. Returns base64-encoded PNG/JPEG bytes in the response dict on success.
    """
    from google.genai import types as genai_types

    p = (prompt or "").strip()
    if not p:
        return {"ok": False, "code": "INVALID_PROMPT", "message": "Prompt is required.", "retryable": False}

    access = verify_gemini_image_access()
    if not access.get("ok"):
        return {
            "ok": False,
            "code": access.get("code") or "GEMINI_UNAVAILABLE",
            "message": access.get("message") or "Gemini image is not available.",
            "retryable": False,
        }

    try:
        client = _get_client()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "code": "GEMINI_CLIENT_ERROR", "message": str(exc)[:500], "retryable": False}

    size = (image_size or _DEFAULT_IMAGE_SIZE).strip() or _DEFAULT_IMAGE_SIZE
    config = genai_types.GenerateContentConfig(
        http_options=genai_types.HttpOptions(api_version="v1beta"),
        temperature=1.0,
        max_output_tokens=8192,
        top_p=0.95,
        thinking_config=genai_types.ThinkingConfig(thinking_level="MINIMAL"),
        image_config=genai_types.ImageConfig(image_size=size),
        response_modalities=["IMAGE", "TEXT"],
        automatic_continuation=False,
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_FLASH_LITE_IMAGE_MODEL,
            contents=p,
            config=config,
        )
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        code = "GEMINI_GENERATION_FAILED"
        retryable = True
        low = msg.lower()
        if "429" in msg or "resource exhausted" in low or "rate limit" in low:
            code = "GEMINI_RATE_LIMIT"
        elif "404" in msg or "not found" in low or "not supported" in low:
            code = "GEMINI_MODEL_UNAVAILABLE"
            retryable = False
        elif "403" in msg or "permission" in low:
            code = "GEMINI_FORBIDDEN"
            retryable = False
        elif "401" in msg or "api key" in low:
            code = "GEMINI_AUTH"
            retryable = False
        elif "billing" in low or "payment" in low:
            code = "GEMINI_BILLING"
            retryable = False
        return {"ok": False, "code": code, "message": msg[:800], "retryable": retryable}

    image_bytes, mime_hint, caption = _extract_image_and_caption_from_response(response)
    if not image_bytes:
        return {
            "ok": False,
            "code": "GEMINI_NO_IMAGE",
            "message": caption or "The model did not return image data.",
            "retryable": True,
        }

    mime = mime_hint or "image/png"
    b64_out = base64.b64encode(image_bytes).decode("ascii")
    return {
        "ok": True,
        "image_base64": b64_out,
        "mime_type": mime,
        "caption": caption,
        "model": GEMINI_FLASH_LITE_IMAGE_MODEL,
    }
