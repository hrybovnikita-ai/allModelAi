"""Unit tests for Kokoro text prep (no model download required)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.kokoro_tts import prepare_text_for_speech, split_into_chunks, KOKORO_VOICES


def test_prepare_strips_code_and_urls():
    text = prepare_text_for_speech("Hi ```py\nprint(1)\n``` see https://example.com end")
    assert "Code block omitted" in text
    assert "link" in text
    assert "print" not in text
    assert text.endswith(".")


def test_chunking_keeps_sentence_boundaries():
    sentences = " ".join(f"Sentence number {i}." for i in range(40))
    chunks = split_into_chunks(sentences, max_chars=120)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) <= 160  # hard wrap slack
        assert chunk.strip()


def test_voices_include_requested_ids():
    ids = {v["id"] for v in KOKORO_VOICES}
    assert ids == {"am_michael", "am_adam", "af_heart", "af_bella", "af_nicole"}
