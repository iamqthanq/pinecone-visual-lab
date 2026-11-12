# Pinecone Visual Lab

Follow `GITHUB_COLLAB_WORKFLOW_STANDARD.md` for Issue → push → ChatGPT PR/review → user merge; obey project branch protections.

- Work in this existing Windows checkout with PowerShell and Git for Windows. Read `docs/BRANCH_POLICY.md` first.
- One phase = one Issue = one feature branch = one Draft PR. Active: D06, Issue #11, `feature/issue-11-local-rag-chat`, integration base `main` (D05 merged in PR #10).
- Agent implements/tests/commits/pushes through `scripts/push_issue_branch.ps1`. ChatGPT opens the Draft PR and independently reviews. Only the user decides merge.
- Do not push main, force-push, bypass hooks, reset/clean/stash user changes, open PRs, close Issues, or start another phase without assignment.
- Keep the authentic workflow file unchanged. Project-specific configuration belongs in `docs/BRANCH_POLICY.md`.
- Run `scripts/check.ps1` before push. Never fabricate test status, data, model availability, or cloud telemetry.
- D06 adds optional loopback Ollama RAG on the exact D05 SearchService, preserving D01–D05 history/evidence. D07–D09 remain planned. Never install/pull/start/load Ollama without separate user approval. Offline CI uses MOCK OLLAMA / NOT REAL LLM and NOT E5; real cached E5 tests remain separate. REAL OLLAMA NOT VERIFIED is an explicit non-blocking limitation until authorized. LIVE search/read requires owner opt-in and UI confirmation; never auto-discover/query cloud. Existing E5 cache approval persists; never download on import/startup/API. No cloud startup/tests, keys in frontend/logs, paid provisioning or automatic cleanup.
