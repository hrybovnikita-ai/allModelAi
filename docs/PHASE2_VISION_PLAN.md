# Phase 2 — AI Vision & Multimodal (implementation plan)

**Prerequisite:** Phase 1 QA complete (`docs/QA_SYSTEM.md`, critical manifests green).

**Do not start coding until Phase 1 CI is green on `main`.**

---

## Current baseline (already in repo)

| Layer | Location |
|-------|----------|
| MIME/size validation | `backend/src/services/visionSupport.js` |
| Smart Router vision reroute | `backend/src/controllers/controllers.js` (`hasAttachedImage`, vision upstream errors) |
| Capabilities flags | `backend/src/services/smartRouter2/capabilities.js` |
| Chat attach + preview | `frontend/src/components/Chat/Chat.jsx` (composer attachments) |
| Dedicated vision API | Vision mode endpoints in `controllers.js` (~4400+) |
| Tests | `backend/tests/vision-support.test.js`, `vision-chat.test.js`, frontend `vision-chat.test.mjs` |

---

## Phase 2 goals (incremental)

### 2.1 — Upload & preview UX

- Multi-image queue in composer (max aligned with `MAX_TOTAL_IMAGE_BYTES`).
- Per-file progress + clear errors (`VISION_INVALID_IMAGE`, size limits).
- Mobile: `<input capture="environment">` + Capacitor file picker where applicable.
- Persist image references in chat history schema (existing message fields — verify Postgres/SQLite migration needs).

### 2.2 — Routing & fallbacks

- Expose `visionCapable` in model picker / Smart Router preview API.
- When user selects non-vision model with images: auto-switch with SSE metadata `visionReroute: true` or block with actionable message (already partial).
- OCR path: only when model lacks vision but text extraction required — reuse `aiFileManager/documentExtract.js` behind feature flag.

### 2.3 — Secure attachment pipeline

- Prefer **short-lived** user-scoped storage (disk or blob) over embedding megabytes in DB.
- Validate magic bytes server-side (not only MIME from client).
- Background cleanup job (TTL env `VISION_ATTACHMENT_TTL_HOURS`).
- Access: `requireAuth` + email-scoped paths; deny cross-user IDs (extend `postgres-http-chat-guard` patterns).

### 2.4 — FastAPI (optional)

- Heavy preprocessing (resize, PDF page rasterize) in `ai_python` only if Node timeout pressure — bridge via existing `aiPythonBridge.js`.
- Keep authoritative auth on Express.

### 2.5 — Testing (add to critical when stable)

- Backend: multi-image payload, oversize rejection, reroute metadata.
- Frontend: preview render, remove attachment, regression null-safe citations with `webSources`.
- E2E: mocked vision SSE (no live Gemini in CI).

---

## Feature flags & env (names only)

| Variable | Purpose |
|----------|---------|
| `FEATURE_VISION_CHAT` | Gate new UX if needed (default on when providers configured) |
| `VISION_MAX_IMAGES_PER_MESSAGE` | Default 4 |
| `VISION_ATTACHMENT_TTL_HOURS` | Temp file cleanup |

---

## Out of scope for Phase 2.0

- Tool calling / code sandbox (Phase 3).
- Semantic answer cache (Phase 7).
- Live provider eval in CI.

---

## Definition of done (Phase 2)

- [ ] Multi-image chat upload with previews and limits enforced server-side.
- [ ] Router clearly communicates vision vs non-vision model choice.
- [ ] Screenshot → explain → optional fix code flow covered by unit tests.
- [ ] No cross-user file access; temp cleanup documented.
- [ ] Critical QA manifest updated; no regression in Phase 1 suites.
