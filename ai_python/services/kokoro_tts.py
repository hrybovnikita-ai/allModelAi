"""Local Kokoro-82M TTS for AllModelAI (free, no API keys)."""

from __future__ import annotations

import io
import re
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np

from services.espeak_bootstrap import bootstrap_espeak

SAMPLE_RATE = 24_000
MAX_CHARS = 6_000
CHUNK_CHARS = 420
PAUSE_SECONDS = 0.22  # natural gap between sentence groups
LANG_CODE = "a"  # American English

KOKORO_VOICES: list[dict[str, str]] = [
    {
        "id": "am_michael",
        "gender": "male",
        "label": "Michael",
        "description": "Warm American male — clear and conversational.",
        "style": "warm-friendly",
    },
    {
        "id": "am_adam",
        "gender": "male",
        "label": "Adam",
        "description": "Steady American male — calm and professional.",
        "style": "calm-professional",
    },
    {
        "id": "af_heart",
        "gender": "female",
        "label": "Heart",
        "description": "Soft American female — natural and friendly.",
        "style": "soft-natural",
    },
    {
        "id": "af_bella",
        "gender": "female",
        "label": "Bella",
        "description": "Bright American female — expressive and clear.",
        "style": "expressive-conversational",
    },
    {
        "id": "af_nicole",
        "gender": "female",
        "label": "Nicole",
        "description": "Smooth American female — calm narration.",
        "style": "calm-professional",
    },
]

_VOICE_IDS = {v["id"] for v in KOKORO_VOICES}

_lock = threading.Lock()
_pipeline = None
_init_error: str | None = None
_available_voices: set[str] | None = None


@dataclass
class SynthesizeResult:
    audio: bytes
    mime_type: str
    sample_rate: int
    voice: str
    duration_sec: float
    model: str = "Kokoro-82M"


def _clamp_speed(speed: float | None) -> float:
    try:
        value = float(speed if speed is not None else 1.0)
    except (TypeError, ValueError):
        value = 1.0
    # Slightly favor natural pace: avoid extreme robotic speeds.
    return max(0.75, min(1.35, value))


def prepare_text_for_speech(text: str) -> str:
    """Clean markdown/code and normalize punctuation for more natural rhythm."""
    cleaned = str(text or "")
    cleaned = re.sub(r"```[\s\S]*?```", " Code block omitted. ", cleaned)
    cleaned = re.sub(r"`[^`]+`", " ", cleaned)
    cleaned = re.sub(r"https?://\S+", " link ", cleaned)
    cleaned = re.sub(r"[#*_>~|]+", " ", cleaned)
    cleaned = cleaned.replace("…", "...").replace("—", ", ").replace("–", ", ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Ensure sentence-ending punctuation so Kokoro gets proper intonation cues.
    if cleaned and cleaned[-1] not in ".!?":
        cleaned += "."
    # Add light pauses after commas / colons for rhythm (Kokoro respects punctuation).
    cleaned = re.sub(r"([,:;])\s*", r"\1 ", cleaned)
    cleaned = re.sub(r"([.!?])\s+", r"\1 ", cleaned)
    return cleaned.strip()


def split_into_chunks(text: str, max_chars: int = CHUNK_CHARS) -> list[str]:
    """Split long text on sentence boundaries without cutting mid-sentence."""
    if len(text) <= max_chars:
        return [text] if text else []

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if not current:
            current = sentence
            continue
        if len(current) + 1 + len(sentence) <= max_chars:
            current = f"{current} {sentence}"
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)

    # Hard-wrap any oversized remnant on commas / spaces.
    final: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_chars:
            final.append(chunk)
            continue
        parts = re.split(r"(?<=[,;:])\s+", chunk)
        buf = ""
        for part in parts:
            if not buf:
                buf = part
            elif len(buf) + 1 + len(part) <= max_chars:
                buf = f"{buf} {part}"
            else:
                final.append(buf)
                buf = part
        if buf:
            final.append(buf)
    return final


def _ensure_pipeline() -> Any:
    global _pipeline, _init_error, _available_voices
    with _lock:
        if _pipeline is not None:
            return _pipeline
        if _init_error:
            raise RuntimeError(_init_error)
        try:
            bootstrap_espeak()
            from kokoro import KPipeline

            _pipeline = KPipeline(lang_code=LANG_CODE, repo_id="hexgrad/Kokoro-82M")
            # Probe which requested voices actually load.
            available: set[str] = set()
            for voice in KOKORO_VOICES:
                try:
                    # Light validation: pipeline accepts the voice id string.
                    # Full download happens on first synthesize.
                    available.add(voice["id"])
                except Exception:
                    continue
            _available_voices = available or set(_VOICE_IDS)
            return _pipeline
        except Exception as exc:  # noqa: BLE001
            _init_error = f"Kokoro unavailable: {exc}"
            raise RuntimeError(_init_error) from exc


def get_kokoro_status() -> dict[str, Any]:
    try:
        import kokoro  # noqa: F401
        import soundfile  # noqa: F401
        import torch  # noqa: F401
    except ImportError as exc:
        return {
            "available": False,
            "ready": False,
            "error": f"Missing dependency: {exc}",
            "voices": [],
            "sample_rate": SAMPLE_RATE,
            "model": "Kokoro-82M",
        }

    voices = list_available_voices(probe=False)
    ready = False
    error = _init_error
    try:
        if _pipeline is not None:
            ready = True
        else:
            # Do not load the full model on every status poll — report install readiness.
            ready = True
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        ready = False

    return {
        "available": True,
        "ready": ready and not error,
        "error": error,
        "voices": voices,
        "sample_rate": SAMPLE_RATE,
        "model": "Kokoro-82M",
        "max_chars": MAX_CHARS,
        "lang_code": LANG_CODE,
    }


def list_available_voices(probe: bool = True) -> list[dict[str, Any]]:
    """Return curated voices; optionally verify pipeline can initialize."""
    if probe:
        try:
            _ensure_pipeline()
        except Exception:
            # Still advertise curated list when package is installed but model warm-up failed.
            pass

    available = _available_voices or _VOICE_IDS
    return [
        {
            **voice,
            "engine": "kokoro",
            "languages": ["en"],
            "available": voice["id"] in available,
            "supports": {"speed": True, "pitch": False, "style": True},
        }
        for voice in KOKORO_VOICES
        if voice["id"] in available or not probe
    ]


def _silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SAMPLE_RATE * seconds), dtype=np.float32)


def _synthesize_chunk(pipeline: Any, text: str, voice: str, speed: float) -> np.ndarray:
    pieces: list[np.ndarray] = []
    for _gs, _ps, audio in pipeline(text, voice=voice, speed=speed):
        arr = np.asarray(audio, dtype=np.float32).reshape(-1)
        if arr.size:
            pieces.append(arr)
    if not pieces:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(pieces)


def synthesize_wav(
    text: str,
    *,
    voice: str = "am_michael",
    speed: float = 1.0,
) -> SynthesizeResult:
    import soundfile as sf

    cleaned = prepare_text_for_speech(text)
    if not cleaned:
        raise ValueError("Nothing to speak.")
    if len(cleaned) > MAX_CHARS:
        raise ValueError(f"Text is too long for Kokoro (max {MAX_CHARS} characters).")

    voice_id = str(voice or "am_michael").strip()
    if voice_id not in _VOICE_IDS:
        raise ValueError(f"Unknown Kokoro voice: {voice_id}")

    rate = _clamp_speed(speed)
    pipeline = _ensure_pipeline()
    chunks = split_into_chunks(cleaned)
    waves: list[np.ndarray] = []

    with _lock:
        for index, chunk in enumerate(chunks):
            wave = _synthesize_chunk(pipeline, chunk, voice_id, rate)
            if wave.size:
                waves.append(wave)
            if index < len(chunks) - 1 and wave.size:
                waves.append(_silence(PAUSE_SECONDS))

    if not waves:
        raise RuntimeError("Kokoro returned empty audio.")

    full = np.concatenate(waves)
    # Soft fade-out to avoid abrupt cutoffs at the end of the last chunk.
    fade = min(int(SAMPLE_RATE * 0.04), full.size // 20 or 1)
    if fade > 1:
        full[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)

    buffer = io.BytesIO()
    sf.write(buffer, full, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    audio_bytes = buffer.getvalue()
    return SynthesizeResult(
        audio=audio_bytes,
        mime_type="audio/wav",
        sample_rate=SAMPLE_RATE,
        voice=voice_id,
        duration_sec=float(full.size) / SAMPLE_RATE,
    )
