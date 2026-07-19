@echo off
cd /d "%~dp0"

rem Windows Terminal's wt.exe often isn't on PATH, so call it by full path.
rem Route into a shared, named window ("hyperdrift") so start/stop open as
rem named tabs in ONE window instead of a new window every time.
set "WT=%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"
if exist "%WT%" (
    "%WT%" -w hyperdrift new-tab --title "Hyperdrift Server" --suppressApplicationTitle powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1"
    exit /b
)

rem Fallback: no Windows Terminal available, use the classic console.
title Hyperdrift Dev Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1"
if errorlevel 1 pause
