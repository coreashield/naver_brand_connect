@echo off
chcp 65001 > nul
title Brand Connect 상품 크롤러

echo.
echo ╔════════════════════════════════════════╗
echo ║    Brand Connect 상품 크롤러           ║
echo ║    패션의류/패션잡화/디지털가전        ║
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

:: 크롤러 실행 (발급 링크 페이지에서 수집)
node link_crawler.js

pause
