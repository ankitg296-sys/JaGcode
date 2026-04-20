@echo off
echo ============================================
echo   TalentMatch AI v3 — Starting...
echo ============================================
echo.

if not exist ".env" (
  echo ERROR: .env file not found. Run 1-INSTALL.bat first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo ERROR: node_modules not found. Run 1-INSTALL.bat first.
  pause
  exit /b 1
)

echo Launching TalentMatch AI v3...
echo Opening http://localhost:3000 in your browser...
echo.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://localhost:3000"
node server.js
