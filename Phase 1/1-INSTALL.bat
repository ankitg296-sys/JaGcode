@echo off
title TalentMatch AI — Install
color 0A

echo.
echo  =========================================
echo   TalentMatch AI — First-Time Setup
echo  =========================================
echo.

:: Check for Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo.
    echo  Please download and install Node.js 18+ from:
    echo  https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found:
node --version
echo.

:: Install dependencies
echo  Installing dependencies...
echo.
npm install

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm install failed. Check the error above.
    pause
    exit /b 1
)

echo.
echo  =========================================
echo   Setup complete!
echo  =========================================
echo.

:: Check for .env
if not exist .env (
    echo  [ACTION NEEDED] Create your .env file:
    echo.
    echo    1. Copy .env.example to .env
    echo    2. Add your OpenRouter API key
    echo    3. Optionally set your CV_FOLDER path
    echo.
    echo  Then run 2-START.bat to launch the app.
) else (
    echo  .env file found. Run 2-START.bat to launch!
)

echo.
pause
