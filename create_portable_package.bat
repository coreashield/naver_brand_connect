@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo   Portable Package Creator
echo   (Node.js + Playwright + Scripts)
echo ========================================
echo.

:: Create portable folder
if exist "cafe_portable_package" rmdir /s /q cafe_portable_package
mkdir cafe_portable_package
mkdir cafe_portable_package\output

:: Copy scripts
echo Copying scripts...
copy cafe_writer.js cafe_portable_package\
copy package.json cafe_portable_package\
copy .env cafe_portable_package\ 2>nul
copy .env.example cafe_portable_package\.env.example 2>nul

:: Copy node_modules
echo Copying node_modules (this may take a while)...
xcopy node_modules cafe_portable_package\node_modules\ /E /I /Q

:: Install Playwright browsers to portable folder
echo.
echo Installing Playwright browsers to portable folder...
set PLAYWRIGHT_BROWSERS_PATH=%cd%\cafe_portable_package\browsers
npx playwright install chromium

:: Create run script
echo @echo off > cafe_portable_package\START.bat
echo chcp 65001 ^> nul >> cafe_portable_package\START.bat
echo cd /d "%%~dp0" >> cafe_portable_package\START.bat
echo set PLAYWRIGHT_BROWSERS_PATH=%%~dp0browsers >> cafe_portable_package\START.bat
echo. >> cafe_portable_package\START.bat
echo echo ======================================== >> cafe_portable_package\START.bat
echo echo   Cafe Auto Writer >> cafe_portable_package\START.bat
echo echo   Press Ctrl+C to stop >> cafe_portable_package\START.bat
echo echo ======================================== >> cafe_portable_package\START.bat
echo echo. >> cafe_portable_package\START.bat
echo. >> cafe_portable_package\START.bat
echo node cafe_writer.js >> cafe_portable_package\START.bat
echo pause >> cafe_portable_package\START.bat

:: Create README
echo # Cafe Writer Portable Package > cafe_portable_package\README.txt
echo. >> cafe_portable_package\README.txt
echo ## Requirements >> cafe_portable_package\README.txt
echo - Node.js must be installed (https://nodejs.org) >> cafe_portable_package\README.txt
echo. >> cafe_portable_package\README.txt
echo ## Setup >> cafe_portable_package\README.txt
echo 1. Edit .env file with your NAVER_ID, NAVER_PW, GEMINI_API_KEY >> cafe_portable_package\README.txt
echo 2. Put product_links.json in output folder >> cafe_portable_package\README.txt
echo 3. Double-click START.bat >> cafe_portable_package\README.txt

echo.
echo ========================================
echo   Package Created!
echo ========================================
echo.
echo Folder: cafe_portable_package
echo.
echo Contains:
echo   - cafe_writer.js
echo   - node_modules (dependencies)
echo   - browsers (Chromium)
echo   - START.bat (run script)
echo   - .env.example
echo.
echo NOTE: Target machine needs Node.js installed!
echo       Download from https://nodejs.org
echo.
pause
