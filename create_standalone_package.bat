@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo   Standalone Package Creator
echo   (Node.js Portable + All Dependencies)
echo   No installation required on target!
echo ========================================
echo.

:: Create standalone folder
set PKG_NAME=cafe_standalone
if exist "%PKG_NAME%" rmdir /s /q %PKG_NAME%
mkdir %PKG_NAME%
mkdir %PKG_NAME%\output
mkdir %PKG_NAME%\node

:: Download Node.js portable if not exists
set NODE_VERSION=v20.10.0
set NODE_ZIP=node-%NODE_VERSION%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ZIP%

if not exist "node_portable\node.exe" (
    echo.
    echo Downloading Node.js Portable...
    echo URL: %NODE_URL%
    echo.

    mkdir node_portable 2>nul

    :: Use PowerShell to download
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'"

    if exist "%NODE_ZIP%" (
        echo Extracting...
        powershell -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath 'node_portable' -Force"
        move "node_portable\node-%NODE_VERSION%-win-x64\*" "node_portable\" >nul 2>nul
        rmdir "node_portable\node-%NODE_VERSION%-win-x64" 2>nul
        del "%NODE_ZIP%"
        echo Node.js Portable ready!
    ) else (
        echo [ERROR] Failed to download Node.js
        echo Please download manually from https://nodejs.org
        pause
        exit /b 1
    )
)

:: Copy Node.js portable
echo.
echo Copying Node.js portable...
xcopy node_portable\* %PKG_NAME%\node\ /E /I /Q

:: Copy scripts
echo Copying scripts...
copy cafe_writer.js %PKG_NAME%\
copy package.json %PKG_NAME%\

:: Copy .env
if exist ".env" (
    copy .env %PKG_NAME%\
) else (
    echo NAVER_ID = your_id > %PKG_NAME%\.env
    echo NAVER_PW = your_password >> %PKG_NAME%\.env
    echo CAFE_ADR = https://cafe.naver.com/your-cafe-url >> %PKG_NAME%\.env
    echo GEMINI_API_KEY = your_gemini_api_key >> %PKG_NAME%\.env
)

:: Copy node_modules
echo Copying node_modules...
xcopy node_modules %PKG_NAME%\node_modules\ /E /I /Q

:: Install Playwright browsers to package
echo.
echo Installing Playwright browsers...
set PLAYWRIGHT_BROWSERS_PATH=%cd%\%PKG_NAME%\browsers
call %PKG_NAME%\node\npx.cmd playwright install chromium

:: Create START.bat
echo @echo off > %PKG_NAME%\START.bat
echo chcp 65001 ^> nul >> %PKG_NAME%\START.bat
echo cd /d "%%~dp0" >> %PKG_NAME%\START.bat
echo. >> %PKG_NAME%\START.bat
echo set PATH=%%~dp0node;%%PATH%% >> %PKG_NAME%\START.bat
echo set PLAYWRIGHT_BROWSERS_PATH=%%~dp0browsers >> %PKG_NAME%\START.bat
echo. >> %PKG_NAME%\START.bat
echo echo ======================================== >> %PKG_NAME%\START.bat
echo echo   Cafe Auto Writer >> %PKG_NAME%\START.bat
echo echo   Ctrl+C to stop >> %PKG_NAME%\START.bat
echo echo ======================================== >> %PKG_NAME%\START.bat
echo echo. >> %PKG_NAME%\START.bat
echo. >> %PKG_NAME%\START.bat
echo node\node.exe cafe_writer.js >> %PKG_NAME%\START.bat
echo. >> %PKG_NAME%\START.bat
echo echo. >> %PKG_NAME%\START.bat
echo pause >> %PKG_NAME%\START.bat

:: Create README
(
echo ========================================
echo   Cafe Auto Writer - Standalone Package
echo ========================================
echo.
echo No installation required!
echo.
echo ## Setup:
echo 1. Edit .env file with your credentials:
echo    - NAVER_ID = your naver id
echo    - NAVER_PW = your naver password
echo    - CAFE_ADR = cafe write url
echo    - GEMINI_API_KEY = your gemini api key
echo.
echo 2. Put product_links.json in output folder
echo.
echo 3. Double-click START.bat to run
echo.
echo ## Files:
echo    START.bat - Run this to start
echo    .env - Your credentials ^(edit this^)
echo    output/ - Put product_links.json here
echo    node/ - Node.js portable ^(don't touch^)
echo    browsers/ - Chromium ^(don't touch^)
echo.
) > %PKG_NAME%\README.txt

echo.
echo ========================================
echo   Standalone Package Created!
echo ========================================
echo.
echo Folder: %PKG_NAME%
echo.
echo This package includes everything:
echo   - Node.js portable (no install needed)
echo   - All dependencies
echo   - Chromium browser
echo.
echo Just copy the folder and run START.bat!
echo.
pause
