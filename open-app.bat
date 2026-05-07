@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npm install
)
start "" cmd /k "npm run dev"
timeout /t 3 > nul
start "" "http://localhost:5173"
