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
Verification
cd backend

npm test

cd ../frontend

npm run lint

npm run build

Secrets are stored only in backend/.env. The demo social account selection feature is disabled by default and must not be enabled in production.