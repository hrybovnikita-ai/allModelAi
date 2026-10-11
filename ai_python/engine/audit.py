"""
Phase 1 — inventory of ai_python capabilities and integration gaps.
No fabricated metrics; describes what exists in the repository.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Dict, List

_ROOT = Path(__file__).resolve().parents[1]


def _module_exists(dotted: str) -> bool:
    return importlib.util.find_spec(dotted) is not None


def build_engine_audit() -> Dict[str, Any]:
    systems: Dict[str, Any] = {
        "neural_network_engine": {
            "status": "partial",
            "modules": [
                "learning/linear_regression/numpy_lr.py",
                "learning/gradient_descent/gd.py",
                "learning/pytorch/linear_torch.py",
                "learning/logistic_regression/torch_logistic.py",
                "learning/neural_network/torch_mlp.py",
                "learning/sklearn/linear_sklearn.py",
                "learning/sklearn/logistic_sklearn.py",
                "learning/training/jobs.py",
                "learning/training/async_runner.py",
                "models/model_storage.py",
                "engine/neural/* (registry, metrics, training loop)",
            ],
            "apis": ["/training/*", "/ai/train/*", "/labs/*", "/engine/algorithms"],
            "gaps": [
                "Unified checkpoint API on all trainers",
                "Production dataset upload pipeline",
            ],
        },
        "prompt_intelligence": {
            "status": "not_implemented",
            "existing_hooks": ["router.py smart_generate (provider fallback only)"],
            "node_counterpart": "backend/src/services/smartRouter2/*",
            "gaps": [
                "POST /internal/ai/classify",
                "sklearn baseline classifier + history",
                "Low-confidence fallback to Node Smart Router",
            ],
        },
        "semantic_memory": {
            "status": "partial_node",
            "python": "none dedicated",
            "node": [
                "backend/src/services/rag/knowledgeBaseService.js",
                "user_ai_memories tables",
                "backend/src/intelligence/* (collections, retrieval eval)",
            ],
            "gaps": [
                "POST /internal/ai/memory/search",
                "Sentence-transformers service",
                "Settings UI memory panel",
            ],
        },
        "answer_quality_analyzer": {
            "status": "partial",
            "python": ["learning/improvement/analytics.py", "/improvement/analyze"],
            "node": ["backend/src/intelligence/selfEvaluationService.js", "eval_benchmark_* tables"],
            "gaps": [
                "POST /internal/ai/evaluate",
                "Isolated code-exec sandbox",
                "AI judge with rubric versioning in Python",
            ],
        },
        "training_studio": {
            "status": "partial_ui",
            "frontend": [
                "frontend/src/components/PythonAILab/PythonAILab.jsx",
                "frontend/src/components/ModelLab/ModelLab.jsx",
                "frontend/src/components/AiTraining/AiTrainingHub.jsx",
                "frontend/src/components/Developer/AILearningDashboard.jsx",
            ],
            "gaps": [
                "Single Training Studio with 5 panels",
                "Prompt intelligence panel",
                "Memory panel in Settings",
            ],
        },
    }

    integration = {
        "fastapi_entry": "main.py --serve",
        "node_bridges": [
            "backend/src/services/aiPythonBridge.js",
            "backend/src/services/aiMlLearningGateway.js",
            "backend/src/services/aiTrainingLabBridge.js",
            "backend/src/controllers/aiPythonController.js",
            "backend/src/controllers/trainingLabController.js",
        ],
        "env": ["AI_PYTHON_PORT", "AI_PYTHON_SERVICE_URL", "AI_PYTHON_INTERNAL_TOKEN (recommended)"],
        "deployment_note": (
            "Run FastAPI as a private worker (Render Docker / Fly / VM). "
            "Node on Render proxies authenticated /api/ai-python/* and /api/training/*."
        ),
    }

    dependencies = {
        "numpy": _module_exists("numpy"),
        "pandas": _module_exists("pandas"),
        "sklearn": _module_exists("sklearn"),
        "torch": _module_exists("torch"),
        "fastapi": _module_exists("fastapi"),
        "matplotlib": _module_exists("matplotlib"),
    }

    tests: List[str] = []
    tests_dir = _ROOT / "tests"
    if tests_dir.is_dir():
        tests = sorted(p.name for p in tests_dir.glob("test_*.py"))

    return {
        "phase": 1,
        "root": str(_ROOT),
        "systems": systems,
        "integration": integration,
        "dependencies": dependencies,
        "test_modules": tests,
        "principles": [
            "Measured metrics only from real training runs",
            "No autonomous routing policy promotion",
            "Internal Python APIs stay off the public internet",
        ],
    }
