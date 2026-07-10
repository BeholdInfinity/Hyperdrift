@echo off
cd /d "%~dp0"
title Hyperdrift Dev Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1"
if errorlevel 1 pause
