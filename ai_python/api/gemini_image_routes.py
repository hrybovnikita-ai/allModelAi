"""FastAPI routes for Gemini Flash Lite image generation."""

from __future__ import annotations

from typing import Any, Optional

try:
    from fastapi import APIRouter, Body
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel, Field

    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    APIRouter = None  # type: ignore[misc, assignment]
    Body = None  # type: ignore[misc, assignment]
    JSONResponse = object  # type: ignore[misc, assignment]
    BaseModel = object  # type: ignore[misc, assignment]
    Field = lambda *args, **kwargs: None  # type: ignore


if FASTAPI_AVAILABLE:

    class GeminiImageGenerateBody(BaseModel):
        """JSON body for POST /gemini-image/generate (module-level so FastAPI resolves it as body)."""

        prompt: str = Field(..., min_length=1, max_length=4000)


def register_gemini_image_routes(app: Any) -> None:
    if not FASTAPI_AVAILABLE:
        return

    from services import gemini_image_service as svc

    router = APIRouter(prefix="/gemini-image", tags=["gemini-image"])

    @router.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "service": "gemini_image"}

    @router.get("/verify")
    def verify() -> dict[str, Any]:
        return svc.verify_gemini_image_access()

    def _status_for_error(out: dict[str, Any]) -> int:
        code = str(out.get("code") or "")
        if code == "INVALID_PROMPT":
            return 400
        if code == "GEMINI_RATE_LIMIT":
            return 429
        if code == "GEMINI_BILLING":
            return 402
        if code in ("GEMINI_AUTH", "GEMINI_FORBIDDEN", "GEMINI_NOT_CONFIGURED"):
            return 401
        if code == "GEMINI_MODEL_UNAVAILABLE":
            return 404
        if code == "PYTHON_SERVICE_DOWN":
            return 503
        return 502

    @router.post("/generate")
    def generate(payload: GeminiImageGenerateBody = Body(...)):
        out = svc.generate_flash_lite_image(payload.prompt)
        if not out.get("ok"):
            return JSONResponse(status_code=_status_for_error(out), content=out)
        return out

    app.include_router(router)
