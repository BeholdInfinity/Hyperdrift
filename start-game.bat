@echo off
cd /d "%~dp0"
title Hyperdrift Dev Server
set PORT=8080

echo.
echo  Hyperdrift - local dev server
echo  =============================
echo  URL: http://localhost:%PORT%
echo.
echo  To stop: close this window or press Ctrl+C
echo.

start "" "http://localhost:%PORT%"

where python >nul 2>&1 && (
  python -m http.server %PORT%
) || (
  py -m http.server %PORT%
)

if errorlevel 1 (
  echo.
  echo ERROR: Python not found. Install Python 3 from https://python.org
  echo.
  pause
)
