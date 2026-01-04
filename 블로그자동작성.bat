@echo off
chcp 65001 > nul
title 네이버 블로그 자동 작성 (Gemini AI)

echo.
echo ╔════════════════════════════════════════╗
echo ║   네이버 블로그 자동 작성 프로그램     ║
echo ║        Gemini AI + 이미지 자동        ║
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

:: 제품 URL 입력
echo.
echo 제품 URL을 입력해주세요:
echo (예: https://smartstore.naver.com/... 또는 https://brandconnect.naver.com/...)
echo.
set /p PRODUCT_URL="URL: "

if "%PRODUCT_URL%"=="" (
    echo [오류] URL을 입력해주세요.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  1. 제품 이미지 다운로드 (최대 3장)
echo  2. 제품 정보 크롤링
echo  3. Gemini AI로 원고 생성
echo  4. 블로그 자동 작성
echo ========================================
echo.

:: 블로그 작성 실행
node blog_writer.js "%PRODUCT_URL%"

echo.
echo ========================================
echo  작업 완료!
echo ========================================
pause
