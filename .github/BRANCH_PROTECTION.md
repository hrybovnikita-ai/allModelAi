# GitHub branch protection — required CI checks

To block merges when **Phase 1 critical QA** fails:

1. Open **Settings → Branches → Add branch protection rule** for `main` (and `master` if used).
2. Enable **Require status checks to pass before merging**.
3. Enable **Require branches to be up to date before merging** (recommended).
4. Search and select status check: **`verify`** from workflow **AllModelAI CI** (job name in `.github/workflows/ci.yml`).
5. Do **not** require **QA Staging E2E (cross-browser)** for every PR — that workflow is scheduled / manual only.

Optional: require **`npm audit`** failures to be addressed by also treating the `verify` job as required (audit runs inside the same job).

Deployments must remain manual or pipeline-gated; CI does not auto-deploy.
