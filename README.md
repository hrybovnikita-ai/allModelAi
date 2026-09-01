AllModelAI

A unified workspace for multiple AI models: secure chat, an explainable Smart Router, a knowledge base, AI Arena, and team workspaces.

Getting Started
cd backend

Copy-Item .env.example .env

npm install

npm start

In a second terminal:

cd frontend

npm install

npm run dev

The frontend will be available at http://localhost:5173, and the backend at http://localhost:5050.

New Features
All private APIs use a server-side HTTP-only session; an email address provided by the client does not determine data ownership.
Smart Router detects the task type and returns the selected model along with an explanation.
Documents from Studio are indexed locally and automatically added to the AI context with [KB1] and [KB2] labels.
Team Workspace supports the owner, editor, and viewer roles.
A saved chat can be published using a randomly generated read-only link.
Innovation Lab adds ranked chunk-based document retrieval, persistent AI agents, configurable provider fallback, voice/file prompt composition, and repeatable multi-model evaluations.
Expansion Hub adds visual workflows, installable templates, meeting analysis, team rooms, a memory graph, prompt versioning, local security scans, Ollama status, guided research, and hashed developer API-key management.
Skills Hub provides structured experts for data analysis, career documents, code repositories, SEO, contracts, customer support, learning, marketing, databases, software localization, and Deep Research. Deep Research performs two to four web-search passes, deduplicates sources, builds an evidence dossier, and generates a cited report. Skill inputs, sources, and generated prompts are saved as restorable sessions.
The extended skill library also includes financial planning, scientific research, UI/UX design, defensive cybersecurity, product management, startup validation, ethical sales assistance, social media production, presentation planning, healthcare information, travel planning, and personal productivity. High-stakes financial and health outputs include explicit professional-advice and emergency-safety boundaries.
Production Center adds authenticated public API keys, persistent job state, notifications, global search, usage and cost records, audit history, webhook registration, privacy export, account-security tokens, health checks, Docker deployment, and CI. See `PRODUCTION.md` for the implemented/local boundary and the external adapters required for a multi-instance launch.
Verification
cd backend

npm test

cd ../frontend

npm run lint

npm run build

Secrets are stored only in backend/.env. The demo social account selection feature is disabled by default and must not be enabled in production.
