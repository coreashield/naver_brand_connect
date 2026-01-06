@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PATH=%~dp0node;%PATH%
echo Supabase Connection Test
echo.
node test_supabase.js
pause
