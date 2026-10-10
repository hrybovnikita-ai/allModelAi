"""Analyze authorized improvement signals — no raw private chat ingestion."""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List


def _rate(values: List[Dict[str, Any]], key: str) -> float | None:
    nums = [float(row[key]) for row in values if row.get(key) is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def analyze_improvement_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    feedback = payload.get("feedback") or {}
    router = payload.get("routerPerformance") or {}
    retrieval = payload.get("retrieval") or {}
    categories = feedback.get("categories") or []

    down = sum(int(row.get("count", 0)) for row in feedback.get("totals", []) if row.get("rating") == "down")
    up = sum(int(row.get("count", 0)) for row in feedback.get("totals", []) if row.get("rating") == "up")
    total_fb = down + up

    cat_counter = Counter()
    for row in categories:
        cat = str(row.get("category") or "other")
        cat_counter[cat] += int(row.get("count", 0))

    recurring_errors = [
        {"category": cat, "count": count}
        for cat, count in cat_counter.most_common(5)
        if count > 0
    ]

    router_rows = []
    for provider, stats in router.items():
        if not isinstance(stats, dict):
            continue
        router_rows.append(
            {
                "provider": provider,
                "successRate": stats.get("successRate"),
                "avgLatencyMs": stats.get("avgLatencyMs"),
                "sampleSize": stats.get("sampleSize"),
            }
        )
    router_rows.sort(key=lambda row: (-(row.get("sampleSize") or 0)))

    retrieval_scores = retrieval.get("scores") or []
    avg_relevance = _rate(retrieval_scores, "score")

    recommendations: List[str] = []
    if total_fb and down / max(total_fb, 1) > 0.35:
        recommendations.append(
            "Negative feedback rate is elevated — review top error categories and add Knowledge Base documents for those topics.",
        )
    if recurring_errors:
        top = recurring_errors[0]["category"]
        recommendations.append(f'Most common issue category: "{top}". Consider prompt clarity or router task routing for that case.')
    weak_providers = [
        row["provider"]
        for row in router_rows
        if row.get("sampleSize", 0) >= 5 and row.get("successRate") is not None and row["successRate"] < 0.75
    ]
    if weak_providers:
        recommendations.append(
            f"Router telemetry shows weaker providers: {', '.join(weak_providers[:3])}. Check API keys, quotas, or disable adaptive routing for those slugs.",
        )
    if avg_relevance is not None and avg_relevance < 0.35:
        recommendations.append(
            "Retrieval relevance scores are low — re-index documents, reduce chunk size, or upload fresher sources.",
        )
    if not recommendations:
        recommendations.append(
            "No critical issues detected in supplied aggregates. Continue collecting feedback and router metrics before changing defaults.",
        )

    return {
        "ok": True,
        "summary": {
            "feedbackUp": up,
            "feedbackDown": down,
            "feedbackTotal": total_fb,
            "avgRetrievalScore": avg_relevance,
            "routerProvidersSampled": len(router_rows),
        },
        "recurringErrors": recurring_errors,
        "routerPerformance": router_rows[:8],
        "recommendations": recommendations,
        "disclaimer": "Aggregated analytics only. Does not modify LLM weights or train on private conversations.",
    }
