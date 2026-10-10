"""Guarded placeholder — no training runs without manual approval."""

import sys


def main() -> int:
    print(
        "AllModelAI fine-tuning is disabled by default.\n"
        "See ai_python/fine_tuning/README.md for approval, dataset, and evaluation requirements.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
