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

- No `eval` / arbitrary user Python execution.
- Epoch/batch/data limits in `learning/training/limits.py`.
- Max 2 concurrent training jobs.
- Trained weights under `storage/runs/` (gitignored).
