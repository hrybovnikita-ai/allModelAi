# Everyday AI

Open **Everyday AI** from the homepage, dashboard, or command palette (Ctrl/Cmd+K).
The eight tools live at `/everyday-ai/:tool` and require sign-in.

- `compare`: select two to four models and compare real responses. Failed providers show individual errors; automatic provider fallback is disabled so results stay attributed to the selected model.
- `documents`: upload PDF, TXT, or Markdown, then ask questions. PDF.js extracts PDF text in the browser. Relevant excerpts are sent to the selected AI provider and displayed with page numbers. Generated citations should be checked against those excerpts. Limits: 10 MB, 100 PDF pages, 300,000 extracted characters. Scanned PDFs require OCR before upload.
- `projects`: create a project, set instructions, link uploaded documents, and keep a saved project conversation. Save changes before switching projects. Deleted documents are no longer included in project context.
- `learn`: generate an explanation, expandable flashcards, and a scored multiple-choice quiz. Lessons remain in the current view; save the explanation to an answer collection to retain it.
- `voice`: record a transcript, review it, and send it. Speech recognition depends on browser support and microphone permission; speech synthesis reads replies aloud where supported. Typed input remains available. Recording starts only after pressing the microphone button. Voice conversations remain in the current view; individual answers can be saved.
- `saved`: search answers, filter collections, add notes, move answers between collections, copy, or delete them. Other tools include Save answer actions.
- `write`: generate an email, article, social post, or essay with tone and length controls. Edit the result and save named drafts to the account.
- `automate`: create, reorder, save, and manually run up to six prompt steps. Each step receives the previous output; failures stop the sequence. Runs stop when navigating away and do not run in the background. Step outputs above 7,000 characters must be shortened before continuing.

The tools reuse `/api/chat` and the existing authenticated `/api/workspace` API. AI requests need a configured provider and the account's existing model permissions. No API keys are stored in frontend code. Temporary toolkit requests do not create entries in the main chat history; project conversations are saved in the project itself.

Workspace records use the existing `project`, `document`, and `workflow` types plus `saved_answer` and `writing`. Ownership comes from the server session. No database schema migration is required. Workflow records include `tool: "everyday-ai"` to keep them separate from other workflow formats.

## Checks

From `frontend`: `npm run build`, `npx eslint src/components/EverydayAI src/lib/everydayAI.js src/lib/readDocument.js`, and `node --test tests/*.test.mjs`.

From `backend`: `npm test`.

Tests exercise fragmented and failed AI streams, document context limits, lesson validation, sequential workflows, rendering all eight routes, and account isolation for saved content. Live provider responses, microphone access, and browser layout require manual verification in a running app.
