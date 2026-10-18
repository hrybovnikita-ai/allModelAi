"""Generate a Kokoro-82M English WAV sample for AllModelAI voice testing."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

OUTPUT_DIR = ROOT / "test_output" / "kokoro"
SAMPLE_RATE = 24_000
VOICE = "am_michael"
SPEED = 1.0


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        from services.espeak_bootstrap import bootstrap_espeak
        from services.kokoro_tts import synthesize_wav
    except ImportError as exc:
        print(f"ERROR: Kokoro stack import failed ({exc})", file=sys.stderr)
        print("Install with: python -m pip install kokoro soundfile", file=sys.stderr)
        return 1

    data_path = bootstrap_espeak()
    if data_path:
        print(f"espeak-ng data: {data_path}")

    text = (
        "Hello! Welcome to AllModelAI. "
        "I am your AI voice assistant. "
        "How can I help you today?"
    )

    print(f"Generating Kokoro-82M speech voice={VOICE!r} speed={SPEED}…")
    try:
        result = synthesize_wav(text, voice=VOICE, speed=SPEED)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    out_path = OUTPUT_DIR / "kokoro_am_michael.wav"
    out_path.write_bytes(result.audio)

    print(f"Wrote {out_path}")
    print(
        f"Sample rate: {result.sample_rate} Hz | "
        f"duration: {result.duration_sec:.2f}s | "
        f"bytes: {len(result.audio)} | model: {result.model}"
    )
    print("Voice generation completed!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
