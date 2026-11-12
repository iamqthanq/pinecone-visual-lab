# Pinecone Visual Lab

Follow `GITHUB_COLLAB_WORKFLOW_STANDARD.md` for Issue → push → ChatGPT PR/review → user merge; obey project branch protections.

- Work in this existing Windows checkout with PowerShell and Git for Windows. Read `docs/BRANCH_POLICY.md` first.
- One phase = one Issue = one feature branch = one Draft PR. Active: D03, Issue #5, `feature/issue-5-local-embeddings`, integration base `main` (D02 merged in PR #4).
- Agent implements/tests/commits/pushes through `scripts/push_issue_branch.ps1`. ChatGPT opens the Draft PR and independently reviews. Only the user decides merge.
- Do not push main, force-push, bypass hooks, reset/clean/stash user changes, open PRs, close Issues, or start another phase without assignment.
- Keep the authentic workflow file unchanged. Project-specific configuration belongs in `docs/BRANCH_POLICY.md`.
- Run `scripts/check.ps1` before push. Never fabricate test status, data, model availability, or cloud telemetry.
- D03 adds local E5 embeddings/inspector/cosine, preserving D02 documents and confirmed versions. D04–D09 remain planned. User explicitly approved the pinned ~471 MB E5 safetensors download and CPU runtime on 2026-11-11; use only the opt-in setup command, never import/startup/API downloads. No cloud resources or paid services. Preserve D01/D02 history/evidence.
