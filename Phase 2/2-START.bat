@echo off
title TalentMatch AI v2
color 0A
echo.
echo  =========================================
echo   TalentMatch AI v2 — Starting...
echo  =========================================
echo.

if not exist node_modules ( echo  [ERROR] Run 1-INSTALL.bat first. & pause & exit /b 1 )
if not exist .env ( echo  [ERROR] .env not found. Copy .env.example and add your API key. & pause & exit /b 1 )

echo  Opening http://localhost:3000 ...
start /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"
node server.js
pause
