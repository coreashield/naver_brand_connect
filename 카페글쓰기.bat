@echo off
chcp 65001 > nul
title Cafe Auto Writer

echo.
echo ========================================
echo    Cafe Auto Writer - 24h Auto Run
echo    Press Ctrl+C to stop
echo ========================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not installed
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing packages...
    call npm install
    echo.
)

:restart
echo [%date% %time%] Starting cafe writer...
echo.

node cafe_writer.js

echo.
echo [%date% %time%] Program ended.
echo Restarting in 10 seconds...
echo.

timeout /t 10 /nobreak
goto restart
