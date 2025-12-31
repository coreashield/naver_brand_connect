@echo off
chcp 65001 > nul
title 네이버 블로그 자동 작성 프로그램

echo.
echo ╔════════════════════════════════════════╗
echo ║    네이버 블로그 자동 작성 프로그램    ║
echo ║         Shopping Connect Edition       ║
echo ╚════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Node.js 설치 확인
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js를 설치해주세요.
    pause
    exit /b 1
)

:: 의존성 확인
if not exist "node_modules" (
    echo 필요한 패키지를 설치합니다...
    call npm install
    echo.
)

:: 앱 실행
node app.js

pause
