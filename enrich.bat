@echo off
chcp 65001 > nul
title 상품 정보 보강 (Product Enricher)

echo ╔════════════════════════════════════════════════╗
echo ║   상품 정보 보강 도구 (Product Enricher)        ║
echo ║   naver_shopping_url + rating + brand 수집     ║
echo ╚════════════════════════════════════════════════╝
echo.

:: 실행 경로 설정
cd /d "%~dp0"

:: Node.js 경로 설정 (portable 버전 사용)
set PATH=%~dp0node;%PATH%
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

:: 환경 정보 출력
echo [환경 정보]
echo   실행 경로: %~dp0
echo   Node 경로: %~dp0node
echo   브라우저: %PLAYWRIGHT_BROWSERS_PATH%
node --version 2>nul || echo   Node.js를 찾을 수 없습니다!
echo.

:: 모드 선택
echo ════════════════════════════════════════════════
echo  [모드 선택]
echo ════════════════════════════════════════════════
echo.
echo  [1] URL 수집 모드 (Mode 1)
echo      - naver_shopping_url이 없는 상품 대상
echo      - affiliate 링크에서 URL만 수집
echo      - 봇 차단 환경에서 사용 (URL만 저장)
echo.
echo  [2] 정보 파싱 모드 (Mode 2)
echo      - URL은 있지만 rating/brand가 없는 상품 대상
echo      - 저장된 URL에서 상품정보 파싱
echo      - 정상 환경에서 사용 (직접 접속)
echo.
set /p MODE_CHOICE="모드를 선택하세요 (1-2): "

if "%MODE_CHOICE%"=="1" set MODE=1
if "%MODE_CHOICE%"=="2" set MODE=2

if not defined MODE (
    echo 잘못된 선택입니다. 1 또는 2를 입력하세요.
    pause
    exit /b
)

echo.
echo ════════════════════════════════════════════════
echo  [상품 수 선택]
echo ════════════════════════════════════════════════
echo.
echo [1] 100개 상품 보강 (기본)
echo [2] 500개 상품 보강
echo [3] 1000개 상품 보강
echo [4] 전체 상품 보강
echo [5] 사용자 지정
echo.
set /p LIMIT_CHOICE="선택하세요 (1-5): "

if "%LIMIT_CHOICE%"=="1" set LIMIT=100
if "%LIMIT_CHOICE%"=="2" set LIMIT=500
if "%LIMIT_CHOICE%"=="3" set LIMIT=1000
if "%LIMIT_CHOICE%"=="4" set LIMIT=10000
if "%LIMIT_CHOICE%"=="5" (
    set /p LIMIT="보강할 상품 수를 입력하세요: "
)

if not defined LIMIT set LIMIT=100

echo.
if "%MODE%"=="1" (
    echo [Mode 1] URL 수집 모드로 %LIMIT%개 상품 보강을 시작합니다...
) else (
    echo [Mode 2] 정보 파싱 모드로 %LIMIT%개 상품 보강을 시작합니다...
)
echo CAPTCHA가 나타나면 30초 내에 수동으로 해결해주세요.
echo.

:: 실행
node src/crawlers/product_enricher.js --mode=%MODE% --limit=%LIMIT%

echo.
echo ════════════════════════════════════════════════
echo 보강 작업이 완료되었습니다.
echo ════════════════════════════════════════════════
pause
