# AllModelAI — Python AI / ML Lab (`ai_python`)

Educational **local PyTorch training** (linear / logistic / small MLP) plus **OpenAI API inference** (separate from local training).

## Architecture

```
React (/model-lab)
    → Node Express (/api/training/*, requireAuth)
        → FastAPI (main.py --serve, port 8000)
            → PyTorch training threads + storage/runs/
            → OpenAI SDK (inference only)
```

- **Local ML:** real gradient descent / backprop; metrics streamed via job polling (`GET /training/{runId}`).
- **OpenAI:** `openai_service/` uses `OPENAI_API_KEY`; does **not** train foundation models locally.
- **Fine-tuning:** disabled unless `ENABLE_OPENAI_FINE_TUNING=true` (paid jobs).

## Windows setup

```powershell
cd ai_python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# set OPENAI_API_KEY optionally
python main.py --serve --port 8000
```

Terminal 2 — backend:

```powershell
cd backend
# set AI_PYTHON_SERVICE_URL=http://127.0.0.1:8000
npm start
```

Terminal 3 — frontend:

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173/model-lab**

## Key endpoints (Python)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| GET | `/training/health` | Lab health + OpenAI flag |
| GET | `/training/models` | Model catalog |
| POST | `/training/start` | Start async training → `runId` |
| GET | `/training/{run_id}` | Job status + live metrics |
| POST | `/training/{run_id}/predict` | Inference from saved `state_dict` |
| POST | `/training/openai/chat` | OpenAI chat (API) |

Legacy routes under `/ai/*` and `/labs/*` remain for the course and PyTorch chat engine.

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API (server only) |
| `ENABLE_OPENAI_FINE_TUNING` | `false` by default |
| `OPENAI_TRAINING_MODEL` | Optional chat model id |

Node backend: `AI_PYTHON_SERVICE_URL` (see `backend/.env.example`).

## Tests

```bash
cd ai_python
pytest
```

## Production

Deploy **FastAPI + PyTorch** on a separate worker (Render Docker, Fly, VM). Do **not** run training on Vercel. Frontend stays on Vercel; Node on Render proxies `/api/training/*`.

## Security

- No `eval` / arbitrary user execution.
- Epoch/batch/data limits in `learning/training/limits.py`.
- Max 2 concurrent training jobs.
- Trained weights under `storage/runs/` (gitignored).

---

## Multi-provider LLM layer (new)

AllModelAI chat in production still routes through **Node/Express** (`createChatResponse`) with OpenRouter fallbacks. The Python service adds a **parallel, testable provider layer** you can call from Node when debugging providers or for future Smart Router experiments.

```
React  →  Node/Express (/api/chat — unchanged)
              ↓
         Provider APIs (OpenRouter, OpenAI, …)

Optional:
React  →  Node (/api/python-llm/chat, auth required)
              ↓
         FastAPI (/llm/chat)
              ↓
         AIRouter  →  providers/*
```

### FastAPI LLM endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/llm/health` | LLM subsystem health |
| GET | `/llm/models` | Registry from `backend/src/data/modelVariants.json` |
| POST | `/llm/chat` | Normalized chat (provider + model + messages) |

Node proxy (authenticated):

- `GET /api/python-llm/health`
- `GET /api/python-llm/models`
- `POST /api/python-llm/chat`

### Python layout

- `providers/base.py` — `AIProvider`, `GenerateResult`
- `providers/openai_compatible.py` — shared client for OpenAI-style APIs
- `providers/*_provider.py` — OpenAI, Anthropic, Gemini, Grok, DeepSeek, Mistral, Kimi, OpenRouter
- `services/model_registry.py` — reads AllModelAI `modelVariants.json`
- `router.py` — `AIRouter.generate()` and `smart_generate()` (compat hook only)
- `utils/errors.py` — safe error codes (`MISSING_API_KEY`, `RATE_LIMITED`, …)

Example:

```python
from router import get_router

router = get_router()
result = await router.generate(
    provider="openai",
    model="mini",  # resolved via modelVariants (gpt family)
    messages=[{"role": "user", "content": "Explain neural networks"}],
)
print(result.text)
```

### Learning notes (APIs, SDKs, security)

1. **API** — HTTP interface a service exposes (e.g. `POST /v1/chat/completions`).
2. **SDK** — Official library wrapping HTTP (e.g. `openai`, `anthropic`, `google-genai`).
3. **Model vs API vs library** — The model is the weights/service; the API is the network contract; the Python library is how your code calls the API.
4. **OpenAI Python SDK** — `AsyncOpenAI` + `chat.completions.create(...)`.
5. **Claude SDK** — `AsyncAnthropic` + `messages.create(...)`.
6. **Gemini SDK** — `google.genai.Client` + `models.generate_content(...)`.
7. **Grok** — xAI exposes an OpenAI-compatible API at `https://api.x.ai/v1` with `XAI_API_KEY`.
8. **`base_url`** — Tells the OpenAI SDK which host to call (OpenRouter, DeepSeek, Mistral, Kimi, xAI each have their own).
9. **Environment variables** — Configuration loaded on the server at startup (`backend/.env`, `ai_python/.env`).
10. **Why keys stay on the server** — Anyone with a browser-visible key can spend your quota; React must never hold provider secrets.
11. **`async`/`await`** — Lets Python wait on network I/O without blocking other requests.
12. **`AIProvider`** — One class per vendor with the same `generate()` signature.
13. **`AIRouter`** — Validates provider/model, picks the adapter, returns normalized JSON.
14. **Adding a provider** — Implement `AIProvider`, register in `providers/__init__.py`, add env vars to `.env.example`.
15. **End-to-end flow** — Browser → Node session auth → (optional) Python FastAPI → provider API → normalized text back to Node → browser.

### LLM tests (no paid calls by default)

```bash
cd ai_python
python -m pytest tests/test_router.py tests/test_providers.py -q
```

Set keys in `.env` only when you intentionally run live integration tests.
