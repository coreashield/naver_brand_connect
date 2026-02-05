@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PATH=%~dp0node;%PATH%

echo ========================================
echo   상품 저장 + 상세정보 업데이트
echo ========================================
echo.
echo   [1단계] 링크 발급 + DB 저장
echo   [2단계] 상세정보 크롤링
echo.
echo   아무 키나 누르면 시작합니다...
pause >nul

echo.
echo [1단계] 링크 발급 시작...
echo.
node daily_link_issuer.js

echo.
echo [2단계] 상세정보 크롤링 시작...
echo.
node src/crawlers/batch_update_products.js

echo.
echo ========================================
echo   모든 작업 완료!
echo ========================================
pause
