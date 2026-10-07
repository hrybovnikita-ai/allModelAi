"""FastAPI routes for the Python multi-provider LLM layer."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from router import get_router
from utils.errors import ProviderError


class ChatMessageIn(BaseModel):
    role: str = "user"
    content: str


class ChatRequest(BaseModel):
    provider: str
    model: str
    messages: list[ChatMessageIn] = Field(default_factory=list)
    prompt: Optional[str] = None
    system: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: bool = False
    smart: bool = False


def register_provider_routes(app) -> None:
    router = get_router()

    @app.get("/llm/health")
    def llm_health():
        return {"status": "ok", "service": "allmodelai_python_llm"}

    @app.get("/llm/models")
    def llm_models():
        return router.list_models()

    @app.post("/llm/chat")
    async def llm_chat(req: ChatRequest):
        try:
            if req.smart:
                result = await router.smart_generate(
                    messages=[m.model_dump() for m in req.messages],
                    model=req.model or None,
                    temperature=req.temperature,
                    max_tokens=req.max_tokens,
                    stream=req.stream,
                )
            else:
                result = await router.generate(
                    provider=req.provider,
                    model=req.model,
                    messages=[m.model_dump() for m in req.messages],
                    prompt=req.prompt,
                    system=req.system,
                    temperature=req.temperature,
                    max_tokens=req.max_tokens,
                    stream=req.stream,
                )
            return {"ok": True, **result.to_dict()}
        except ProviderError as exc:
            return {"ok": False, **exc.to_dict()}
        except Exception as exc:
            return {
                "ok": False,
                "code": "PROVIDER_UNAVAILABLE",
                "message": "The AI service encountered an error.",
            }
