@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo   Portable EXE Build Script
echo ========================================
echo.

:: 1. Check if pkg is installed
where pkg >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing pkg globally...
    call npm install -g pkg
)

:: 2. Create portable folder
if exist "portable" rmdir /s /q portable
mkdir portable
mkdir portable\output
mkdir portable\browsers

echo.
echo Building EXE file...
echo.

:: 3. Build exe with pkg (ESM support)
call npx pkg cafe_portable.js --targets node18-win-x64 --output portable\cafe_writer.exe --options "experimental-specifier-resolution=node"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Trying alternative method...
    echo.

    :: Alternative: bundle first then pkg
    call npm install -g esbuild
    call esbuild cafe_portable.js --bundle --platform=node --outfile=portable\bundle.cjs --format=cjs --external:playwright
    call npx pkg portable\bundle.cjs --targets node18-win-x64 --output portable\cafe_writer.exe
)

:: 4. Copy required files
echo.
echo Copying required files...
copy .env.example portable\.env.example
copy .env portable\.env 2>nul

:: 5. Copy Playwright browsers
echo.
echo Copying Playwright browsers...
echo This may take a while...

set PLAYWRIGHT_PATH=%LOCALAPPDATA%\ms-playwright
if exist "%PLAYWRIGHT_PATH%" (
    xcopy "%PLAYWRIGHT_PATH%\chromium-*" "portable\browsers\" /E /I /Q
    echo Browsers copied.
) else (
    echo [WARNING] Playwright browsers not found at %PLAYWRIGHT_PATH%
    echo Please run: npx playwright install chromium
)

:: 6. Create run script
echo @echo off > portable\run.bat
echo cd /d "%%~dp0" >> portable\run.bat
echo cafe_writer.exe >> portable\run.bat
echo pause >> portable\run.bat

:: 7. Create README
echo # Cafe Writer Portable > portable\README.txt
echo. >> portable\README.txt
echo 1. Edit .env file with your credentials >> portable\README.txt
echo 2. Put product_links.json in output folder >> portable\README.txt
echo 3. Run cafe_writer.exe or run.bat >> portable\README.txt

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Portable folder created with:
echo   - cafe_writer.exe
echo   - .env.example
echo   - browsers\ (Chromium)
echo   - output\ (for product_links.json)
echo.
echo Copy the entire 'portable' folder to deploy.
echo.
pause
