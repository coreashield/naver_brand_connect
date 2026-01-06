@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================
echo   카페 자동 글쓰기 (Supabase)
echo   Ctrl+C로 종료
echo ========================================
echo.
node src/writers/cafe_writer_supabase.js
pause
