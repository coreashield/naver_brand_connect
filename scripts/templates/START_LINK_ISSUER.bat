@echo off
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%

echo ========================================
echo   Daily Link Issuer
echo ========================================
echo.
echo   Phase 1: Issue links (1000/day limit)
echo   Phase 2: Extract naver_shopping_url
echo.
echo   Press any key to start...
pause >nul
echo.
node daily_link_issuer.js
pause
