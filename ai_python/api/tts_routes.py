"""Kokoro TTS HTTP routes — bound to 127.0.0.1 only via main.py --serve."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    voice: str = Field(default="am_michael")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


def register_tts_routes(app: Any) -> None:
    @app.get("/tts/health")
    def tts_health():
        from services.kokoro_tts import get_kokoro_status

        status = get_kokoro_status()
        return {"ok": bool(status.get("available")), **status}

    @app.get("/tts/voices")
    def tts_voices():
        from services.kokoro_tts import get_kokoro_status, list_available_voices

        status = get_kokoro_status()
        if not status.get("available"):
            return {
                "ok": False,
                "voices": [],
                "error": status.get("error") or "Kokoro dependencies missing",
            }
        try:
            voices = list_available_voices(probe=True)
            return {"ok": True, "voices": voices, "model": status.get("model")}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "voices": [], "error": str(exc)}

    @app.post("/tts/synthesize")
    def tts_synthesize(req: SynthesizeRequest):
        from fastapi.responses import JSONResponse, Response

        from services.kokoro_tts import synthesize_wav

        try:
            result = synthesize_wav(req.text, voice=req.voice, speed=req.speed)
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": str(exc), "code": "TTS_BAD_REQUEST"},
            )
        except Exception as exc:  # noqa: BLE001
            return JSONResponse(
                status_code=503,
                content={"ok": False, "error": str(exc), "code": "TTS_SYNTH_FAILED"},
            )

        return Response(
            content=result.audio,
            media_type=result.mime_type,
            headers={
                "X-AllModelAI-TTS-Engine": "kokoro",
                "X-AllModelAI-TTS-Voice": result.voice,
                "X-AllModelAI-TTS-Sample-Rate": str(result.sample_rate),
                "X-AllModelAI-TTS-Duration": f"{result.duration_sec:.3f}",
                "X-AllModelAI-TTS-Model": result.model,
                "X-AllModelAI-TTS-Billed": "0",
                "Cache-Control": "private, no-store",
            },
        )
