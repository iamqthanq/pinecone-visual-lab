# Pinecone Visual Lab

Follow `GITHUB_COLLAB_WORKFLOW_STANDARD.md` for Issue → push → ChatGPT PR/review → user merge; obey project branch protections.

- Work in this existing Windows checkout with PowerShell and Git for Windows. Read `docs/BRANCH_POLICY.md` first.
- One phase = one Issue = one feature branch = one Draft PR. Active: D05, Issue #9, `feature/issue-9-semantic-search`, integration base `main` (D04 merged in PR #8).
- Agent implements/tests/commits/pushes through `scripts/push_issue_branch.ps1`. ChatGPT opens the Draft PR and independently reviews. Only the user decides merge.
- Do not push main, force-push, bypass hooks, reset/clean/stash user changes, open PRs, close Issues, or start another phase without assignment.
- Keep the authentic workflow file unchanged. Project-specific configuration belongs in `docs/BRANCH_POLICY.md`.
- Run `scripts/check.ps1` before push. Never fabricate test status, data, model availability, or cloud telemetry.
- D05 adds ACTIVE-manifest semantic search, pre-ranking metadata filters and measured trace, preserving D01–D04 history/evidence. D06–D09 remain planned. LIVE search/read requires explicit owner opt-in and UI confirmation; never auto-discover/query cloud. Existing verified E5 cache approval persists; never download on import/startup/API. No cloud startup/tests. Live writes/resource creation/deletion require separate target-specific user authorization; absent authorization/key report LIVE NOT VERIFIED. Never request keys in chat or expose them to frontend/logs. No paid resource provisioning or automatic cleanup.
