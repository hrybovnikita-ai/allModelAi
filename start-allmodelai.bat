@echo off
setlocal
cd /d "%~dp0"

echo [AllModelAI] Checking frontend build...
if not exist "frontend\dist\index.html" (
  call npm --prefix frontend run build
  if errorlevel 1 (
    echo Frontend build failed.
    pause
    exit /b 1
  )
)

echo [AllModelAI] Starting production server...
echo Open http://localhost:5050
set NODE_ENV=production
call npm --prefix backend start
pause
