# Hyperdrift local dev server — double-click via start-game.bat
$ErrorActionPreference = 'Stop'
$Port = 8080
# Scripts live in StartStopGame/; the game (dev-server.py, index.html) is one level up.
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host ''
Write-Host '  Hyperdrift - local dev server' -ForegroundColor Cyan
Write-Host '  ============================='
Write-Host "  Folder: $Root"
Write-Host "  URL:    http://localhost:$Port/"
Write-Host ''

function Find-Python {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return @{ File = 'py'; Args = @('-3') }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return @{ File = 'python'; Args = @() }
    }
    $candidates = @(
        'C:\Python314\python.exe',
        "$env:LocalAppData\Programs\Python\Python312\python.exe",
        "$env:LocalAppData\Programs\Python\Python313\python.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return @{ File = $path; Args = @() } }
    }
    return $null
}

function Test-ServerReady {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 1
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Stop-StaleListener {
    $lines = netstat -aon | Select-String ":$Port\s" | Select-String 'LISTENING'
    foreach ($line in $lines) {
        $processId = ($line -split '\s+')[-1]
        if (-not (Test-ServerReady)) {
            Write-Host "  Clearing unresponsive listener on port $Port (PID $processId)..." -ForegroundColor Yellow
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        } elseif (Test-ServerReady) {
            Write-Host '  Server already running on this port - opening browser.' -ForegroundColor Green
            Start-Process "http://localhost:$Port/"
            Write-Host ''
            Write-Host '  If this is not Hyperdrift, run stop-game.bat and try again.'
            Read-Host '  Press Enter to close'
            exit 0
        }
    }
}

$python = Find-Python
if (-not $python) {
    Write-Host '  ERROR: Python 3 not found.' -ForegroundColor Red
    Write-Host '  Install from https://python.org and check "Add python to PATH".'
    Read-Host '  Press Enter to close'
    exit 1
}

$pyLabel = $python.File
if ($python.Args.Count -gt 0) { $pyLabel += ' ' + ($python.Args -join ' ') }
Write-Host "  Using: $pyLabel"
Write-Host ''

Stop-StaleListener

Write-Host '  Starting server...'
Write-Host '  Close this window or press Ctrl+C to stop.'
Write-Host ''

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $python.File
$psi.Arguments = (($python.Args + @('dev-server.py', "$Port")) -join ' ')
$psi.WorkingDirectory = $Root
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)

try {
    $opened = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ($proc.HasExited) {
            Write-Host '  ERROR: Server process exited unexpectedly.' -ForegroundColor Red
            Read-Host '  Press Enter to close'
            exit 1
        }
        if (Test-ServerReady) {
            Start-Process "http://localhost:$Port/"
            $opened = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $opened) {
        Write-Host '  WARNING: Server started but browser was not auto-opened.' -ForegroundColor Yellow
        Write-Host "  Open manually: http://localhost:$Port/"
    }

    Write-Host ''
    Write-Host '  Server is running.' -ForegroundColor Green
    $proc.WaitForExit()
} finally {
    if (-not $proc.HasExited) {
        $proc.Kill()
    }
}

Write-Host ''
Write-Host '  Server stopped.'
Read-Host '  Press Enter to close'
