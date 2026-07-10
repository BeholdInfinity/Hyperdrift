@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Hyperdrift Dev Server
set PORT=8080

echo.
echo  Hyperdrift - local dev server
echo  =============================
echo  URL: http://localhost:%PORT%
echo.

REM Stop any stale server already using our port
set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
  if not errorlevel 1 (
    echo  Stopped stale server ^(PID %%a^)
    set FOUND=1
  )
)
if "%FOUND%"=="1" timeout /t 1 /nobreak >nul

echo  Starting server...
echo  To stop: close this window or press Ctrl+C
echo.

REM Open browser after a short delay so the server is ready first
start /b cmd /c "ping -n 3 127.0.0.1 >nul && start "" http://localhost:%PORT%/"

where python >nul 2>&1 && (
  python -m http.server %PORT%
) || (
  py -m http.server %PORT%
)

echo.
echo ERROR: Could not start the server.
echo - Is Python 3 installed? https://python.org
echo - Is port %PORT% in use by another app?
echo.
pause
