@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ========================================
echo   Auto Link Issuer
echo   Issues affiliate links for all new products
echo   Press Ctrl+C to stop
echo ========================================
echo.

node auto_link_issuer.js

echo.
echo ========================================
echo   Link issuing complete!
echo   Now run link_crawler.js to collect data
echo ========================================
echo.
pause
