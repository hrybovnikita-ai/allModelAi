@echo off
setlocal
cd /d "%~dp0"

echo [AllModelAI] Building frontend...
call npm --prefix frontend run build
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)

echo [AllModelAI] Checking the shared database...
call npm --prefix backend run db:check
if errorlevel 1 (
  echo Database check failed.
  pause
  exit /b 1
)

echo [AllModelAI] Starting local network server...
echo On this computer: http://localhost:5050
echo On a phone on the same Wi-Fi: http://YOUR_COMPUTER_LAN_IP:5050
echo For chat after this computer is off, deploy the Dockerfile / render.yaml to Render, Railway, or Fly.io.
set NODE_ENV=production
rem Local network HTTP only. Public HTTPS deployments keep secure cookies enabled.
set COOKIE_SECURE=false
set HOST=0.0.0.0
call npm --prefix backend start
pause
