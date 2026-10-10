# Future fine-tuning (not active)

AllModelAI does **not** modify third-party API model weights. This folder documents an optional **offline** path for **open-weight** models only.

## Requirements before any training run

1. Explicit human approval and a written dataset manifest.
2. Dataset built from **authorized, de-identified** examples — never raw private chats by default.
3. Evaluation split and quality gates before deployment.
4. Versioned artifact storage and one-click rollback.

## Planned stack

- PyTorch
- PEFT (LoRA / QLoRA)
- Local or dedicated GPU worker (not the Express API process)

## Entry point

Run `python train_lora_stub.py` to see the guardrails. It exits without training.

## Deployment

Fine-tuned weights would register as a **local model id** (for example Ollama or ai_python inference) — not as a replacement for Claude, GPT, or Gemini API routes.
