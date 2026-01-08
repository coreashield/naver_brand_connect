@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%

echo ========================================
echo   Product Detail Batch Update
echo ========================================
echo.
echo   This will crawl all products and update
echo   detailed info (category, brand, rating, etc.)
echo.
echo   CAPTCHA may appear - please solve manually
echo.
echo   Press any key to start...
pause >nul
echo.
echo ========================================
echo.
node src/crawlers/batch_update_products.js
echo.
echo ========================================
echo   Update completed!
echo ========================================
pause
