# Pinecone Visual Lab

Follow `GITHUB_COLLAB_WORKFLOW_STANDARD.md` for Issue → push → ChatGPT PR/review → user merge; obey project branch protections.

- Work in this existing Windows checkout with PowerShell and Git for Windows. Read `docs/BRANCH_POLICY.md` first.
- One phase = one Issue = one feature branch = one Draft PR. Active: D04, Issue #7, `feature/issue-7-pinecone-vector-store`, integration base `main` (D03 merged in PR #6).
- Agent implements/tests/commits/pushes through `scripts/push_issue_branch.ps1`. ChatGPT opens the Draft PR and independently reviews. Only the user decides merge.
- Do not push main, force-push, bypass hooks, reset/clean/stash user changes, open PRs, close Issues, or start another phase without assignment.
- Keep the authentic workflow file unchanged. Project-specific configuration belongs in `docs/BRANCH_POLICY.md`.
- Run `scripts/check.ps1` before push. Never fabricate test status, data, model availability, or cloud telemetry.
- D04 adds local vector storage/manifests and a backend-only Pinecone adapter, preserving D01–D03 history/evidence. D05–D09 remain planned. Existing verified E5 cache approval persists; never download on import/startup/API. No cloud startup/tests. Live writes/resource creation/deletion require separate target-specific user authorization; absent authorization/key report LIVE NOT VERIFIED. Never request keys in chat or expose them to frontend/logs. No paid resource provisioning or automatic cleanup.
