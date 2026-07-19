# Hyperdrift - stop the local dev server. Launched via stop-game.bat.
$ErrorActionPreference = 'Continue'
$Port = 8080
$found = $false

Write-Host ''
Write-Host "  Stopping Hyperdrift server on port $Port..." -ForegroundColor Cyan
Write-Host ''

$lines = netstat -aon | Select-String ":$Port\s" | Select-String 'LISTENING'
foreach ($line in $lines) {
    $procId = ($line -split '\s+')[-1]
    try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "  Stopped process $procId" -ForegroundColor Green
        $found = $true
    } catch {
        # Ignore processes we cannot stop; report at the end if none matched.
    }
}

if (-not $found) {
    Write-Host "  No server found listening on port $Port."
}

Write-Host ''
Read-Host '  Press Enter to close'
