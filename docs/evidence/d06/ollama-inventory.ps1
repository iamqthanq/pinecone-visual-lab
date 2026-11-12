$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$taskBinary = Get-Command ollama -ErrorAction SilentlyContinue
Write-Host ('ollama in PATH: ' + [bool]$taskBinary)
$taskProcesses = @(Get-Process -Name '*ollama*' -ErrorAction SilentlyContinue)
Write-Host ('Visible Ollama-named process count: ' + $taskProcesses.Count)
Write-Host ('Default per-user Windows binary exists: ' + (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe')))
Write-Host 'No binary invoked, daemon probed, models enumerated/downloaded/loaded or service started.'
Write-Host 'This inventory does not prove absence of another installation.'
Write-Host 'REAL OLLAMA NOT VERIFIED - NEEDS USER INSTALL/APPROVAL'
