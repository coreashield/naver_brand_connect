@echo off
chcp 65001 > nul
title 포터블 패키지 생성기

echo.
echo ╔════════════════════════════════════════╗
echo ║     포터블 패키지 생성기               ║
echo ║     VM에서 설치 없이 실행 가능         ║
echo ╚════════════════════════════════════════╝
echo.

cd /d "%~dp0"

set PORTABLE_DIR=%~dp0portable_package
set NODE_VERSION=20.10.0

echo [1/5] 폴더 구조 생성...
if not exist "%PORTABLE_DIR%\app" mkdir "%PORTABLE_DIR%\app"
if not exist "%PORTABLE_DIR%\node" mkdir "%PORTABLE_DIR%\node"

echo [2/5] Node.js 포터블 다운로드 중... (약 30MB)
echo       (이미 있으면 건너뜁니다)
if not exist "%PORTABLE_DIR%\node\node.exe" (
    echo       다운로드: node-v%NODE_VERSION%-win-x64.zip
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip' -OutFile '%PORTABLE_DIR%\node.zip'"
    echo       압축 해제 중...
    powershell -Command "Expand-Archive -Path '%PORTABLE_DIR%\node.zip' -DestinationPath '%PORTABLE_DIR%' -Force"
    move "%PORTABLE_DIR%\node-v%NODE_VERSION%-win-x64\*" "%PORTABLE_DIR%\node\" >nul 2>&1
    rmdir "%PORTABLE_DIR%\node-v%NODE_VERSION%-win-x64" >nul 2>&1
    del "%PORTABLE_DIR%\node.zip" >nul 2>&1
    echo       Node.js 다운로드 완료!
) else (
    echo       Node.js 이미 존재함
)

echo [3/5] 프로젝트 파일 복사 중...
:: 필요한 파일들만 복사
copy /Y "%~dp0cafe_writer.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0app.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0blog_writer.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0link_crawler.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0title_suffixes.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0content_templates.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0image_handler.js" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0package.json" "%PORTABLE_DIR%\app\" >nul 2>&1
copy /Y "%~dp0.env" "%PORTABLE_DIR%\app\" >nul 2>&1

:: src 폴더 복사
if exist "%~dp0src" (
    xcopy /E /I /Y "%~dp0src" "%PORTABLE_DIR%\app\src" >nul 2>&1
)
:: config 폴더 복사
if exist "%~dp0config" (
    xcopy /E /I /Y "%~dp0config" "%PORTABLE_DIR%\app\config" >nul 2>&1
)
:: output 폴더 생성
if not exist "%PORTABLE_DIR%\app\output" mkdir "%PORTABLE_DIR%\app\output"

echo       파일 복사 완료!

echo [4/5] npm 패키지 설치 중... (시간이 좀 걸립니다)
cd "%PORTABLE_DIR%\app"
"%PORTABLE_DIR%\node\npm.cmd" install --omit=dev
echo       패키지 설치 완료!

echo [5/5] Playwright 브라우저 설치 중... (약 200MB)
set PLAYWRIGHT_BROWSERS_PATH=%PORTABLE_DIR%\browsers
"%PORTABLE_DIR%\node\npx.cmd" playwright install chromium
echo       브라우저 설치 완료!

cd "%~dp0"

echo.
echo ╔════════════════════════════════════════╗
echo ║     포터블 패키지 생성 완료!           ║
echo ╚════════════════════════════════════════╝
echo.
echo 생성된 폴더: %PORTABLE_DIR%
echo.
echo 이 폴더를 VM에 통째로 복사하세요.
echo VM에서 "카페글쓰기.bat" 또는 "블로그작성.bat" 실행
echo.
pause
