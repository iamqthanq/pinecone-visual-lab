$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'This script accepts no flags or refspec overrides.' }
$taskRoot = Split-Path -Parent $PSScriptRoot
if ((Get-Location).Path -ne $taskRoot) { throw 'Run from the repository root.' }
$taskPython = if (Test-Path -LiteralPath '.venv\Scripts\python.exe') { '.venv\Scripts\python.exe' } else { 'python' }
$taskRef = & $taskPython 'scripts/git_guard.py' check
if ($LASTEXITCODE -ne 0) { throw 'Git guard rejected this checkout.' }
& git push --set-upstream origin "${taskRef}:${taskRef}"
if ($LASTEXITCODE -ne 0) { throw 'Safe push failed.' }
