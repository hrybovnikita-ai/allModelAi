"""Python AI Engine — audit + unified neural training API."""

from __future__ import annotations

from typing import Any, Dict, Optional

try:
    from fastapi import APIRouter, Header, HTTPException
    from pydantic import BaseModel, Field
except ImportError:
    APIRouter = None  # type: ignore[misc, assignment]
    BaseModel = object  # type: ignore[misc, assignment]

from config import INTERNAL_SERVICE_TOKEN
from engine.audit import build_engine_audit
from engine.neural.registry import list_algorithms, run_algorithm


def _require_internal_token(x_internal_token: Optional[str]) -> None:
    if not INTERNAL_SERVICE_TOKEN:
        return
    if (x_internal_token or "").strip() != INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid internal service token")


class EngineTrainRequest(BaseModel):
    algorithmId: str = Field(..., min_length=3, max_length=80)
    params: Dict[str, Any] = Field(default_factory=dict)


def register_engine_routes(app: Any) -> None:
    if APIRouter is None:
        return

    router = APIRouter(prefix="/engine", tags=["ai-engine"])

    @router.get("/audit")
    def engine_audit(x_internal_token: Optional[str] = Header(default=None)):
        _require_internal_token(x_internal_token)
        return build_engine_audit()

    @router.get("/algorithms")
    def engine_algorithms(x_internal_token: Optional[str] = Header(default=None)):
        _require_internal_token(x_internal_token)
        return {"ok": True, "algorithms": list_algorithms()}

    @router.post("/train")
    def engine_train(
        req: EngineTrainRequest,
        x_internal_token: Optional[str] = Header(default=None),
    ):
        _require_internal_token(x_internal_token)
        result = run_algorithm(req.algorithmId, req.params)
        if not result.get("ok", True) and result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result

    @router.get("/health")
    def engine_health():
        return {"ok": True, "subsystem": "ai_python_engine", "phase": "1-2"}

    app.include_router(router)

    internal = APIRouter(prefix="/internal/ai", tags=["ai-engine-internal"])

    @internal.get("/models")
    def internal_models(x_internal_token: Optional[str] = Header(default=None)):
        _require_internal_token(x_internal_token)
        return {"ok": True, "algorithms": list_algorithms()}

    @internal.post("/train")
    def internal_train(
        req: EngineTrainRequest,
        x_internal_token: Optional[str] = Header(default=None),
    ):
        _require_internal_token(x_internal_token)
        return run_algorithm(req.algorithmId, req.params)

    app.include_router(internal)
