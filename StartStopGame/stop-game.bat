@echo off
cd /d "%~dp0"

rem Windows Terminal's wt.exe often isn't on PATH, so call it by full path.
rem Route into the same named window ("hyperdrift") as start-game.bat,
rem as a separate named tab.
set "WT=%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"
if exist "%WT%" (
    "%WT%" -w hyperdrift new-tab --title "Hyperdrift Stop" --suppressApplicationTitle powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-game.ps1"
    exit /b
)

rem Fallback: no Windows Terminal available, use the classic console.
title Hyperdrift Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-game.ps1"
if errorlevel 1 pause
