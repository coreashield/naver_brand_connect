@echo off
chcp 65001 >nul
title Shopping Connect

echo.
echo ╔════════════════════════════════════════════════╗
echo ║     Shopping Connect 시작                      ║
echo ╚════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Node.js 확인
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

:: 파라미터가 있으면 해당 스크립트 직접 실행
if "%1"=="cafe" (
    node src/writers/cafe_writer_supabase.js
    goto :end
)
if "%1"=="blog" (
    node src/writers/blog_writer_supabase.js
    goto :end
)
if "%1"=="sync" (
    node full_sync_supabase.js
    goto :end
)
if "%1"=="ui" (
    node serve_ui.js
    goto :end
)
if "%1"=="update" (
    node updater.js
    goto :end
)

:: 메뉴 실행
node start.js

:end
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] 오류가 발생했습니다.
    pause
)
