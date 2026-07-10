@echo off
set PORT=8080
set FOUND=0

echo.
echo  Stopping Hyperdrift server on port %PORT%...
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
  if not errorlevel 1 (
    echo  Stopped process %%a
    set FOUND=1
  )
)

if "%FOUND%"=="0" (
  echo  No server found listening on port %PORT%.
)

echo.
pause
