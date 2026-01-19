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

:: 실행 옵션 선택
echo [1] 100개 상품 보강 (기본)
echo [2] 500개 상품 보강
echo [3] 1000개 상품 보강
echo [4] 전체 상품 보강
echo [5] 사용자 지정
echo.
set /p choice="선택하세요 (1-5): "

if "%choice%"=="1" set LIMIT=100
if "%choice%"=="2" set LIMIT=500
if "%choice%"=="3" set LIMIT=1000
if "%choice%"=="4" set LIMIT=10000
if "%choice%"=="5" (
    set /p LIMIT="보강할 상품 수를 입력하세요: "
)

echo.
echo %LIMIT%개 상품 보강을 시작합니다...
echo CAPTCHA가 나타나면 30초 내에 수동으로 해결해주세요.
echo.

:: 실행
node src/crawlers/product_enricher.js --limit=%LIMIT%

echo.
echo ════════════════════════════════════════════════
echo 보강 작업이 완료되었습니다.
echo ════════════════════════════════════════════════
pause
