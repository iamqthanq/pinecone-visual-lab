# Read-only, reproducible pre-publication checks. Never fetches, changes refs or pushes.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
if ((Get-Location).Path -ne $taskRoot) { throw 'Run audit from the repository root.' }
Write-Host "WORKDIR: $taskRoot"
$taskBranch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $taskBranch -ne 'feature/issue-13-slab-guided-demo') { throw 'Wrong branch' }
Write-Host "BRANCH: $taskBranch"
$taskOrigin = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $taskOrigin -notin @('https://github.com/iamqthanq/pinecone-visual-lab', 'https://github.com/iamqthanq/pinecone-visual-lab.git')) { throw 'Origin changed; inspect privately' }
Write-Host "ORIGIN: $taskOrigin"
git status --short --branch
if ($LASTEXITCODE -ne 0) { throw 'Status failed' }
Write-Host 'HEAD and fetched origin/main (HEAD is pre-publication; final SHA is in handoff):'
git rev-parse HEAD origin/main
if ($LASTEXITCODE -ne 0) { throw 'Missing refs' }
git merge-base --is-ancestor 53ba4924df3f58151c36f1455249de8e5f1bb9f8 origin/main
if ($LASTEXITCODE -ne 0) { throw 'D06 merge is not in fetched main' }
git merge-base --is-ancestor origin/main HEAD
if ($LASTEXITCODE -ne 0) { throw 'Feature is not based on fetched main' }
foreach ($taskKey in @('pinecone.issue','pinecone.branch','pinecone.workdir','core.hooksPath','push.default')) {
  $taskValue = git config --local --get $taskKey
  if ($LASTEXITCODE -ne 0) { throw "Missing $taskKey" }
  Write-Host "${taskKey}: $taskValue"
}
& '.venv\Scripts\python.exe' scripts/git_guard.py check
if ($LASTEXITCODE -ne 0) { throw 'Guard failed' }
$taskHash = (Get-FileHash -LiteralPath 'GITHUB_COLLAB_WORKFLOW_STANDARD.md' -Algorithm SHA256).Hash
if ($taskHash -ne '5CB214CB8CF499A83A480F1B244DA5C274DD66C8FCC211DB83ED246C82E20E78') { throw 'Workflow changed' }
Write-Host "WORKFLOW_SHA256: $taskHash"
git diff --exit-code origin/main -- GITHUB_COLLAB_WORKFLOW_STANDARD.md docs/reference docs/evidence/d01 docs/evidence/d02 docs/evidence/d03 docs/evidence/d04 docs/evidence/d05 docs/evidence/d06 .githooks scripts/git_guard.py scripts/push_issue_branch.ps1
if ($LASTEXITCODE -ne 0) { throw 'Protected workflow/history/guards changed' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Unstaged whitespace errors' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace errors' }
Write-Host 'Historical workflow/master plan/evidence/guard implementation unchanged. Git audit PASS.'
