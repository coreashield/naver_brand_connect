@echo off
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%

echo ========================================
echo   Auto Writer (Cafe 200 + Blog 2)
echo ========================================
echo.
echo   [Browser Mode]
echo   1. Show browser (default)
echo   2. Background mode
echo.
set /p MODE="Select (1 or 2): "

if "%MODE%"=="2" (
    set HEADLESS=true
    echo   Running in background mode...
) else (
    set HEADLESS=false
    echo   Running with browser visible...
)

echo.
echo   [Workflow]
echo   1. Cafe 200 posts (2-3 min interval)
echo   2. Blog 2 posts (2 hour interval)
echo   3. Wait until midnight
echo   4. Reset and repeat from cafe
echo.
echo   Press Ctrl+C to stop
echo ========================================
echo.
node src/writers/auto_writer.js
pause
