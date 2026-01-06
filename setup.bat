@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo ========================================
echo   Naver Brand Connect Install
echo ========================================
echo.

set "DOWNLOAD_URL=https://github.com/coreashield/naver_brand_connect/releases/download/v1.0/portable_package.zip"
set "ZIP_FILE=portable_package.zip"
set "EXTRACT_DIR=packages"

:: Check if already installed
if exist "%EXTRACT_DIR%\node\node.exe" (
    echo [!] Already installed.
    echo     Delete packages folder to reinstall.
    echo.
    pause
    exit /b 0
)

:: Check for curl
where curl >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] curl not found.
    echo     Windows 10 or later required.
    pause
    exit /b 1
)

echo [1/3] Downloading package... (about 324MB)
echo       URL: %DOWNLOAD_URL%
echo.

curl -L -o "%ZIP_FILE%" "%DOWNLOAD_URL%"
if %errorlevel% neq 0 (
    echo.
    echo [X] Download failed!
    echo     Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/3] Extracting...

:: Create packages directory if not exists
if not exist "%EXTRACT_DIR%" mkdir "%EXTRACT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"
if %errorlevel% neq 0 (
    echo.
    echo [X] Extraction failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Cleaning up...
del "%ZIP_FILE%" 2>nul

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo   Usage:
echo   - Blog: START_BLOG.bat (in packages folder)
echo   - Cafe: START_CAFE.bat (in packages folder)
echo.
echo   Note: Configure .env file with your credentials
echo         (see .env.sample for reference)
echo.
pause
