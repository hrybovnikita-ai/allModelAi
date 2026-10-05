# AllModelAI TypeScript workspace (`@allmodelai/contracts`)

This folder is the **fourth architecture layer** of AllModelAI. It is **not** a second backend. It holds shared contracts, runtime validation, typed HTTP clients, and AI provider interfaces used by the frontend, backend, and (via JSON) the Python AI service.

## Layout

```
typescript/
├── src/
│   ├── api/          # Path constants for backend + Python endpoints
│   ├── clients/      # BackendApiClient, PythonAiClient
│   ├── config/       # Env helpers (no secrets)
│   ├── core/         # ApiError
│   ├── models/       # (reserved for future DTO modules)
│   ├── services/     # AIProvider interface + provider catalog
│   ├── types/        # User, Chat, routing, Python AI types
│   ├── utils/        # fetchJson
│   └── index.ts
├── tests/
├── package.json
└── tsconfig.json
```

## How the four parts connect

| Part | Role | Uses contracts |
|------|------|----------------|
| **frontend** | React UI | Types + optional `BackendApiClient` (browser) |
| **backend** | Express API | `require('@allmodelai/contracts')` for validation |
| **ai_python** | FastAPI ML | Pydantic models; TS Zod schemas mirror JSON |
| **typescript** | Source of truth for shared shapes | Built to `dist/` |

```
Frontend (Vite) ──HTTP──► Backend (Express) ──HTTP/spawn──► ai_python
        │                        │
        └──── @allmodelai/contracts (types, clients, zod) ────┘
```

## Commands

Open the **`allModelAi/` folder** as your Cursor/VS Code workspace root so TypeScript and ESLint resolve `@allmodelai/contracts` correctly.

From `allModelAi/` (root):

```bash
npm install                # runs postinstall → builds typescript/dist
npm run build:typescript   # compile contracts
npm run typecheck          # contracts + frontend + backend
npm run test:typescript
npm run dev:typescript     # tsc --watch
```

From this directory:

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Environment variables

Clients read **non-secret** configuration only:

| Variable | Purpose |
|----------|---------|
| `API_BASE_URL` / `VITE_API_BASE_URL` | Backend origin (no trailing slash) |
| `AI_PYTHON_BASE_URL` | Direct Python service URL (optional) |
| `AI_PYTHON_PORT` | Default `5055` when base URL omitted |

Never put provider API keys, Firebase admin credentials, or payment secrets in this package or in `VITE_*` vars.

## Adding shared types

1. Add interfaces under `src/types/`.
2. Add matching Zod schemas in `src/validation/schemas.ts` for external/untrusted JSON.
3. Export from `src/index.ts`.
4. Run `npm run build` and `npm test` in this folder.
5. Import from `@allmodelai/contracts` in frontend (TS) or backend (JS).

## Adding AI provider contracts

1. Extend `AIProvider` in `src/services/providers/base.ts` if the capability is new.
2. Register metadata in `src/services/providers/registry.ts` (env **names** only).
3. Implement network calls in **backend** JavaScript services—keep secrets server-side.

## Firebase / OAuth note

Firebase web `authDomain` is configured via `VITE_FIREBASE_AUTH_DOMAIN` (e.g. `allmodelai.firebaseapp.com`). This package does **not** override auth domains using the public site hostname.
