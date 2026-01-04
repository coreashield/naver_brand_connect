@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ========================================
echo   Blog Auto Writer (Gemini AI)
echo   Auto product selection from JSON
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not installed.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing packages...
    call npm install
    echo.
)

node blog_writer.js

echo.
echo ========================================
echo   Done!
echo ========================================
pause
