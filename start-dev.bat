@echo off
setlocal
cd /d "%~dp0"

echo [AllModelAI] Dev mode: backend :5050 + Vite :5173
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH. Install Node 22+ and try again.
  pause
  exit /b 1
)

if not exist "backend\node_modules\" (
  echo Installing backend dependencies...
  call npm --prefix backend ci
  if errorlevel 1 exit /b 1
)
if not exist "frontend\node_modules\" (
  echo Installing frontend dependencies...
  call npm --prefix frontend ci
  if errorlevel 1 exit /b 1
)

if not exist "backend\.env" (
  echo Copy backend\.env.example to backend\.env and add API keys if needed.
  copy /Y "backend\.env.example" "backend\.env" >nul
)

echo Starting backend in a new window...
start "AllModelAI Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"

echo Waiting for http://127.0.0.1:5050/api/health ...
powershell -NoProfile -Command ^
  "$deadline = (Get-Date).AddSeconds(45); " ^
  "while ((Get-Date) -lt $deadline) { " ^
  "  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5050/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {} " ^
  "  Start-Sleep -Milliseconds 500 " ^
  "}; exit 1"
if errorlevel 1 (
  echo Backend did not start in time. Check the Backend window for errors.
  pause
  exit /b 1
)

echo Backend is ready.
echo Starting Vite (this window)...
cd frontend
call npm run dev
