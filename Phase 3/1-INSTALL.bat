@echo off
echo ============================================
echo   TalentMatch AI v3 — Install
echo ============================================
echo.

if not exist ".env" (
  copy ".env.example" ".env"
  echo Created .env from template.
  echo IMPORTANT: Open .env and add your OPENROUTER_API_KEY before starting.
  echo.
)

echo Installing dependencies...
call npm install

echo.
echo ============================================
echo   Done! Run 2-START.bat to launch the app.
echo ============================================
pause
