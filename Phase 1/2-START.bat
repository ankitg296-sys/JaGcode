@echo off
title TalentMatch AI
color 0A

echo.
echo  =========================================
echo   TalentMatch AI — Starting...
echo  =========================================
echo.

:: Check node_modules
if not exist node_modules (
    echo  [ERROR] Dependencies not installed. Run 1-INSTALL.bat first.
    echo.
    pause
    exit /b 1
)

:: Check .env
if not exist .env (
    echo  [ERROR] .env file not found.
    echo.
    echo  Copy .env.example to .env and add your OPENROUTER_API_KEY.
    echo.
    pause
    exit /b 1
)

echo  Starting server...
echo.
echo  Once started, open your browser to:
echo  http://localhost:3000
echo.
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after 2 second delay in background
start /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"

:: Start the server
node server.js

pause
