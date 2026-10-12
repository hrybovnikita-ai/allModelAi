"""Neural training engine package (submodules imported explicitly to avoid cycles)."""

from __future__ import annotations

__all__ = ["ALGORITHM_REGISTRY", "list_algorithms", "run_algorithm"]


def __getattr__(name: str):
    if name in __all__:
        from engine.neural import registry as reg

        return getattr(reg, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
