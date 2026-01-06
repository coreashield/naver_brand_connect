@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%
echo ========================================
echo   Blog Writer - Supabase
echo   Ctrl+C to stop
echo ========================================
echo.
node src/writers/blog_writer_supabase.js
pause
