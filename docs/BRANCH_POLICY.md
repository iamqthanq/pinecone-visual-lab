# Project Git configuration

| Parameter | Verified / configured value |
| --- | --- |
| REPOSITORY | `iamqthanq/pinecone-visual-lab` (origin verified) |
| WORKDIR | `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab` |
| INTEGRATION_BRANCH | `main` (GitHub default verified) |
| RELEASE_BRANCH | `main`; never push directly |
| FEATURE_BRANCH_PATTERN | `feature/issue-<actual-number>-<slug>` |
| Active assignment | D08 / Issue #15 / `feature/issue-15-taste-gsap-polish` |
| TEST_COMMANDS | `scripts/check.ps1`; npm/Python subcommands in README |
| PUSH_COMMAND | `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/push_issue_branch.ps1` |
| MERGE_POLICY | User-only; agent never opens PR or closes Issue |

Issue #1 was updated on 2026-11-11 to supersede the earlier documentation-only scope with D01 Windows v2.1 A–D. The original workflow was copied without edits; its project configuration is maintained here, rather than modifying the authentic template.

## Local activation

After inspecting any existing hooks/configuration, configure this checkout:

```powershell
git config --local push.default nothing
git config --local core.hooksPath .githooks
git config --local pinecone.issue 15
git config --local pinecone.branch feature/issue-15-taste-gsap-polish
git config --local pinecone.workdir (Get-Location).Path
```

Future assignments must update all three `pinecone.*` values after verifying the actual assigned Issue and branch. A branch-name regex alone does not authorize pushing. Tests use isolated temporary repositories and never send rejected pushes to GitHub.

The PowerShell entry point accepts no arguments and pushes exactly one explicit, matching source/destination branch ref. The hook also checks the active checkout/Issue/branch, remote, HEAD, every supplied ref, deletions, tags, multiple refs, and non-fast-forward ancestry. Python 3.13+ must be available (the project venv is preferred).

## Limits

Client hooks cannot prevent an administrator from disabling them. A Git pre-push hook does not receive command-line flags; it rejects non-fast-forward updates but cannot detect the literal `--force` flag on an otherwise fast-forward update. The official push script never accepts or emits force/bypass flags. Server branch protection is controlled by the owner; inspection found `main` unprotected and no rulesets on 2026-11-11. D01 does not change server settings.
