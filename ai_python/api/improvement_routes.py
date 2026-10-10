"""Self-improvement analytics API (aggregated signals only)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

try:
    from fastapi import APIRouter
    from pydantic import BaseModel, Field
except ImportError:
    APIRouter = None  # type: ignore[misc, assignment]
    BaseModel = object  # type: ignore[misc, assignment]

from learning.improvement.analytics import analyze_improvement_payload


class FeedbackTotals(BaseModel):
    rating: str
    count: int


class FeedbackCategory(BaseModel):
    category: str
    count: int


class FeedbackBlock(BaseModel):
    totals: List[FeedbackTotals] = Field(default_factory=list)
    categories: List[FeedbackCategory] = Field(default_factory=list)


class RetrievalScore(BaseModel):
    score: float


class AnalyzeRequest(BaseModel):
    feedback: Optional[FeedbackBlock] = None
    routerPerformance: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    retrieval: Dict[str, List[RetrievalScore]] = Field(default_factory=dict)


def register_improvement_routes(app: Any) -> None:
    if APIRouter is None:
        return

    router = APIRouter(prefix="/improvement", tags=["improvement"])

    @router.post("/analyze")
    def analyze(req: AnalyzeRequest):
        payload = req.model_dump()
        return analyze_improvement_payload(payload)

    app.include_router(router)
