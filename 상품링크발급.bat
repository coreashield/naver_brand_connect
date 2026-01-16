@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PATH=%~dp0node;%PATH%
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

echo ========================================
echo   상품 링크 발급 (Daily Link Issuer)
echo ========================================
echo.
echo   Phase 1: 링크 발급 (일일 1000개 한도)
echo   Phase 2: naver_shopping_url 추출
echo   DB에 직접 저장됩니다.
echo.
echo   CAPTCHA가 나오면 수동으로 풀어주세요.
echo.
echo   아무 키나 누르면 시작합니다...
pause >nul
echo.
node daily_link_issuer.js
echo.
pause
