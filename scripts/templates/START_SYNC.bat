@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%
echo ========================================
echo   Full Sync
echo ========================================
echo.
node full_sync_supabase.js
pause
