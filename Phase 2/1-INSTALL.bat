@echo off
title TalentMatch AI v2 — Install
color 0A
echo.
echo  =========================================
echo   TalentMatch AI v2 — First-Time Setup
echo  =========================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)
echo  [OK] Node.js: & node --version

npm install
if %errorlevel% neq 0 ( echo  [ERROR] npm install failed. & pause & exit /b 1 )

echo.
echo  =========================================
echo   Done! Next steps:
echo  =========================================
echo.
if not exist .env (
    echo  1. Copy .env.example to .env
    echo  2. Add your OPENROUTER_API_KEY
    echo  3. Run 2-START.bat
) else (
    echo  Run 2-START.bat to launch TalentMatch AI v2.
)
echo.
pause
