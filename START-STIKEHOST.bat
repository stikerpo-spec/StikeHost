@echo off
title StikeHost
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Installiere Node.js 20+ und starte diese Datei erneut.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installiere Abhaengigkeiten...
  call npm install
  if errorlevel 1 (
    echo npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)
start "" http://localhost:3000
call npm start
pause
