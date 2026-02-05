@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PATH=%~dp0node;%PATH%
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

echo ========================================
echo   Product Save + Detail Update
echo ========================================
echo.
node --version
echo.
echo Starting daily_link_issuer.js...
node daily_link_issuer.js

echo.
echo Starting batch_update_products.js...
node src/crawlers/batch_update_products.js

echo.
echo Done!
pause
