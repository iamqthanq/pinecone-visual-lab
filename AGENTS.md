# Pinecone Visual Lab

Follow `GITHUB_COLLAB_WORKFLOW_STANDARD.md` for Issue → push → ChatGPT PR/review → user merge; obey project branch protections.

- Work in this existing Windows checkout with PowerShell and Git for Windows. Read `docs/BRANCH_POLICY.md` first.
- One phase = one Issue = one feature branch = one Draft PR. Active: D07, Issue #13, `feature/issue-13-slab-guided-demo`, integration base `main` (D06 merged in PR #12).
- Agent implements/tests/commits/pushes through `scripts/push_issue_branch.ps1`. ChatGPT opens the Draft PR and independently reviews. Only the user decides merge.
- Do not push main, force-push, bypass hooks, reset/clean/stash user changes, open PRs, close Issues, or start another phase without assignment.
- Keep the authentic workflow file unchanged. Project-specific configuration belongs in `docs/BRANCH_POLICY.md`.
- Run `scripts/check.ps1` before push. Never fabricate test status, data, model availability, or cloud telemetry.
- D07 adds a pure deterministic educational Slab Simulator (never Pinecone telemetry) and opt-in cross-lab Guided Demo, preserving D01–D06 evidence/functions. D08–D09 remain planned. Tour reset clears session/simulation only; never delete user/demo data automatically. Real steps require backend evidence; toy 2D scores never represent E5 384D. Never install/pull/start/load Ollama without separate user approval. Offline CI uses MOCK OLLAMA / NOT REAL LLM and NOT E5; real cached E5 tests remain separate. REAL OLLAMA NOT VERIFIED and LIVE PINECONE NOT VERIFIED persist. No cloud calls, paid resources, secrets in frontend/logs or import/startup/API model downloads. Existing E5 cache approval persists.
