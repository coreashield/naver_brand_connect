@echo off
chcp 65001 > nul
cd /d "%~dp0.."

echo.
echo ========================================
echo   Full Sync - All in One
echo   1. Issue new product links
echo   2. Crawl issued links
echo   3. Update product_links.json
echo   Press Ctrl+C to stop
echo ========================================
echo.

node full_sync.js

echo.
pause
