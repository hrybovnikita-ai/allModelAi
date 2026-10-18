# Kokoro local TTS (AllModelAI)

Free, local Text-to-Speech via **Kokoro-82M**. No paid API keys.

## Architecture

`React Voice Studio` → `Express /api/tts/*` (`backend/src/routes/api/tts.js`) → `Python FastAPI (127.0.0.1:$AI_PYTHON_PORT) /tts/*` → WAV audio

**Correct Express health endpoint:** `GET /api/tts/health` (public, no auth)

The Python service binds to localhost only. The browser never talks to it directly.

## Voices

| ID | Gender | Label |
|----|--------|-------|
| `am_michael` | Male | Michael |
| `am_adam` | Male | Adam |
| `af_heart` | Female | Heart |
| `af_bella` | Female | Bella |
| `af_nicole` | Female | Nicole |

Auto engine order: **Kokoro → browser**. Paid OpenAI / ElevenLabs are never auto-selected.

## Start Python TTS service

```bash
cd ai_python
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

python -m pip check
python test_kokoro.py
python main.py --serve --port 5055
```

Point the Node backend at the same interpreter and **the same port**:

```bash
# backend/.env  — AI_PYTHON_PORT must match `python main.py --serve --port`
PYTHON_BIN=C:\path\to\allModelAi\ai_python\.venv\Scripts\python.exe
AI_PYTHON_PORT=5055
```

If Voice Studio says “Kokoro offline” while `http://127.0.0.1:5055/tts/health` is healthy, check that Express is not looking at a different `AI_PYTHON_PORT` (for example 5056). Verify with:

```bash
curl -s http://127.0.0.1:5050/api/tts/health
```

## Start backend + frontend

```bash
# terminal 1 — backend (port typically 5050)
cd backend
npm run dev

# terminal 2 — frontend
cd frontend
npm run dev
```

## Try voices in the UI

1. Open `/voice-studio` while signed in.
2. Confirm the status line says Kokoro is online.
3. Select a **Male** voice (`Michael` / `Adam`) or **Female** (`Heart` / `Bella` / `Nicole`).
4. Click **Preview** or **Play**.
5. Use Pause / Resume / Stop; download WAV when generation finishes.
6. If Kokoro is offline, set Engine to **Browser (free fallback)**.

## Windows note (espeak-ng)

If your Windows username contains non-ASCII characters, AllModelAI copies espeak-ng data to an ASCII path (`C:\ProgramData\allmodelai\espeak-ng-data` or `C:\tmp\espeak-ng-data`). You can also set:

```bash
set ESPEAK_DATA_PATH=C:\tmp\espeak-ng-data
```
