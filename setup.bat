@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo ========================================
echo   Naver Brand Connect 설치 프로그램
echo ========================================
echo.

set "DOWNLOAD_URL=https://github.com/coreashield/naver_brand_connect/releases/download/v1.0/portable_package.zip"
set "ZIP_FILE=portable_package.zip"
set "EXTRACT_DIR=packages"

:: Check if already installed
if exist "%EXTRACT_DIR%\supabase_standalone\node\node.exe" (
    echo [!] 이미 설치되어 있습니다.
    echo     재설치하려면 packages 폴더를 삭제 후 다시 실행하세요.
    echo.
    pause
    exit /b 0
)

:: Check for curl
where curl >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] curl이 설치되어 있지 않습니다.
    echo     Windows 10 이상이 필요합니다.
    pause
    exit /b 1
)

echo [1/3] 패키지 다운로드 중... (약 500MB)
echo       다운로드 URL: %DOWNLOAD_URL%
echo.

curl -L -o "%ZIP_FILE%" "%DOWNLOAD_URL%"
if %errorlevel% neq 0 (
    echo.
    echo [X] 다운로드 실패!
    echo     인터넷 연결을 확인하세요.
    pause
    exit /b 1
)

echo.
echo [2/3] 압축 해제 중...

:: Create packages directory if not exists
if not exist "%EXTRACT_DIR%" mkdir "%EXTRACT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"
if %errorlevel% neq 0 (
    echo.
    echo [X] 압축 해제 실패!
    pause
    exit /b 1
)

echo.
echo [3/3] 정리 중...
del "%ZIP_FILE%" 2>nul

echo.
echo ========================================
echo   설치 완료!
echo ========================================
echo.
echo   사용 방법:
echo   - 블로그 글쓰기: 블로그자동작성.bat 실행
echo   - 카페 글쓰기: 카페글쓰기.bat 실행
echo.
echo   주의: .env 파일에 계정 정보를 설정하세요.
echo         (.env.sample 파일 참고)
echo.
pause
