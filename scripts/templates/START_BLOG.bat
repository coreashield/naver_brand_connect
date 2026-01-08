@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%

echo ========================================
echo   Blog Writer - Supabase
echo   (with AI Style Randomization)
echo ========================================
echo.
echo   [Browser Mode]
echo   1. Show browser (default)
echo   2. Hide browser (background)
echo.
set /p MODE="Enter choice (1 or 2): "

if "%MODE%"=="2" (
    set HEADLESS=true
    echo   Running in background mode...
) else (
    set HEADLESS=false
    echo   Running with visible browser...
)

echo.
echo   [Writing Styles - Randomly Selected]
echo   - Friendly Review / Expert Analysis
echo   - Daily Episode / Comparison
echo   - Emotional Share / Practical Info
echo   - Trend Intro / Value Analysis
echo.
echo   Ctrl+C to stop
echo ========================================
echo.
node src/writers/blog_writer_supabase.js
pause
