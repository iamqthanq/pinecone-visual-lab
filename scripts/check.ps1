$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$taskRoot = Split-Path -Parent $PSScriptRoot
if ((Get-Location).Path -ne $taskRoot) { throw 'Run checks from the repository root.' }
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Create the Windows venv from README first.' }

function Invoke-Gate {
  param([string]$Name, [scriptblock]$Command)
  Write-Host "[D06] $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Name FAILED (exit $LASTEXITCODE)" }
}

Invoke-Gate 'Frontend lint' { npm.cmd run lint }
Invoke-Gate 'TypeScript strict' { npm.cmd run typecheck }
Invoke-Gate 'Frontend unit tests' { npm.cmd test }
Invoke-Gate 'Python lint' { & $taskPython -m ruff check apps/api scripts tests }
Invoke-Gate 'Backend API + Git guard tests' { & $taskPython scripts/run_pytest.py }
Invoke-Gate 'Production frontend build' { npm.cmd run build }
Invoke-Gate 'Secret / artifact scan' { & $taskPython scripts/verify_repository.py }
Invoke-Gate 'Diff whitespace' { git diff --check }
Invoke-Gate 'Staged diff whitespace' { git diff --cached --check }
Write-Host '[D06] All local required checks PASS. Browser E2E: npm run test:e2e (isolated ports/data).'
