@echo off
title Blog Auto Writer

cd /d "%~dp0\.."

echo.
echo ========================================
echo   Naver Blog Auto Writer
echo   Supabase + Gemini AI
echo   Press Ctrl+C to stop
echo ========================================
echo.

node src/writers/blog_writer_supabase.js

pause
